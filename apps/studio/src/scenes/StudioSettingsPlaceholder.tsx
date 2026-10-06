import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import type {
  LegacyImportOutcome,
  LegacyImportPreview,
  LegacyWarningCode,
} from "../contracts/legacy-import-rpc";
import type {
  ProjectBundleCommand,
  ProjectBundleOutcome,
} from "../contracts/project-bundle";
import { LegacyImportBridgeService } from "../features/home/legacy-import-bridge-service";
import { ProjectBundleBridgeService } from "../features/home/project-bundle-bridge-service";
import {
  dictionaries,
  directionFor,
  LOCALES,
  type Locale,
} from "../i18n/locale";
import "./legacy-import.scss";

type Phase = "checking" | "ready" | "busy" | "done";

function queryLocale(): Locale {
  const value = new URLSearchParams(window.location.search).get("locale");
  return value && LOCALES.includes(value as Locale) ? (value as Locale) : "en";
}

function applyOutcome(
  outcome: LegacyImportOutcome,
  setPreview: (value: LegacyImportPreview | null) => void,
  setPhase: (value: Phase) => void,
  setNotice: (value: string) => void,
  copy: (typeof dictionaries)[Locale]["legacyImport"],
): void {
  if (outcome.state === "not-found") {
    setPreview(null);
    setPhase("ready");
    setNotice(copy.notFound);
  } else if (outcome.state === "canceled") {
    setPreview(null);
    setPhase("ready");
    setNotice(copy.chooseCanceled);
  } else if (outcome.state === "preview") {
    setPreview(outcome.preview);
    setPhase("ready");
    setNotice("");
  } else {
    setPreview(outcome.result);
    setPhase("done");
    setNotice(
      outcome.state === "already-imported"
        ? copy.alreadyImported
        : copy.imported
            .replace("{projects}", String(outcome.result.importedProjectCount))
            .replace("{users}", String(outcome.result.importedIdentityCount)),
    );
  }
}

function errorText(
  error: unknown,
  copy: (typeof dictionaries)[Locale]["legacyImport"],
): string {
  const code = error instanceof Error ? error.message : "IMPORT_FAILED";
  switch (code) {
    case "INVALID_INPUT":
      return copy.invalidInput;
    case "UNSUPPORTED_SCHEMA":
      return copy.unsupportedSchema;
    case "VAULT_UNAVAILABLE":
      return copy.vaultUnavailable;
    case "BACKUP_FAILED":
      return copy.backupFailed;
    default:
      return copy.importFailed;
  }
}

