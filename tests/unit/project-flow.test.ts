import { describe, expect, test } from "bun:test";
import { HostProjectService } from "../../apps/studio/bunium/services/project-service";
import { StudioStore } from "../../apps/studio/bunium/services/store";
import {
  type CredentialApi,
  createSecretVault,
} from "../../apps/studio/bunium/services/vault";
import type { Platform } from "../../apps/studio/src/contracts/entities";
import {
  type ProjectService,
  ProjectServiceError,
} from "../../apps/studio/src/contracts/project-service";
import { ProjectController } from "../../apps/studio/src/features/project/controller";
import {
  emptyDraft,
  type ProjectDraft,
  validateDraft,
} from "../../apps/studio/src/features/project/draft";

const TOKEN = "123456789:AAHfakeTokenForTestsOnly_abcdefghijkl";
const TOKEN_2 = "987654321:BBHotherFakeTokenForTests_mnopqrstuvwx";

function memoryApi() {
  const entries = new Map<string, string>();
  const key = (service: string, name: string) => `${service}\u0000${name}`;
  const api: CredentialApi = {
    async delete({ service, name }) {
      return entries.delete(key(service, name));
    },
    async get({ service, name }) {
      return entries.get(key(service, name)) ?? null;
    },
    async set({ service, name, value }) {
      entries.set(key(service, name), value);
    },
  };
  return { api, entries };
}

async function setup(
  options: { launch?: (platform: Platform) => Promise<void> } = {},
) {
  const store = new StudioStore();
  const { api, entries } = memoryApi();
  const vault = await createSecretVault({ api, platform: "darwin" });
  let created = 0;
  const identities = [{ id: "mock-1", kind: "mock" as const, label: "Alex" }];
  const service = new HostProjectService(store, vault, {
    createIdentity: async () => {
      created += 1;
      identities.push({
        id: `mock-new-${created}`,
        kind: "mock",
        label: "New",
      });
      return `mock-new-${created}`;
    },
    identities: () => [...identities],
    ...(options.launch
      ? {
          launch: (_project, platform) =>
            options.launch?.(platform) ?? Promise.resolve(),
        }
      : {}),
    newId: () => `project-${store.getSnapshot().projects.length + 1}`,
  });
  return { entries, service, store };
}

function controllerFor(
  service: ProjectService,
  projectId?: string,
  onClose: () => void = () => undefined,
) {
  return new ProjectController({
    avatarColorIndex: 3,
    onClose,
    ...(projectId ? { projectId } : {}),
    service,
  });
}

const fill = (draft: ProjectDraft): ProjectDraft => ({
  ...draft,
  name: "Orbit Store",
  url: "http://localhost:3000",
});

describe("project draft validation", () => {
  const base = { ...emptyDraft({ avatarColorIndex: 0, identityId: "mock-1" }) };

  test("requires name and a credential-free http(s) URL", () => {
    expect(validateDraft(base, { hasStoredToken: false })).toMatchObject({
      name: "required",
      url: "required",
    });
    const errors = validateDraft(
      { ...fill(base), url: "https://user:pw@example.com" },
      { hasStoredToken: false },
    );
    expect(errors.url).toBe("credentialsInUrl");
    expect(
      validateDraft(
        { ...fill(base), url: "file:///etc/hosts" },
        {
          hasStoredToken: false,
        },
      ).url,
    ).toBe("invalidUrl");
    expect(validateDraft(fill(base), { hasStoredToken: false })).toEqual({});
  });

  test("checks token format and that HMAC signing has a token", () => {
    const signed = { ...fill(base), signing: "bot-token" as const };
    expect(validateDraft(signed, { hasStoredToken: false }).signing).toBe(
      "signingNeedsToken",
    );
    expect(validateDraft(signed, { hasStoredToken: true })).toEqual({});
    expect(
      validateDraft(
        { ...signed, token: { kind: "remove" } },
        { hasStoredToken: true },
      ).signing,
    ).toBe("signingNeedsToken");
    expect(
      validateDraft(
        { ...fill(base), token: { kind: "set", value: "nope" } },
        { hasStoredToken: false },
      ).token,
    ).toBe("invalidToken");
  });

  test("validates typed launch parameters and splash colors", () => {
    const errors = validateDraft(
      {
        ...fill(base),
        chat: { enabled: true, id: "abc", title: "", type: "group" },
        receiver: { enabled: true, firstName: "Sam", id: "-100123" },
        splash: { ...base.splash, lightBackground: "white" },
        startParam: "has space",
      },
      { hasStoredToken: false },
    );
    expect(errors).toEqual({
      "chat.id": "invalidId",
      "chat.title": "required",
      "splash.lightBackground": "invalidColor",
      startParam: "invalidStartParam",
    });
  });
});

