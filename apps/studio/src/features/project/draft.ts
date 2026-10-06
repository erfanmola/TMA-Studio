import type {
  LaunchMode,
  MockChat,
  Project,
  SplashConfiguration,
} from "../../contracts/entities";

import type { ProjectFields, TokenEdit } from "../../contracts/project-service";

export type { ProjectFields, TokenEdit };

export type ChatDraft = {
  enabled: boolean;
  id: string;
  title: string;
  type: MockChat["type"];
};

export type ReceiverDraft = {
  enabled: boolean;
  firstName: string;
  id: string;
};

export type ProjectDraft = {
  avatarColorIndex: Project["avatarColorIndex"];
  chat: ChatDraft;
  defaultMode: LaunchMode;
  identityId: string;
  name: string;
  receiver: ReceiverDraft;
  signing: "unsigned" | "bot-token";
  splash: SplashConfiguration;
  startParam: string;
  token: TokenEdit;
  url: string;
};

export type DraftField =
  | "name"
  | "url"
  | "identityId"
  | "token"
  | "signing"
  | "startParam"
  | "chat.id"
  | "chat.title"
  | "receiver.id"
  | "receiver.firstName"
  | "splash.title"
  | "splash.lightBackground"
  | "splash.darkBackground";

/** Dictionary keys under `project.errors`. */
export type DraftErrorKey =
  | "required"
  | "tooLong"
  | "invalidUrl"
  | "credentialsInUrl"
  | "invalidToken"
  | "signingNeedsToken"
  | "invalidStartParam"
  | "invalidId"
  | "invalidColor";

export type DraftErrors = Partial<Record<DraftField, DraftErrorKey>>;

const NAME_MAX = 128;
const TITLE_MAX = 128;
const colorPattern = /^#[0-9a-fA-F]{6}$/u;
const tokenPattern = /^\d{5,16}:[A-Za-z0-9_-]{30,64}$/u;
const startParamPattern = /^[A-Za-z0-9_-]{1,512}$/u;
const decimalIdPattern = /^-?\d{1,20}$/u;
const controlCharacter = /\p{Cc}/u;

export function emptyDraft(options: {
  avatarColorIndex: Project["avatarColorIndex"];
  identityId: string;
}): ProjectDraft {
  return {
    avatarColorIndex: options.avatarColorIndex,
    chat: { enabled: false, id: "", title: "", type: "group" },
    defaultMode: "expanded",
    identityId: options.identityId,
    name: "",
    receiver: { enabled: false, firstName: "", id: "" },
    signing: "unsigned",
    splash: {
      darkBackground: "#19191B",
      lightBackground: "#FFFFFF",
      presentation: "telegram",
      title: "",
    },
    startParam: "",
    token: { kind: "keep" },
    url: "",
  };
}

export function draftFromProject(project: Readonly<Project>): ProjectDraft {
  const launch = project.launch;
  const mock = launch.kind === "mock" ? launch : undefined;
  return {
    avatarColorIndex: project.avatarColorIndex,
    chat: mock?.chat
      ? {
          enabled: true,
          id: mock.chat.id,
          title: mock.chat.title,
          type: mock.chat.type,
        }
      : { enabled: false, id: "", title: "", type: "group" },
    defaultMode: project.defaultMode,
    identityId: project.identityId,
    name: project.name,
    receiver: mock?.receiver
      ? {
          enabled: true,
          firstName: mock.receiver.firstName,
          id: mock.receiver.id,
        }
      : { enabled: false, firstName: "", id: "" },
    signing: mock?.signing ?? "unsigned",
    splash: { ...project.splash },
    startParam: launch.startParam ?? "",
    token: { kind: "keep" },
    url: project.url,
  };
}

function checkUrl(value: string): DraftErrorKey | undefined {
  const url = value.trim();
  if (!url) return "required";
  if (url.length > 2048) return "tooLong";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "invalidUrl";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "invalidUrl";
  }
  if (parsed.username || parsed.password) return "credentialsInUrl";
  return undefined;
}

