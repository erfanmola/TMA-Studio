import { createMemo, createSignal, For } from "solid-js";
import {
  dictionaries,
  directionFor,
  formatMessage,
  type Locale,
} from "../i18n/locale";
import {
  Avatar,
  Button,
  ConfirmDialog,
  createToaster,
  Dialog,
  IconButton,
  SegmentedControl,
  SidebarList,
  StorageBar,
  type StorageStatus,
  TextField,
  ToastRegion,
  type WindowPlatform,
  WindowShell,
} from "../ui";

const stateScenes = [
  { theme: "light", locale: "en" },
  { theme: "dark", locale: "en" },
  { theme: "light", locale: "fa" },
  { theme: "dark", locale: "fa" },
] as const;

// Deterministic fixture IDs: a 64-bit user ID, a small ID and a negative chat
// ID exercise the BigInt abs(id % 7) path.
// Offline image fixtures: Sara's is corrupt (falls back to initials), Nima's
// is a valid 1×1 PNG.
const brokenImage = "data:image/png;base64,AAAA";
const pixelImage =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const users = [
  { id: "alex", subtitle: "mockPremium", telegramId: "9007199254740993" },
  {
    id: "sara",
    imageUrl: brokenImage,
    subtitle: "connected",
    telegramId: "5000000003",
  },
  {
    id: "nima",
    imageUrl: pixelImage,
    subtitle: "reconnect",
    telegramId: "-1001234567890",
  },
] as const;

