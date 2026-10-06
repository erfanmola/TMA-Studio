import { createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import type { AccountService } from "../../contracts/account-service";
import type { Identity } from "../../contracts/entities";
import { dictionaries, formatMessage, type Locale } from "../../i18n/locale";
import {
  Avatar,
  Button,
  ConfirmDialog,
  Select,
  SidebarList,
  type WindowPlatform,
  WindowShell,
} from "../../ui";
import { AccountLoginWindow } from "./AccountLoginWindow";
import type { UsersService } from "./service";

export type UsersWindowProps = {
  id: string;
  locale: Locale;
  onCreate: () => void;
  onDelete: (identityId: string) => void;
  onOpenUser: (identityId: string) => void;
  onLoginComplete?: (identityId: string) => void;
  accountService?: AccountService;
  platform: WindowPlatform;
  service: UsersService;
  theme?: "light" | "dark";
};

export function identityName(identity: Identity): string {
  const profile = identity.kind === "mock" ? identity : identity.profile;
  return [profile.firstName, profile.lastName].filter(Boolean).join(" ");
}

export function identityPhoto(identity: Identity): string | undefined {
  return identity.kind === "mock"
    ? identity.photoUrl
    : identity.profile.photoUrl;
}

export function identityTelegramId(identity: Identity): string {
  return identity.kind === "mock"
    ? identity.telegramId
    : identity.profile.telegramId;
}

export function UsersWindow(props: UsersWindowProps) {
  const copy = dictionaries[props.locale].users;
  const [identities, setIdentities] = createSignal<Identity[]>([]);
  const [selectedId, setSelectedId] = createSignal<string | undefined>();
  const [deleting, setDeleting] = createSignal<Identity | null>(null);
  const [references, setReferences] = createSignal<
    Awaited<ReturnType<UsersService["listProjectReferences"]>>
  >([]);
  const [reassignTo, setReassignTo] = createSignal("");
  const [error, setError] = createSignal(false);
  const [loginOpen, setLoginOpen] = createSignal(false);

  const reload = async (preferId?: string) => {
    if (props.accountService && props.service.setRealIdentities) {
      try {
        const accounts = await props.accountService.listAccounts();
        props.service.setRealIdentities(
          accounts.map((account) => ({
            ...account,
            kind: "telegram" as const,
            accountRef: "host-managed",
          })),
        );
      } catch {
        // Keep the last safe local snapshot visible if account listing fails.
      }
    }
    const next = await props.service.listIdentities();
    setIdentities(next);
    const stillThere = next.some((identity) => identity.id === preferId);
    setSelectedId(stillThere ? preferId : (next[0]?.id ?? undefined));
  };
  void reload();
  const unsubscribe = props.service.subscribe?.(
    () => void reload(selectedId()),
  );
  if (unsubscribe) onCleanup(unsubscribe);

  const selected = createMemo(
    () => identities().find((identity) => identity.id === selectedId()) ?? null,
  );
  const sidebarItems = createMemo(() =>
    identities().map((identity) => {
      const name = identityName(identity);
      const isMock = identity.kind === "mock";
      return {
        id: identity.id,
        leading: (
          <Avatar
            imageUrl={isMock ? identity.photoUrl : identity.profile.photoUrl}
            kind="user"
            locale={props.locale}
            name={name}
            telegramId={
              isMock ? identity.telegramId : identity.profile.telegramId
            }
          />
        ),
        subtitle: isMock
          ? identity.isPremium
            ? copy.mockPremium
            : copy.mockBadge
          : copy.realPlaceholder,
        title: name,
      };
    }),
  );

  const beginDelete = async (identity: Identity) => {
    if (identity.kind !== "mock") return;
    const projectRefs = await props.service.listProjectReferences(identity.id);
    setReferences(projectRefs);
    setReassignTo(
      identities().find((entry) => entry.id !== identity.id)?.id ?? "",
    );
    setError(false);
    setDeleting(identity);
  };

  const confirmDelete = async () => {
    const target = deleting();
    if (target?.kind !== "mock") return;
    try {
      await props.service.deleteMock(
        target.id,
        target.revision,
        references().length > 0 ? reassignTo() : undefined,
      );
      setDeleting(null);
      props.onDelete(target.id);
      await reload();
    } catch {
      setError(true);
    }
  };

  const reassignOptions = () =>
    identities()
      .filter((identity) => identity.id !== deleting()?.id)
      .map((identity) => ({
        label: identityName(identity),
        value: identity.id,
      }));

  const profileStatus = (identity: Identity) => {
    if (identity.kind !== "telegram") return "";
    switch (identity.status) {
      case "ready":
        return copy.profileReady;
      case "stale":
        return copy.profileStale;
      case "reauthorize":
        return copy.profileReauthorize;
    }
  };

  return (
    <section
      class="users-feature"
      data-theme={props.theme ?? "light"}
      dir={props.locale === "fa" || props.locale === "ar" ? "rtl" : "ltr"}
      lang={props.locale}
    >
      <WindowShell
        id={props.id}
        platform={props.platform}
        sidebar={
          <SidebarList
            emptyLabel={copy.empty}
            id={`${props.id}-list`}
            items={sidebarItems()}
            label={copy.listTitle}
            onSelect={(id) => {
              setSelectedId(id);
              props.onOpenUser(id);
            }}
            selectedId={selectedId()}
          />
        }
        title={copy.windowTitle}
        titlebarActions={
          <Button
            id={`${props.id}-create`}
            onClick={props.onCreate}
            size="small"
            variant="primary"
          >
            {copy.createAction}
          </Button>
        }
      >
        <div class="users-feature__body">
          <header class="users-feature__hero">
            <h2>{copy.heroTitle}</h2>
            <p>{copy.heroDescription}</p>
            <Button
              disabled={!props.accountService}
              onClick={() => setLoginOpen(true)}
              title={props.accountService ? undefined : copy.loginUnavailable}
            >
              {copy.loginAction}
            </Button>
          </header>
          <Show
            fallback={<p class="users-feature__empty">{copy.empty}</p>}
            when={selected()}
          >
            {(identity) => (
              <article class="users-feature__selected">
                <Avatar
                  imageUrl={identityPhoto(identity())}
                  kind="user"
                  locale={props.locale}
                  name={identityName(identity())}
                  size="large"
                  telegramId={identityTelegramId(identity())}
                />
                <div>
                  <h3>{identityName(identity())}</h3>
                  <p>
                    {identity().kind === "mock"
                      ? copy.mockBadge
                      : copy.realPlaceholder}
                  </p>
                  <Show when={identity().kind === "telegram"}>
                    <p class="users-feature__account-status" role="status">
                      {profileStatus(identity())}
                    </p>
                  </Show>
                  <Show
                    when={
                      identity().kind === "telegram" && props.accountService
                    }
                  >
                    <Button
                      disabled={!props.accountService}
                      onClick={() => {
                        const target = identity();
                        if (target.kind !== "telegram" || !props.accountService)
                          return;
                        void props.accountService
                          .refresh(target.id)
                          .then(() => reload(target.id))
                          .catch(() => reload(target.id));
                      }}
                      size="small"
                    >
                      {copy.refreshProfile}
                    </Button>
                  </Show>
                  <Button
                    onClick={() => props.onOpenUser(identity().id)}
                    size="small"
                  >
                    {copy.openDetails}
                  </Button>
                  <Show when={identity().kind === "mock"}>
                    <Button
                      onClick={() => void beginDelete(identity())}
                      size="small"
                      variant="danger"
                    >
                      {copy.deleteAction}
                    </Button>
                  </Show>
                </div>
              </article>
            )}
          </Show>
        </div>
      </WindowShell>
      <ConfirmDialog
        cancelLabel={copy.cancel}
        confirmLabel={copy.deleteAction}
        destructive
        description={
          references().length > 0
            ? formatMessage(copy.reassignDescription, {
                count: String(references().length),
                name: deleting() ? identityName(deleting() as Identity) : "",
              })
            : formatMessage(copy.deleteDescription, {
                name: deleting() ? identityName(deleting() as Identity) : "",
              })
        }
        id={`${props.id}-delete`}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        open={deleting() !== null}
        title={
          deleting()
            ? formatMessage(copy.deleteTitle, {
                name: identityName(deleting() as Identity),
              })
            : copy.deleteAction
        }
      >
        <Show when={references().length > 0}>
          <Select
            id={`${props.id}-reassign`}
            label={copy.reassignLabel}
            onValueChange={setReassignTo}
            options={reassignOptions()}
            value={reassignTo()}
          />
          <ul class="users-feature__references">
            <For each={references()}>
              {(project) => <li>{project.name}</li>}
            </For>
          </ul>
        </Show>
        <Show when={error()}>
          <p role="alert">{copy.deleteError}</p>
        </Show>
      </ConfirmDialog>
      <Show when={loginOpen() && props.accountService}>
        {(accountService) => (
          <div class="account-login-overlay" role="presentation">
            <AccountLoginWindow
              id={`${props.id}-account-login`}
              locale={props.locale}
              onClose={() => setLoginOpen(false)}
              onComplete={(identityId) => {
                setLoginOpen(false);
                props.onLoginComplete?.(identityId);
                void reload(identityId);
              }}
              service={accountService()}
            />
          </div>
        )}
      </Show>
    </section>
  );
}
