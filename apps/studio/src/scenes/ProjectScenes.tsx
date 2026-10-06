import { createSignal, For, onSettled, Show } from "solid-js";
import type { Project } from "../contracts/entities";
import { ProjectController } from "../features/project/controller";
import { MemoryProjectService } from "../features/project/memory-service";
import { ProjectWindow } from "../features/project/ProjectWindow";
import { MemoryUsersService } from "../features/users/memory-service";
import { UserWindow } from "../features/users/UserWindow";
import { dictionaries, type Locale } from "../i18n/locale";
import { Button } from "../ui";

const scenes = [
  { locale: "en", mode: "create", theme: "light" },
  { locale: "en", mode: "manage", theme: "dark" },
  { locale: "fa", mode: "manage", theme: "light" },
  { locale: "fa", mode: "create", theme: "dark" },
] as const;

const seedProject: Project = {
  avatarColorIndex: 5,
  createdAt: new Date(0).toISOString(),
  defaultMode: "expanded",
  id: "orbit",
  identityId: "mock-alex",
  launch: { advanced: {}, kind: "mock", signing: "unsigned" },
  name: "Orbit Store",
  revision: 1,
  splash: {
    darkBackground: "#19191B",
    lightBackground: "#FFFFFF",
    presentation: "telegram",
    title: "Orbit Store",
  },
  updatedAt: new Date(0).toISOString(),
  url: "http://localhost:3000",
};

function ProjectScene(props: {
  locale: Locale;
  mode: "create" | "manage";
  theme: "light" | "dark";
}) {
  const key = `${props.mode}-${props.theme}-${props.locale}`;
  const service = new MemoryProjectService([
    { id: "mock-alex", kind: "mock", label: "Alex Morgan · Mock" },
    { id: "tg-sara", kind: "telegram", label: "Sara Klein · Telegram" },
  ]);
  const userService = new MemoryUsersService(
    [
      {
        id: "mock-alex",
        kind: "mock",
        telegramId: "9007199254740993",
        firstName: "Alex",
        lastName: "Morgan",
        languageCode: "en",
        isPremium: true,
        revision: 1,
      },
      {
        id: "telegram-sara",
        kind: "telegram",
        accountRef: "account-review-only",
        profile: {
          telegramId: "133777000",
          firstName: "Sara",
          lastName: "Klein",
          languageCode: "de",
          isPremium: false,
        },
        status: "reauthorize",
        revision: 1,
      },
    ],
    [],
  );
  const [createUserOpen, setCreateUserOpen] = createSignal(false);
  let finishUserFlow: ((identityId: string | null) => void) | undefined;
  const createIdentityFlow = () =>
    new Promise<string | null>((resolve) => {
      finishUserFlow = resolve;
      setCreateUserOpen(true);
    });
  if (props.mode === "manage") service.seed(seedProject, true);
  const [closed, setClosed] = createSignal(0);
  const controller = new ProjectController({
    avatarColorIndex: 2,
    onClose: () => setClosed((count) => count + 1),
    ...(props.mode === "manage" ? { projectId: "orbit" } : {}),
    service,
  });
  onSettled(() => {
    void controller.load();
  });
  const copy = dictionaries[props.locale].project;

  return (
    <section class="project-scene" data-scene={key}>
      <div class="project-scene__tools" data-theme={props.theme}>
        <Button
          id={`${key}-close`}
          onClick={() => controller.requestClose()}
          size="small"
        >
          {copy.closeWindow}
        </Button>
        <Button
          id={`${key}-remote-edit`}
          onClick={() =>
            service.touch("orbit", { url: "https://orbit.example" })
          }
          size="small"
        >
          Remote edit
        </Button>
        <Button
          id={`${key}-fail-next`}
          onClick={() => {
            service.failNextSave = true;
          }}
          size="small"
        >
          Fail next save
        </Button>
        <output data-closed={closed()}>{closed()}</output>
      </div>
      <ProjectWindow
        controller={controller}
        id={key}
        locale={props.locale}
        onCreateIdentity={createIdentityFlow}
        platform="macos"
        theme={props.theme}
      />
      <Show when={createUserOpen()}>
        <UserWindow
          id={`${key}-create-user`}
          identityId={null}
          locale={props.locale}
          onClose={() => {
            setCreateUserOpen(false);
            finishUserFlow?.(null);
            finishUserFlow = undefined;
          }}
          onSaved={(identity) => {
            service.addIdentity({
              id: identity.id,
              kind: identity.kind,
              label: `${identity.kind === "mock" ? identity.firstName : identity.profile.firstName} · Mock`,
            });
            setCreateUserOpen(false);
            finishUserFlow?.(identity.id);
            finishUserFlow = undefined;
          }}
          platform="macos"
          service={userService}
          theme={props.theme}
        />
      </Show>
    </section>
  );
}

export default function ProjectScenes() {
  return (
    <main class="project-scene-board">
      <For each={scenes}>
        {(scene) => (
          <ProjectScene
            locale={scene.locale}
            mode={scene.mode}
            theme={scene.theme}
          />
        )}
      </For>
    </main>
  );
}