describe("project window flows against the real store and vault", () => {
  test("create: invalid save stores nothing, valid save persists and enables launch", async () => {
    const { entries, service, store } = await setup();
    const controller = controllerFor(service);
    await controller.load();
    expect(controller.snapshot.draft.identityId).toBe("mock-1");
    expect(controller.canLaunch).toBe(false);

    expect(await controller.save()).toBe(false);
    expect(controller.snapshot.showErrors).toBe(true);
    expect(store.getSnapshot().projects).toHaveLength(0);

    controller.edit((draft) => ({
      ...fill(draft),
      token: { kind: "set", value: TOKEN },
    }));
    expect(await controller.save()).toBe(true);
    const { project, hasToken } = controller.snapshot as unknown as {
      project: { botTokenRef: string; id: string };
      hasToken: boolean;
    };
    expect(hasToken).toBe(true);
    expect(project.botTokenRef).toMatch(/^vault:v1:/u);
    expect(entries.size).toBe(1);
    expect(controller.canLaunch).toBe(true);
    expect(controller.dirty).toBe(false);
    // The renderer state carries no secret after save.
    expect(JSON.stringify(controller.snapshot)).not.toContain(TOKEN);
    expect(JSON.stringify(store.getSnapshot())).not.toContain(TOKEN);
  });

  test("launch uses the saved project and reports unavailability honestly", async () => {
    const launched: Platform[] = [];
    const { service } = await setup();
    const controller = controllerFor(service);
    await controller.load();
    await controller.launch("android");
    expect(controller.snapshot.launchError).toBeNull();
    controller.edit(fill);
    await controller.save();
    await controller.launch("ios");
    expect(controller.snapshot.launchError).toBe("UNAVAILABLE");

    const withLauncher = await setup({
      launch: async (platform) => {
        launched.push(platform);
      },
    });
    const ready = controllerFor(withLauncher.service);
    await ready.load();
    ready.edit(fill);
    await ready.save();
    for (const platform of [
      "android",
      "ios",
      "tdesktop",
      "macos",
      "weba",
      "webk",
    ] as const) {
      await ready.launch(platform);
    }
    expect(launched).toEqual([
      "android",
      "ios",
      "tdesktop",
      "macos",
      "weba",
      "webk",
    ]);
  });

  test("dirty close offers save/discard/cancel and never loses the draft on cancel", async () => {
    const { service, store } = await setup();
    let closed = 0;
    const creator = controllerFor(service);
    await creator.load();
    creator.edit(fill);
    await creator.save();
    const id = creator.snapshot.project?.id ?? "";

    const controller = controllerFor(service, id, () => {
      closed += 1;
    });
    await controller.load();
    controller.requestClose();
    expect(closed).toBe(1);

    controller.edit((draft) => ({ ...draft, name: "Renamed" }));
    controller.requestClose();
    expect(controller.snapshot.closePrompt).toBe(true);
    await controller.resolveClose("cancel");
    expect(controller.snapshot.draft.name).toBe("Renamed");
    expect(closed).toBe(1);

    controller.requestClose();
    await controller.resolveClose("discard");
    expect(closed).toBe(2);
    expect(store.getProject(id).project.name).toBe("Orbit Store");

    controller.requestClose();
    await controller.resolveClose("save");
    expect(closed).toBe(3);
    expect(store.getProject(id).project.name).toBe("Renamed");
  });

  test("revision conflict keeps the draft; overwrite or reload resolve it", async () => {
    const { service, store } = await setup();
    const creator = controllerFor(service);
    await creator.load();
    creator.edit(fill);
    await creator.save();
    const id = creator.snapshot.project?.id ?? "";

    const first = controllerFor(service, id);
    const second = controllerFor(service, id);
    await first.load();
    await second.load();
    first.edit((draft) => ({ ...draft, url: "https://example.com" }));
    await first.save();

    second.edit((draft) => ({ ...draft, name: "Mine" }));
    expect(await second.save()).toBe(false);
    expect(second.snapshot.conflict?.url).toBe("https://example.com");
    expect(second.snapshot.draft.name).toBe("Mine");
    expect(store.getProject(id).project.name).toBe("Orbit Store");

    expect(await second.resolveConflict("overwrite")).toBe(true);
    const saved = store.getProject(id).project;
    expect(saved.name).toBe("Mine");
    // Overwrite patches only changed fields, so the other editor's URL survives.
    expect(saved.url).toBe("https://example.com");

    first.edit((draft) => ({ ...draft, name: "Theirs" }));
    expect(await first.save()).toBe(false);
    expect(await first.resolveConflict("reload")).toBe(true);
    expect(first.snapshot.draft.name).toBe("Mine");
    expect(first.dirty).toBe(false);
  });

  test("failed persistence keeps the draft dirty and shows no saved state", async () => {
    const { service, store } = await setup();
    const creator = controllerFor(service);
    await creator.load();
    creator.edit(fill);
    await creator.save();
    const id = creator.snapshot.project?.id ?? "";
    const failing: ProjectService = {
      ...service,
      createIdentity: () => service.createIdentity(),
      launch: (a, b) => service.launch(a, b),
      listIdentities: () => service.listIdentities(),
      load: (a) => service.load(a),
      create: (a, b) => service.create(a, b),
      update: async () => {
        throw new ProjectServiceError("INTERNAL");
      },
    };
    const controller = controllerFor(failing, id);
    await controller.load();
    controller.edit((draft) => ({ ...draft, name: "Unsaved" }));
    expect(await controller.save()).toBe(false);
    expect(controller.snapshot.saveError).toBe("INTERNAL");
    expect(controller.dirty).toBe(true);
    expect(controller.snapshot.draft.name).toBe("Unsaved");
    expect(store.getProject(id).project.name).toBe("Orbit Store");
  });

  test("token replace/remove cleans the vault; stale saves store no secret", async () => {
    const { entries, service, store } = await setup();
    const creator = controllerFor(service);
    await creator.load();
    creator.edit((draft) => ({
      ...fill(draft),
      token: { kind: "set", value: TOKEN },
    }));
    await creator.save();
    const id = creator.snapshot.project?.id ?? "";
    const firstRef = store.getProject(id).project.botTokenRef;

    const editor = controllerFor(service, id);
    await editor.load();
    editor.edit((draft) => ({
      ...draft,
      token: { kind: "set", value: TOKEN_2 },
    }));
    await editor.save();
    const secondRef = store.getProject(id).project.botTokenRef;
    expect(secondRef).not.toBe(firstRef);
    expect(entries.size).toBe(1);

    const stale = controllerFor(service, id);
    await stale.load();
    creator.edit((draft) => ({ ...draft, name: "Bump" }));
    await editor.load();
    editor.edit((draft) => ({ ...draft, name: "Bump" }));
    await editor.save();
    stale.edit((draft) => ({ ...draft, token: { kind: "set", value: TOKEN } }));
    expect(await stale.save()).toBe(false);
    expect(stale.snapshot.conflict).not.toBeNull();
    expect(entries.size).toBe(1);

    const remover = controllerFor(service, id);
    await remover.load();
    remover.edit((draft) => ({ ...draft, token: { kind: "remove" } }));
    await remover.save();
    expect(store.getProject(id).project.botTokenRef).toBeUndefined();
    expect(remover.snapshot.hasToken).toBe(false);
    expect(entries.size).toBe(0);
  });

  test("create-user detour preserves the rest of the draft", async () => {
    const { service } = await setup();
    const controller = controllerFor(service);
    await controller.load();
    controller.edit((draft) => ({
      ...fill(draft),
      startParam: "promo_1",
    }));
    await controller.createIdentity();
    expect(controller.snapshot.draft).toMatchObject({
      identityId: "mock-new-1",
      name: "Orbit Store",
      startParam: "promo_1",
    });
    expect(controller.snapshot.identities.map((i) => i.id)).toContain(
      "mock-new-1",
    );
  });

  test("an unavailable vault blocks the save without creating the project", async () => {
    const store = new StudioStore();
    const service = new HostProjectService(
      store,
      {
        close() {},
        delete: async () => false,
        get: async () => null,
        set: async () => {
          const { VaultUnavailableError } = await import(
            "../../apps/studio/bunium/services/vault"
          );
          throw new VaultUnavailableError();
        },
        status: { backend: "macos-keychain", mode: "system" },
      },
      { identities: () => [{ id: "mock-1", kind: "mock", label: "Alex" }] },
    );
    const controller = controllerFor(service);
    await controller.load();
    controller.edit((draft) => ({
      ...fill(draft),
      token: { kind: "set", value: TOKEN },
    }));
    expect(await controller.save()).toBe(false);
    expect(controller.snapshot.saveError).toBe("VAULT_UNAVAILABLE");
    expect(store.getSnapshot().projects).toHaveLength(0);
    expect(controller.snapshot.draft.token).toEqual({
      kind: "set",
      value: TOKEN,
    });
  });
});
