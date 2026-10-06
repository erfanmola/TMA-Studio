import { For, Match, Show, Switch } from "solid-js";
import { directionFor, type Locale } from "../../i18n/locale";
import { Avatar, Button, type WindowPlatform, WindowShell } from "../../ui";
import "./home.scss";

export type HomeProject = {
  id: string;
  name: string;
  avatarColorIndex: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  targetLabel: string;
  targetStatus: "available" | "missing";
};

export type HomeCopy = {
  windowTitle: string;
  productTitle: string;
  description: string;
  createProject: string;
  manageUsers: string;
  settings: string;
  recentProjects: string;
  recentLoading: string;
  recentError: string;
  retry: string;
  recentEmpty: string;
  missingTarget: string;
  removeRecent: string;
  removeRecentLabel: string;
  updateAvailable: string;
  viewReleaseNotes: string;
  settingsUnavailable: string;
  openError: string;
};

export type HomeWindowProps = {
  id: string;
  copy: HomeCopy;
  logoSrc: string;
  projects: readonly HomeProject[];
  recentStatus: "loading" | "error" | "ready";
  theme: "light" | "dark";
  locale: Locale;
  platform: WindowPlatform;
  updateAvailable?: boolean;
  releaseNotesHref?: string;
  actionError?: boolean;
  onCreateProject: () => void;
  onManageUsers: () => void;
  onSettings: () => void;
  onOpenProject: (id: string) => void;
  onRemoveRecent: (id: string) => void;
  onRetry: () => void;
};

/** Compact launcher and recent-projects view. State and actions belong to its caller. */
export function HomeWindow(props: HomeWindowProps) {
  const copy = () => props.copy;
  const projectRemoveLabel = (name: string) =>
    copy().removeRecentLabel.replace("{name}", name);

  return (
    <section
      class="home-window"
      data-theme={props.theme}
      dir={directionFor(props.locale)}
      lang={props.locale}
    >
      <span aria-hidden="true" class="home-window__font-sample">
        نمونهٔ فارسی
      </span>
      <WindowShell
        class="home-window__shell"
        id={props.id}
        platform={props.platform}
        sidebar={
          <aside
            aria-labelledby={`${props.id}-recent-heading`}
            class="home-window__recent"
          >
            <h2
              class="home-window__recent-heading"
              id={`${props.id}-recent-heading`}
            >
              {copy().recentProjects}
            </h2>
            <Switch>
              <Match when={props.recentStatus === "loading"}>
                <p aria-live="polite" class="home-window__state" role="status">
                  {copy().recentLoading}
                </p>
              </Match>
              <Match when={props.recentStatus === "error"}>
                <div
                  class="home-window__state home-window__state--error"
                  role="alert"
                >
                  <p>{copy().recentError}</p>
                  <Button onClick={props.onRetry} size="small">
                    {copy().retry}
                  </Button>
                </div>
              </Match>
              <Match
                when={
                  props.recentStatus === "ready" && props.projects.length === 0
                }
              >
                <p class="home-window__state">{copy().recentEmpty}</p>
              </Match>
              <Match when={props.recentStatus === "ready"}>
                <ul class="home-window__project-list">
                  <For each={props.projects}>
                    {(project) => (
                      <li
                        class="home-window__project"
                        data-target-status={project.targetStatus}
                      >
                        <button
                          aria-label={`${project.name} — ${project.targetStatus === "missing" ? copy().missingTarget : project.targetLabel}`}
                          class="home-window__project-open"
                          disabled={project.targetStatus === "missing"}
                          onClick={() => props.onOpenProject(project.id)}
                          type="button"
                        >
                          <Avatar
                            colorIndex={project.avatarColorIndex}
                            kind="project"
                            locale={props.locale}
                            name={project.name}
                          />
                          <span class="home-window__project-copy">
                            <span class="home-window__project-name">
                              {project.name}
                            </span>
                            <span class="home-window__project-target">
                              {project.targetStatus === "missing"
                                ? copy().missingTarget
                                : project.targetLabel}
                            </span>
                          </span>
                        </button>
                        <button
                          aria-label={projectRemoveLabel(project.name)}
                          class="home-window__remove"
                          onClick={() => props.onRemoveRecent(project.id)}
                          title={copy().removeRecent}
                          type="button"
                        >
                          <span aria-hidden="true">×</span>
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              </Match>
            </Switch>
          </aside>
        }
        title={copy().windowTitle}
      >
        <div class="home-window__hero">
          <img alt="" class="home-window__logo" src={props.logoSrc} />
          <h2 class="home-window__title">{copy().productTitle}</h2>
          <p class="home-window__description">{copy().description}</p>
          <Show when={props.actionError}>
            <p class="home-window__action-error" role="alert">
              {copy().openError}
            </p>
          </Show>
          <Show when={props.updateAvailable}>
            <p class="home-window__update" role="status">
              {copy().updateAvailable}
              <Show when={props.releaseNotesHref}>
                {(href) => (
                  <>
                    <span aria-hidden="true"> · </span>
                    <a href={href()} rel="noreferrer" target="_blank">
                      {copy().viewReleaseNotes}
                    </a>
                  </>
                )}
              </Show>
            </p>
          </Show>
          <div class="home-window__actions">
            <Button onClick={props.onCreateProject} variant="primary">
              {copy().createProject}
            </Button>
            <Button onClick={props.onManageUsers}>{copy().manageUsers}</Button>
            <button
              class="home-window__settings"
              onClick={props.onSettings}
              type="button"
            >
              {copy().settings}
            </button>
          </div>
        </div>
      </WindowShell>
    </section>
  );
}
