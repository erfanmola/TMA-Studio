import type { JSX } from "@solidjs/web";
import {
  createSignal,
  For,
  flush,
  Match,
  onCleanup,
  Show,
  Switch as SwitchCase,
  untrack,
} from "solid-js";
import { PLATFORMS, type Platform } from "../../contracts/entities";
import {
  dictionaries,
  directionFor,
  formatMessage,
  type Locale,
} from "../../i18n/locale";
import {
  Avatar,
  Button,
  Dialog,
  SecretField,
  SegmentedControl,
  Select,
  Switch,
  TextField,
  type WindowPlatform,
  WindowShell,
} from "../../ui";
import type { ProjectController } from "./controller";
import "./project.scss";
import type { DraftField, ProjectDraft } from "./draft";

const CREATE_USER = "__create-user__";

type Section = "main" | "launch" | "splash";

const phoneIcon = () => (
  <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
    <rect
      height="16"
      rx="2.5"
      stroke="currentColor"
      stroke-width="1.6"
      width="10"
      x="7"
      y="4"
    />
    <path d="M11 17h2" stroke="currentColor" stroke-linecap="round" />
  </svg>
);

export type ProjectWindowProps = {
  controller: ProjectController;
  id: string;
  locale: Locale;
  onCreateIdentity?: () => Promise<string | null>;
  platform: WindowPlatform;
  theme?: "light" | "dark";
};