function CatalogStateScene(props: {
  locale: Locale;
  platform: WindowPlatform;
  theme: "light" | "dark";
}) {
  const copy = dictionaries[props.locale].catalog;
  const id = (name: string) => `${name}-${props.theme}-${props.locale}`;
  const toaster = createToaster();
  const [selected, setSelected] = createSignal("alex");
  const [removed, setRemoved] = createSignal<readonly string[]>([]);
  const [renameOpen, setRenameOpen] = createSignal(false);
  const [deleteOpen, setDeleteOpen] = createSignal(false);
  const [projectName, setProjectName] = createSignal(copy.project);
  const [storageStatus, setStorageStatus] =
    createSignal<StorageStatus>("ready");

  const userName = (key: (typeof users)[number]["id"]) => copy.users[key];
  const selectedUser = () =>
    users.find((user) => user.id === selected()) ?? users[0];
  const sidebarItems = createMemo(() =>
    users
      .filter((user) => !removed().includes(user.id))
      .map((user) => ({
        id: user.id,
        leading: (
          <Avatar
            imageUrl={"imageUrl" in user ? user.imageUrl : undefined}
            kind="user"
            locale={props.locale}
            name={userName(user.id)}
            telegramId={user.telegramId}
          />
        ),
        subtitle: copy.subtitles[user.subtitle],
        title: userName(user.id),
      })),
  );
  const storageStates = (
    ["ready", "estimating", "unknown", "error"] as const
  ).map((value) => ({ label: copy.storageStates[value], value }));

  return (
    <section
      class="catalog-state-scene"
      data-theme={props.theme}
      dir={directionFor(props.locale)}
      lang={props.locale}
    >
      <WindowShell
        id={id("window")}
        platform={props.platform}
        sidebar={
          <SidebarList
            emptyLabel={copy.emptyUsers}
            id={id("users")}
            items={sidebarItems()}
            label={copy.sidebarLabel}
            onSelect={setSelected}
            selectedId={selected()}
            trailing={(item) => (
              <IconButton
                aria-label={formatMessage(copy.removeUser, {
                  name: item.title,
                })}
                class="catalog-state-scene__remove"
                onClick={() => setRemoved((list) => [...list, item.id])}
              >
                <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                  <path
                    d="m7 7 10 10M17 7 7 17"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-width="1.8"
                  />
                </svg>
              </IconButton>
            )}
          />
        }
        title={copy.windowTitle}
      >
        <div class="catalog-state-scene__hero">
          <Avatar
            kind="user"
            label={userName(selectedUser().id)}
            locale={props.locale}
            name={userName(selectedUser().id)}
            size="large"
            telegramId={selectedUser().telegramId}
          />
          <h2>{copy.heroTitle}</h2>
          <div class="catalog-state-scene__actions">
            <Avatar
              colorIndex={4}
              kind="project"
              locale={props.locale}
              name={projectName()}
            />
            <Button onClick={() => setRenameOpen(true)}>
              {copy.openDialog}
            </Button>
            <Button onClick={() => setDeleteOpen(true)} variant="danger">
              {copy.deleteAction}
            </Button>
          </div>
          <div class="catalog-state-scene__actions">
            <Button
              onClick={() =>
                toaster.show({ title: copy.savedTitle, tone: "success" })
              }
            >
              {copy.showToast}
            </Button>
            <Button
              onClick={() =>
                toaster.show({
                  action: { label: copy.retry, onAction: () => undefined },
                  description: copy.errorDescription,
                  title: copy.errorTitle,
                  tone: "error",
                })
              }
            >
              {copy.showError}
            </Button>
          </div>
        </div>
        <div class="catalog-state-scene__storage">
          <span class="studio-field-row__label" id={id("storage-state")}>
            {copy.storageStateLabel}
          </span>
          <SegmentedControl
            aria-labelledby={id("storage-state")}
            id={id("storage-state-control")}
            onValueChange={(value) => setStorageStatus(value as StorageStatus)}
            options={storageStates}
            value={storageStatus()}
          />
          <StorageBar
            capacityBytes={500_000_000}
            id={id("storage")}
            labels={copy.storage}
            locale={props.locale}
            segments={[
              { bytes: 128_000_000, id: "orbit", label: "Orbit Store" },
              { bytes: 74_000_000, id: "pocket", label: "Pocket Notes" },
              { bytes: 42_000_000, id: "atlas", label: "Atlas Wallet" },
              { bytes: null, id: "legacy", label: "Legacy Demo" },
            ]}
            status={storageStatus()}
          />
        </div>
      </WindowShell>
      <Dialog
        description={copy.dialogDescription}
        dismissOnBackdrop
        footer={
          <>
            <Button onClick={() => setRenameOpen(false)}>{copy.cancel}</Button>
            <Button onClick={() => setRenameOpen(false)} variant="primary">
              {copy.save}
            </Button>
          </>
        }
        id={id("rename")}
        onCancel={() => setRenameOpen(false)}
        open={renameOpen()}
        title={copy.dialogTitle}
      >
        <TextField
          id={id("rename-field")}
          label={copy.dialogField}
          onValueChange={setProjectName}
          value={projectName()}
        />
      </Dialog>
      <ConfirmDialog
        cancelLabel={copy.cancel}
        confirmLabel={copy.deleteConfirm}
        description={copy.deleteDescription}
        destructive
        id={id("delete")}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => {
          setRemoved((list) => [...list, selectedUser().id]);
          setDeleteOpen(false);
        }}
        open={deleteOpen()}
        title={formatMessage(copy.deleteTitle, {
          name: userName(selectedUser().id),
        })}
      />
      <ToastRegion
        closeLabel={copy.dismiss}
        label={copy.toastRegion}
        toaster={toaster}
      />
    </section>
  );
}

export default function CatalogScenes() {
  const params = new URLSearchParams(window.location.search);
  const scale = Number(params.get("scale") ?? "1");
  if (scale > 0 && scale <= 2) {
    document.documentElement.style.fontSize = `${scale * 100}%`;
  }
  const requested = params.get("platform");
  const platform: WindowPlatform =
    requested === "windows" || requested === "linux" ? requested : "macos";

  return (
    <main class="catalog-state-board">
      <For each={stateScenes}>
        {(scene) => (
          <CatalogStateScene
            locale={scene.locale}
            platform={platform}
            theme={scene.theme}
          />
        )}
      </For>
    </main>
  );
}