export default function StudioSettingsPlaceholder() {
  const locale = queryLocale();
  const copy = dictionaries[locale].legacyImport;
  const bundleCopy = dictionaries[locale].projectBundle;
  const theme =
    new URLSearchParams(window.location.search).get("theme") === "dark"
      ? "dark"
      : "light";
  const [preview, setPreview] = createSignal<LegacyImportPreview | null>(null);
  const [phase, setPhase] = createSignal<Phase>("checking");
  const [notice, setNotice] = createSignal(copy.checking);
  const [error, setError] = createSignal("");
  let closed = false;
  let bridge: LegacyImportBridgeService | undefined;
  let bundleBridge: ProjectBundleBridgeService | undefined;
  const [bundleCatalog, setBundleCatalog] = createSignal<Extract<
    ProjectBundleOutcome,
    { state: "catalog" }
  > | null>(null);
  const [selectedProjects, setSelectedProjects] = createSignal<string[]>([]);
  const [selectedIdentities, setSelectedIdentities] = createSignal<string[]>(
    [],
  );
  const [bundlePreview, setBundlePreview] = createSignal<
    Extract<ProjectBundleOutcome, { state: "preview" }>["preview"] | null
  >(null);
  const [bundleBusy, setBundleBusy] = createSignal(false);
  const [bundleNotice, setBundleNotice] = createSignal("");
  const [bundleError, setBundleError] = createSignal("");

  const bundleErrorText = (reason: unknown): string => {
    const code = reason instanceof Error ? reason.message : "IMPORT_FAILED";
    if (code === "INVALID_INPUT") return bundleCopy.invalid;
    if (code === "UNSUPPORTED_SCHEMA") return bundleCopy.unsupported;
    if (code === "EXPORT_FAILED") return bundleCopy.exportFailed;
    return bundleCopy.failed;
  };

  const runBundle = async (command: ProjectBundleCommand) => {
    if (!bundleBridge) return;
    setBundleBusy(true);
    setBundleError("");
    setBundleNotice(bundleCopy.working);
    try {
      const outcome = await bundleBridge.request(command);
      if (closed) return;
      if (outcome.state === "catalog") {
        setBundleCatalog(outcome);
        const identityIds = outcome.identities.map(({ id }) => id);
        const selectedProjectIds = outcome.projects
          .filter(({ identityKind }) => identityKind === "mock")
          .map(({ id }) => id);
        setSelectedIdentities(identityIds);
        setSelectedProjects(selectedProjectIds);
        setBundleNotice("");
      } else if (outcome.state === "preview") {
        setBundlePreview(outcome.preview);
        setBundleNotice("");
      } else if (outcome.state === "canceled") {
        setBundleNotice(bundleCopy.canceled);
      } else if (outcome.state === "exported") {
        setBundleNotice(
          bundleCopy.exported
            .replace("{projects}", String(outcome.projectCount))
            .replace("{identities}", String(outcome.identityCount)),
        );
      } else {
        setBundlePreview(null);
        setBundleNotice(
          bundleCopy.imported
            .replace("{projects}", String(outcome.projectCount))
            .replace("{identities}", String(outcome.identityCount))
            .replace("{remapped}", String(outcome.remappedProjectCount))
            .replace("{reused}", String(outcome.reusedIdentityCount)),
        );
        void runBundle({ method: "catalog" });
      }
    } catch (reason) {
      if (closed) return;
      setBundleNotice("");
      setBundleError(bundleErrorText(reason));
    } finally {
      if (!closed) setBundleBusy(false);
    }
  };

  const request = async (method: "detect" | "choose" | "import") => {
    if (!bridge) return;
    setError("");
    if (method === "choose") setPreview(null);
    setPhase("busy");
    setNotice(method === "import" ? copy.working : copy.checking);
    try {
      const outcome = await bridge.request(method);
      if (closed) return;
      applyOutcome(outcome, setPreview, setPhase, setNotice, copy);
    } catch (reason) {
      if (closed) return;
      setPhase("ready");
      setNotice("");
      setError(errorText(reason, copy));
    }
  };

  createEffect(
    () => null,
    () => {
      if (!window.__bunium) {
        setPhase("ready");
        setNotice(copy.notFound);
        return;
      }
      try {
        bridge = new LegacyImportBridgeService();
        bundleBridge = new ProjectBundleBridgeService();
        void request("detect");
        void runBundle({ method: "catalog" });
      } catch {
        setPhase("ready");
        setNotice(copy.importFailed);
      }
    },
  );
  onCleanup(() => {
    closed = true;
    bridge?.close();
    bundleBridge?.close();
  });

  const mappedWarning = (code: LegacyWarningCode): string =>
    copy.warningLabels[code];

  return (
    <main
      class="legacy-import"
      data-theme={theme}
      dir={directionFor(locale)}
      lang={locale}
    >
      <header class="legacy-import__header">
        <h1>{copy.title}</h1>
        <p>{copy.description}</p>
      </header>
      <p class="legacy-import__safety">{copy.sourceNote}</p>
      <div class="legacy-import__actions">
        <button
          disabled={phase() === "busy" || phase() === "checking"}
          onClick={() => void request("detect")}
          type="button"
        >
          {copy.detect}
        </button>
        <button
          disabled={phase() === "busy" || phase() === "checking"}
          onClick={() => void request("choose")}
          type="button"
        >
          {copy.choose}
        </button>
      </div>
      <p aria-live="polite" class="legacy-import__notice" role="status">
        {phase() === "checking"
          ? copy.checking
          : phase() === "busy" && preview()
            ? copy.working
            : notice()}
      </p>
      <Show when={error()}>
        <p class="legacy-import__error" role="alert">
          {error()}
        </p>
      </Show>
      <Show when={preview()}>
        {(value) => (
          <section
            aria-labelledby="legacy-import-preview-title"
            class="legacy-import__preview"
          >
            <h2 id="legacy-import-preview-title">{copy.previewHeading}</h2>
            <ul class="legacy-import__counts">
              <li>
                {copy.projects.replace("{count}", String(value().projectCount))}
              </li>
              <li>
                {copy.mockUsers.replace(
                  "{count}",
                  String(value().mockUserCount),
                )}
              </li>
              <li>
                {copy.tokens.replace(
                  "{count}",
                  String(value().importableTokenCount),
                )}
              </li>
            </ul>
            <p class="legacy-import__mapping">{copy.mappingNote}</p>
            <Show when={value().warnings.length > 0}>
              <div class="legacy-import__warnings">
                <h3>{copy.warningHeading}</h3>
                <ul>
                  <ForWarnings
                    warnings={value().warnings}
                    label={mappedWarning}
                  />
                </ul>
              </div>
            </Show>
            <p class="legacy-import__backup">{copy.backupNote}</p>
            <button
              class="legacy-import__primary"
              disabled={phase() === "busy" || phase() === "done"}
              onClick={() => void request("import")}
              type="button"
            >
              {phase() === "done" ? copy.alreadyImported : copy.import}
            </button>
          </section>
        )}
      </Show>
      <section aria-labelledby="project-bundle-title" class="project-bundle">
        <header>
          <h2 id="project-bundle-title">{bundleCopy.title}</h2>
          <p>{bundleCopy.description}</p>
          <p>{bundleCopy.safety}</p>
        </header>
        <Show when={bundleCatalog()}>
          {(catalog) => (
            <>
              <fieldset disabled={bundleBusy()}>
                <legend>{bundleCopy.identitiesHeading}</legend>
                <For each={catalog().identities}>
                  {(identity) => (
                    <label class="project-bundle__choice">
                      <input
                        checked={selectedIdentities().includes(identity.id)}
                        onChange={(event) => {
                          const next = event.currentTarget.checked
                            ? [...selectedIdentities(), identity.id]
                            : selectedIdentities().filter(
                                (id) => id !== identity.id,
                              );
                          setSelectedIdentities(next);
                          if (!event.currentTarget.checked) {
                            const removedProjects = catalog()
                              .projects.filter(
                                (project) => project.identityId === identity.id,
                              )
                              .map(({ id }) => id);
                            setSelectedProjects(
                              selectedProjects().filter(
                                (id) => !removedProjects.includes(id),
                              ),
                            );
                          }
                        }}
                        type="checkbox"
                      />
                      <span>{identity.name}</span>
                    </label>
                  )}
                </For>
              </fieldset>
              <fieldset disabled={bundleBusy()}>
                <legend>{bundleCopy.projectsHeading}</legend>
                <For each={catalog().projects}>
                  {(project) => (
                    <label class="project-bundle__choice">
                      <input
                        checked={selectedProjects().includes(project.id)}
                        disabled={
                          project.identityKind !== "mock" ||
                          !selectedIdentities().includes(project.identityId)
                        }
                        onChange={(event) =>
                          setSelectedProjects(
                            event.currentTarget.checked
                              ? [...selectedProjects(), project.id]
                              : selectedProjects().filter(
                                  (id) => id !== project.id,
                                ),
                          )
                        }
                        type="checkbox"
                      />
                      <span>{project.name}</span>
                    </label>
                  )}
                </For>
              </fieldset>
              <div class="project-bundle__actions">
                <button
                  disabled={
                    bundleBusy() ||
                    !selectedProjects().length ||
                    !selectedIdentities().length
                  }
                  onClick={() =>
                    void runBundle({
                      method: "export",
                      projectIds: selectedProjects(),
                      identityIds: selectedIdentities(),
                    })
                  }
                  type="button"
                >
                  {bundleCopy.export}
                </button>
                <button
                  disabled={bundleBusy()}
                  onClick={() => {
                    setBundlePreview(null);
                    void runBundle({ method: "choose-import" });
                  }}
                  type="button"
                >
                  {bundleCopy.choose}
                </button>
              </div>
              <Show when={bundlePreview()}>
                {(value) => (
                  <section
                    aria-labelledby="project-bundle-preview-title"
                    class="project-bundle__preview"
                  >
                    <h3 id="project-bundle-preview-title">
                      {bundleCopy.preview}
                    </h3>
                    <ul>
                      <li>
                        {bundleCopy.projectCount.replace(
                          "{count}",
                          String(value().projectCount),
                        )}
                      </li>
                      <li>
                        {bundleCopy.identityCount.replace(
                          "{count}",
                          String(value().identityCount),
                        )}
                      </li>
                      <li>
                        {bundleCopy.collisions.replace(
                          "{count}",
                          String(value().projectIdCollisionCount),
                        )}
                      </li>
                      <li>
                        {bundleCopy.reused.replace(
                          "{count}",
                          String(value().duplicateIdentityCount),
                        )}
                      </li>
                    </ul>
                    <p>{bundleCopy.remapNote}</p>
                    <button
                      class="legacy-import__primary"
                      disabled={bundleBusy()}
                      onClick={() => void runBundle({ method: "import" })}
                      type="button"
                    >
                      {bundleCopy.import}
                    </button>
                  </section>
                )}
              </Show>
            </>
          )}
        </Show>
        <Show
          when={
            !bundleCatalog() ||
            (bundleCatalog()?.projects.length === 0 &&
              bundleCatalog()?.identities.length === 0)
          }
        >
          <p>{bundleCopy.empty}</p>
        </Show>
        <p aria-live="polite" class="legacy-import__notice" role="status">
          {bundleNotice()}
        </p>
        <Show when={bundleError()}>
          <p class="legacy-import__error" role="alert">
            {bundleError()}
          </p>
        </Show>
      </section>
    </main>
  );
}

function ForWarnings(props: {
  warnings: readonly { code: LegacyWarningCode; count: number }[];
  label: (code: LegacyWarningCode) => string;
}) {
  return (
    <>
      {props.warnings.map((warning) => (
        <li>
          {props.label(warning.code)} ({warning.count})
        </li>
      ))}
    </>
  );
}