export function ProjectWindow(props: ProjectWindowProps) {
  const copy = untrack(() => dictionaries[props.locale].project);
  const [state, setState] = createSignal(
    untrack(() => props.controller.snapshot),
  );
  const unsubscribe = untrack(() => props.controller.subscribe(setState));
  onCleanup(unsubscribe);
  const [section, setSection] = createSignal<Section>("main");

  const controller = () => props.controller;
  const id = (name: string) => `${props.id}-${name}`;
  const draft = () => state().draft;
  const edit = (update: (current: ProjectDraft) => ProjectDraft) =>
    controller().edit(update);
  const error = (field: DraftField) => {
    const key = state().showErrors ? state().errors[field] : undefined;
    return key ? copy.errors[key] : undefined;
  };
  const saved = () => state().project !== null;
  const dirty = () => controller().dirty;
  const canLaunch = () => saved() && state().phase === "ready";

  const open = (next: Section, focusId: string) => {
    setSection(next);
    flush();
    document.getElementById(focusId)?.focus();
  };

  const tokenField = (): JSX.Element => {
    const token = draft().token;
    if (state().hasToken && token.kind === "keep") {
      return (
        <div class="project-form__token">
          <p class="project-form__note">{copy.tokenSaved}</p>
          <div class="project-form__inline-actions">
            <Button
              onClick={() =>
                edit((d) => ({ ...d, token: { kind: "set", value: "" } }))
              }
              size="small"
            >
              {copy.tokenReplace}
            </Button>
            <Button
              onClick={() => edit((d) => ({ ...d, token: { kind: "remove" } }))}
              size="small"
              variant="danger"
            >
              {copy.tokenRemove}
            </Button>
          </div>
        </div>
      );
    }
    if (token.kind === "remove") {
      return (
        <div class="project-form__token">
          <p class="project-form__note">{copy.tokenRemoved}</p>
          <Button
            onClick={() => edit((d) => ({ ...d, token: { kind: "keep" } }))}
            size="small"
          >
            {copy.tokenKeep}
          </Button>
        </div>
      );
    }
    return (
      <SecretField
        autocomplete="off"
        description={copy.tokenDescription}
        error={error("token")}
        hideLabel={copy.hide}
        id={id("token")}
        label={copy.token}
        onValueChange={(value) =>
          edit((d) => ({
            ...d,
            token:
              value === "" && !state().hasToken
                ? { kind: "keep" }
                : { kind: "set", value },
          }))
        }
        revealLabel={copy.reveal}
        spellcheck={false}
        value={token.kind === "set" ? token.value : ""}
      />
    );
  };

  const mainSection = () => (
    <div class="project-form">
      <Avatar
        colorIndex={draft().avatarColorIndex}
        kind="project"
        locale={props.locale}
        name={draft().name || "?"}
        size="large"
      />
      <TextField
        error={error("name")}
        id={id("name")}
        label={copy.name}
        onValueChange={(name) => edit((d) => ({ ...d, name }))}
        required
        value={draft().name}
      />
      <TextField
        class="ltr-isolate"
        description={copy.urlDescription}
        error={error("url")}
        id={id("url")}
        inputmode="url"
        label={copy.url}
        onValueChange={(url) => edit((d) => ({ ...d, url }))}
        required
        spellcheck={false}
        type="url"
        value={draft().url}
      />
      {tokenField()}
      <div class="project-form__row">
        <span class="studio-field-row__label" id={id("mode-label")}>
          {copy.mode}
        </span>
        <SegmentedControl
          aria-labelledby={id("mode-label")}
          id={id("mode")}
          onValueChange={(value) =>
            edit((d) => ({
              ...d,
              defaultMode: value as ProjectDraft["defaultMode"],
            }))
          }
          options={(["overlay", "expanded", "fullscreen"] as const).map(
            (value) => ({ label: copy.modes[value], value }),
          )}
          value={draft().defaultMode}
        />
      </div>
      <Select
        error={error("identityId")}
        id={id("user")}
        label={copy.user}
        onValueChange={(value) => {
          if (value === CREATE_USER) {
            if (props.onCreateIdentity) {
              void props.onCreateIdentity().then((identityId) => {
                if (identityId) {
                  void controller().selectCreatedIdentity(identityId);
                }
              });
            } else {
              void controller().createIdentity();
            }
          } else edit((d) => ({ ...d, identityId: value }));
        }}
        options={[
          ...state().identities.map((identity) => ({
            label: identity.label,
            value: identity.id,
          })),
          { label: copy.createUser, value: CREATE_USER },
        ]}
        value={draft().identityId}
      />
      <div class="project-form__links">
        <button
          class="project-form__link"
          id={id("open-launch")}
          onClick={() => open("launch", id("launch-heading"))}
          type="button"
        >
          <span>{copy.launchParams}</span>
          <span class="project-form__link-action">{copy.configure}</span>
        </button>
        <button
          class="project-form__link"
          id={id("open-splash")}
          onClick={() => open("splash", id("splash-heading"))}
          type="button"
        >
          <span>{copy.splash}</span>
          <span class="project-form__link-action">{copy.customize}</span>
        </button>
      </div>
    </div>
  );

  const sectionHeader = (name: "launch" | "splash", title: string) => (
    <div class="project-form__section-header">
      <Button
        onClick={() => open("main", id(`open-${name}`))}
        size="small"
        variant="quiet"
      >
        {copy.back}
      </Button>
      <h2 id={id(`${name}-heading`)} tabindex="-1">
        {title}
      </h2>
    </div>
  );

  const launchSection = () => (
    <div class="project-form">
      {sectionHeader("launch", copy.launchParams)}
      <div class="project-form__row">
        <span class="studio-field-row__label" id={id("signing-label")}>
          {copy.signing}
        </span>
        <SegmentedControl
          aria-labelledby={id("signing-label")}
          id={id("signing")}
          onValueChange={(value) =>
            edit((d) => ({ ...d, signing: value as ProjectDraft["signing"] }))
          }
          options={[
            { label: copy.signingOptions.unsigned, value: "unsigned" },
            { label: copy.signingOptions.botToken, value: "bot-token" },
          ]}
          value={draft().signing}
        />
        <Show when={error("signing")}>
          <p class="studio-field-row__error" role="alert">
            {error("signing")}
          </p>
        </Show>
      </div>
      <TextField
        class="ltr-isolate"
        description={copy.startParamDescription}
        error={error("startParam")}
        id={id("start-param")}
        label={copy.startParam}
        onValueChange={(startParam) => edit((d) => ({ ...d, startParam }))}
        spellcheck={false}
        value={draft().startParam}
      />
      <Switch
        checked={draft().chat.enabled}
        id={id("chat-toggle")}
        label={copy.chatToggle}
        onCheckedChange={(enabled) =>
          edit((d) => ({ ...d, chat: { ...d.chat, enabled } }))
        }
      />
      <Show when={draft().chat.enabled}>
        <Select
          id={id("chat-type")}
          label={copy.chatType}
          onValueChange={(value) =>
            edit((d) => ({
              ...d,
              chat: { ...d.chat, type: value as ProjectDraft["chat"]["type"] },
            }))
          }
          options={(["group", "supergroup", "channel"] as const).map(
            (value) => ({ label: copy.chatTypes[value], value }),
          )}
          value={draft().chat.type}
        />
        <TextField
          class="ltr-isolate"
          error={error("chat.id")}
          id={id("chat-id")}
          inputmode="numeric"
          label={copy.chatId}
          onValueChange={(value) =>
            edit((d) => ({ ...d, chat: { ...d.chat, id: value } }))
          }
          value={draft().chat.id}
        />
        <TextField
          error={error("chat.title")}
          id={id("chat-title")}
          label={copy.chatTitle}
          onValueChange={(title) =>
            edit((d) => ({ ...d, chat: { ...d.chat, title } }))
          }
          value={draft().chat.title}
        />
      </Show>
      <Switch
        checked={draft().receiver.enabled}
        id={id("receiver-toggle")}
        label={copy.receiverToggle}
        onCheckedChange={(enabled) =>
          edit((d) => ({ ...d, receiver: { ...d.receiver, enabled } }))
        }
      />
      <Show when={draft().receiver.enabled}>
        <TextField
          class="ltr-isolate"
          error={error("receiver.id")}
          id={id("receiver-id")}
          inputmode="numeric"
          label={copy.receiverId}
          onValueChange={(value) =>
            edit((d) => ({ ...d, receiver: { ...d.receiver, id: value } }))
          }
          value={draft().receiver.id}
        />
        <TextField
          error={error("receiver.firstName")}
          id={id("receiver-name")}
          label={copy.receiverName}
          onValueChange={(firstName) =>
            edit((d) => ({ ...d, receiver: { ...d.receiver, firstName } }))
          }
          value={draft().receiver.firstName}
        />
      </Show>
    </div>
  );

  const colorField = (
    key: "lightBackground" | "darkBackground",
    label: string,
  ) => (
    <TextField
      class="ltr-isolate"
      error={error(`splash.${key}`)}
      id={id(`splash-${key}`)}
      label={label}
      onValueChange={(value) =>
        edit((d) => ({ ...d, splash: { ...d.splash, [key]: value } }))
      }
      spellcheck={false}
      trailingAction={
        <input
          aria-label={label}
          class="project-form__color"
          onInput={(event) => {
            const value = event.currentTarget.value.toUpperCase();
            edit((d) => ({ ...d, splash: { ...d.splash, [key]: value } }));
          }}
          tabindex="-1"
          type="color"
          value={
            /^#[0-9a-fA-F]{6}$/u.test(draft().splash[key])
              ? draft().splash[key]
              : "#000000"
          }
        />
      }
      value={draft().splash[key]}
    />
  );

  const splashPreview = (tone: "light" | "dark", label: string) => (
    <figure class="project-splash-preview">
      <div
        class="project-splash-preview__screen"
        data-theme={tone}
        style={{
          background:
            tone === "light"
              ? draft().splash.lightBackground
              : draft().splash.darkBackground,
        }}
      >
        <Avatar
          colorIndex={draft().avatarColorIndex}
          kind="project"
          locale={props.locale}
          name={draft().name || "?"}
        />
        <span class="project-splash-preview__title">
          {draft().splash.title.trim() || draft().name}
        </span>
      </div>
      <figcaption>{label}</figcaption>
    </figure>
  );

  const splashSection = () => (
    <div class="project-form">
      {sectionHeader("splash", copy.splash)}
      <TextField
        description={copy.splashTitleDescription}
        error={error("splash.title")}
        id={id("splash-title")}
        label={copy.splashTitle}
        onValueChange={(title) =>
          edit((d) => ({ ...d, splash: { ...d.splash, title } }))
        }
        value={draft().splash.title}
      />
      <div class="project-form__row">
        <span class="studio-field-row__label" id={id("presentation-label")}>
          {copy.presentation}
        </span>
        <SegmentedControl
          aria-labelledby={id("presentation-label")}
          id={id("presentation")}
          onValueChange={(value) =>
            edit((d) => ({
              ...d,
              splash: {
                ...d.splash,
                presentation: value as ProjectDraft["splash"]["presentation"],
              },
            }))
          }
          options={[
            { label: copy.presentations.telegram, value: "telegram" },
            { label: copy.presentations.project, value: "project" },
          ]}
          value={draft().splash.presentation}
        />
      </div>
      {colorField("lightBackground", copy.light)}
      {colorField("darkBackground", copy.dark)}
      <section aria-label={copy.preview} class="project-form__previews">
        {splashPreview("light", copy.previewLight)}
        {splashPreview("dark", copy.previewDark)}
      </section>
    </div>
  );

  const launchError = () => {
    const code = state().launchError;
    if (!code) return undefined;
    return code === "UNAVAILABLE"
      ? copy.launchErrors.UNAVAILABLE
      : copy.launchErrors.other;
  };

  const sidebar = () => (
    <nav aria-labelledby={id("launch-list")} class="project-launch">
      <h3 class="studio-sidebar-list__heading" id={id("launch-list")}>
        {copy.sidebar}
      </h3>
      <ul class="project-launch__list">
        <For each={PLATFORMS}>
          {(platform: Platform) => (
            <li>
              <button
                aria-describedby={id("launch-hint")}
                class="project-launch__action"
                disabled={!canLaunch()}
                id={id(`launch-${platform}`)}
                onClick={() => void controller().launch(platform)}
                type="button"
              >
                {phoneIcon()}
                <span>{copy.platforms[platform]}</span>
              </button>
            </li>
          )}
        </For>
      </ul>
      <p class="project-launch__hint" id={id("launch-hint")}>
        {saved() ? copy.launchHint : copy.launchDisabled}
      </p>
      <Show when={launchError()}>
        <p class="project-launch__error" role="alert">
          {launchError()}
        </p>
      </Show>
    </nav>
  );

  const title = () => (saved() ? copy.windowManage : copy.windowCreate);

  return (
    <div
      class="project-window"
      data-theme={props.theme}
      dir={directionFor(props.locale)}
      lang={props.locale}
    >
      <WindowShell
        footer={
          <Show when={state().phase === "ready" || state().phase === "saving"}>
            <Show when={state().saveError}>
              {(code) => (
                <p class="project-window__save-error" role="alert">
                  {copy.saveErrors[code()]}
                </p>
              )}
            </Show>
            <Button
              disabled={state().phase === "saving"}
              onClick={() => controller().requestClose()}
            >
              {copy.cancel}
            </Button>
            <Button
              id={id("save")}
              loading={state().phase === "saving"}
              onClick={() => void controller().save()}
              variant="primary"
            >
              {copy.save}
            </Button>
          </Show>
        }
        id={id("window")}
        platform={props.platform}
        sidebar={sidebar()}
        title={title()}
        titlebarActions={
          <span class="project-window__badge" role="status">
            {saved() ? (dirty() ? copy.unsavedBadge : copy.savedBadge) : ""}
          </span>
        }
      >
        <SwitchCase>
          <Match when={state().phase === "loading"}>
            <p class="project-window__status" role="status">
              {copy.loading}
            </p>
          </Match>
          <Match when={state().phase === "load-failed"}>
            <div class="project-window__status" role="alert">
              <p>{copy.loadFailed}</p>
              <Button onClick={() => void controller().load()}>
                {copy.retry}
              </Button>
            </div>
          </Match>
          <Match when={section() === "launch"}>{launchSection()}</Match>
          <Match when={section() === "splash"}>{splashSection()}</Match>
          <Match when={section() === "main"}>{mainSection()}</Match>
        </SwitchCase>
      </WindowShell>
      <Dialog
        description={copy.closeDescription}
        footer={
          <>
            <Button
              onClick={() => void controller().resolveClose("discard")}
              variant="danger"
            >
              {copy.closeDiscard}
            </Button>
            <Button onClick={() => void controller().resolveClose("cancel")}>
              {copy.closeCancel}
            </Button>
            <Button
              autofocus
              onClick={() => void controller().resolveClose("save")}
              variant="primary"
            >
              {copy.closeSave}
            </Button>
          </>
        }
        id={id("close")}
        onCancel={() => void controller().resolveClose("cancel")}
        open={state().closePrompt}
        title={formatMessage(copy.closeTitle, {
          name: draft().name.trim() || copy.windowCreate,
        })}
      />
      <Dialog
        description={copy.conflictDescription}
        footer={
          <>
            <Button onClick={() => void controller().resolveConflict("reload")}>
              {copy.conflictReload}
            </Button>
            <Button
              autofocus
              onClick={() => void controller().resolveConflict("overwrite")}
              variant="primary"
            >
              {copy.conflictOverwrite}
            </Button>
          </>
        }
        id={id("conflict")}
        onCancel={() => undefined}
        open={state().conflict !== null}
        title={copy.conflictTitle}
      />
    </div>
  );
}