function checkText(value: string, max: number): DraftErrorKey | undefined {
  const text = value.trim();
  if (!text) return "required";
  if (text.length > max) return "tooLong";
  if (controlCharacter.test(text)) return "required";
  return undefined;
}

/**
 * Mirrors the host ProjectSchema bounds so users see localized errors before
 * the host rejects a save. The host remains authoritative.
 */
export function validateDraft(
  draft: ProjectDraft,
  context: { hasStoredToken: boolean },
): DraftErrors {
  const errors: DraftErrors = {};
  const set = (field: DraftField, key: DraftErrorKey | undefined) => {
    if (key) errors[field] = key;
  };

  set("name", checkText(draft.name, NAME_MAX));
  set("url", checkUrl(draft.url));
  if (!draft.identityId) errors.identityId = "required";
  if (
    draft.token.kind === "set" &&
    !tokenPattern.test(draft.token.value.trim())
  ) {
    errors.token = "invalidToken";
  }
  const willHaveToken =
    draft.token.kind === "set" ||
    (draft.token.kind === "keep" && context.hasStoredToken);
  if (draft.signing === "bot-token" && !willHaveToken) {
    errors.signing = "signingNeedsToken";
  }
  if (draft.startParam && !startParamPattern.test(draft.startParam)) {
    errors.startParam = "invalidStartParam";
  }
  if (draft.chat.enabled) {
    if (!decimalIdPattern.test(draft.chat.id)) errors["chat.id"] = "invalidId";
    set("chat.title", checkText(draft.chat.title, TITLE_MAX));
  }
  if (draft.receiver.enabled) {
    if (!decimalIdPattern.test(draft.receiver.id)) {
      errors["receiver.id"] = "invalidId";
    }
    set("receiver.firstName", checkText(draft.receiver.firstName, TITLE_MAX));
  }
  if (draft.splash.title.length > TITLE_MAX) errors["splash.title"] = "tooLong";
  if (!colorPattern.test(draft.splash.lightBackground)) {
    errors["splash.lightBackground"] = "invalidColor";
  }
  if (!colorPattern.test(draft.splash.darkBackground)) {
    errors["splash.darkBackground"] = "invalidColor";
  }
  return errors;
}

export function hasErrors(errors: DraftErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** Persistable fields (token handled separately through the host vault). */
export function fieldsFromDraft(draft: ProjectDraft): ProjectFields {
  const splashTitle = draft.splash.title.trim();
  return {
    avatarColorIndex: draft.avatarColorIndex,
    defaultMode: draft.defaultMode,
    identityId: draft.identityId,
    launch: {
      advanced: {},
      kind: "mock",
      signing: draft.signing,
      ...(draft.startParam ? { startParam: draft.startParam } : {}),
      ...(draft.chat.enabled
        ? {
            chat: {
              id: draft.chat.id,
              title: draft.chat.title.trim(),
              type: draft.chat.type,
            },
          }
        : {}),
      ...(draft.receiver.enabled
        ? {
            receiver: {
              firstName: draft.receiver.firstName.trim(),
              id: draft.receiver.id,
            },
          }
        : {}),
    },
    name: draft.name.trim(),
    splash: {
      ...draft.splash,
      title: splashTitle || draft.name.trim(),
    },
    url: draft.url.trim(),
  };
}

const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item as Record<string, unknown>).sort(([a], [b]) =>
            a.localeCompare(b),
          ),
        )
      : item,
  );

/** A draft is dirty when its persisted fields or token intent differ from the base. */
export function isDirty(draft: ProjectDraft, base: ProjectDraft): boolean {
  return (
    draft.token.kind !== "keep" ||
    stable(fieldsFromDraft(draft)) !== stable(fieldsFromDraft(base))
  );
}

/** Minimal patch for project.update. */
export function patchFromDraft(
  draft: ProjectDraft,
  base: Readonly<Project>,
): Partial<ProjectFields> {
  const next = fieldsFromDraft(draft);
  const patch: Partial<ProjectFields> = {};
  for (const key of Object.keys(next) as (keyof ProjectFields)[]) {
    if (stable(next[key]) !== stable(base[key])) {
      (patch as Record<string, unknown>)[key] = next[key];
    }
  }
  return patch;
}
