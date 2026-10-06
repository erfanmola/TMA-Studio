import { createEffect, createSignal, Show, untrack } from "solid-js";
import type { Identity } from "../../contracts/entities";
import { dictionaries, type Locale } from "../../i18n/locale";
import {
  Avatar,
  Button,
  Switch,
  TextField,
  type WindowPlatform,
  WindowShell,
} from "../../ui";
import type { MockUserFields, UsersService } from "./service";
import { identityName, identityPhoto, identityTelegramId } from "./UsersWindow";

export type UserWindowProps = {
  id: string;
  identityId: string | null;
  locale: Locale;
  onClose: () => void;
  onRefresh?: (identityId: string) => Promise<void>;
  onSaved: (identity: Identity) => void;
  platform: WindowPlatform;
  service: UsersService;
  theme?: "light" | "dark";
};

export function UserWindow(props: UserWindowProps) {
  const copy = untrack(() => dictionaries[props.locale].users);
  const [identity, setIdentity] = createSignal<Identity | null>(null);
  const [loading, setLoading] = createSignal(
    untrack(() => props.identityId !== null),
  );
  const [fields, setFields] = createSignal<MockUserFields>({
    firstName: "",
    telegramId: "9007199254741000",
    languageCode: "en",
    isPremium: false,
  });
  const [errors, setErrors] = createSignal<string[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [refreshing, setRefreshing] = createSignal(false);
  const [failed, setFailed] = createSignal(false);

  let loadGeneration = 0;
  createEffect(
    () => props.identityId,
    (identityId) => {
      const generation = ++loadGeneration;
      setLoading(identityId !== null);
      if (!identityId) {
        setIdentity(null);
        return;
      }
      setIdentity(null);
      void props.service
        .getIdentity(identityId)
        .then((current) => {
          if (generation !== loadGeneration) return;
          setIdentity(current);
          setLoading(false);
          if (current?.kind === "mock") {
            const {
              id: _id,
              kind: _kind,
              revision: _revision,
              ...editable
            } = current;
            setFields(editable);
          } else if (current?.kind === "telegram") {
            setFields({
              telegramId: current.profile.telegramId,
              firstName: current.profile.firstName,
              lastName: current.profile.lastName,
              username: current.profile.username,
              languageCode: current.profile.languageCode ?? "",
              isPremium: current.profile.isPremium,
              photoUrl: current.profile.photoUrl,
            });
          }
        })
        .catch(() => {
          if (generation === loadGeneration) {
            setLoading(false);
            setFailed(true);
          }
        });
    },
  );

  const edit = (key: keyof MockUserFields, value: MockUserFields[typeof key]) =>
    setFields((current) => ({ ...current, [key]: value }));

  const save = async () => {
    const current = identity();
    const next = fields();
    const invalid: string[] = [];
    if (!next.firstName.trim()) invalid.push("firstName");
    if (!/^\d{1,32}$/u.test(next.telegramId)) invalid.push("telegramId");
    if (next.photoUrl) {
      try {
        const url = new URL(next.photoUrl);
        if (url.protocol !== "https:" && url.protocol !== "http:")
          invalid.push("photoUrl");
      } catch {
        invalid.push("photoUrl");
      }
    }
    setErrors(invalid);
    if (invalid.length > 0) return;
    setBusy(true);
    setFailed(false);
    try {
      const saved = await props.service.saveMock(
        {
          ...next,
          firstName: next.firstName.trim(),
          telegramId: next.telegramId.trim(),
        },
        current?.kind === "mock" ? current.id : undefined,
        current?.kind === "mock" ? current.revision : undefined,
      );
      setIdentity(saved);
      props.onSaved(saved);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const canEdit = () =>
    !loading() && (props.identityId === null || identity()?.kind === "mock");
  const readOnly = () => !canEdit();
  const refreshAccount = async () => {
    const current = identity();
    if (current?.kind !== "telegram" || !props.onRefresh) return;
    setRefreshing(true);
    try {
      await props.onRefresh(current.id);
      setIdentity(await props.service.getIdentity(current.id));
    } finally {
      setRefreshing(false);
    }
  };
  const title = () =>
    loading()
      ? copy.loadingProfile
      : identity()
        ? identityName(identity() as Identity)
        : copy.newWindowTitle;
  const safePhotoUrl = () => {
    const candidate = fields().photoUrl;
    if (!candidate) return undefined;
    try {
      const url = new URL(candidate);
      return url.protocol === "http:" || url.protocol === "https:"
        ? candidate
        : undefined;
    } catch {
      return undefined;
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
        class="user-feature-window"
        footer={
          <>
            <Button onClick={props.onClose}>{copy.close}</Button>
            <Show when={canEdit()}>
              <Button
                id={`${props.id}-save`}
                loading={busy()}
                onClick={() => void save()}
                variant="primary"
              >
                {copy.save}
              </Button>
            </Show>
            <Show when={identity()?.kind === "telegram" && props.onRefresh}>
              <Button
                id={`${props.id}-refresh-profile`}
                loading={refreshing()}
                onClick={() => void refreshAccount()}
              >
                {copy.refreshProfile}
              </Button>
            </Show>
          </>
        }
        id={props.id}
        platform={props.platform}
        title={title()}
      >
        <div class="users-feature__form">
          <Avatar
            imageUrl={
              identity()
                ? identityPhoto(identity() as Identity)
                : safePhotoUrl()
            }
            kind="user"
            label={title()}
            locale={props.locale}
            name={title() || "?"}
            size="large"
            telegramId={
              identity()
                ? identityTelegramId(identity() as Identity)
                : fields().telegramId
            }
          />
          <TextField
            disabled={readOnly()}
            error={
              errors().includes("firstName") ? copy.requiredError : undefined
            }
            id={`${props.id}-first`}
            label={copy.firstName}
            onValueChange={(value) => edit("firstName", value)}
            required
            value={fields().firstName}
          />
          <TextField
            disabled={readOnly()}
            id={`${props.id}-last`}
            label={copy.lastName}
            onValueChange={(value) => edit("lastName", value || undefined)}
            value={fields().lastName ?? ""}
          />
          <TextField
            class="ltr-isolate"
            disabled={readOnly()}
            error={errors().includes("telegramId") ? copy.idError : undefined}
            id={`${props.id}-telegram-id`}
            inputmode="numeric"
            label={copy.telegramId}
            onValueChange={(value) => edit("telegramId", value)}
            required
            value={fields().telegramId}
          />
          <TextField
            disabled={readOnly()}
            id={`${props.id}-username`}
            label={copy.username}
            onValueChange={(value) => edit("username", value || undefined)}
            value={fields().username ?? ""}
          />
          <TextField
            disabled={readOnly()}
            id={`${props.id}-language`}
            label={copy.languageCode}
            onValueChange={(value) => edit("languageCode", value)}
            value={fields().languageCode}
          />
          <TextField
            class="ltr-isolate"
            disabled={readOnly()}
            error={
              errors().includes("photoUrl") ? copy.photoUrlError : undefined
            }
            id={`${props.id}-photo`}
            label={copy.photoUrl}
            onValueChange={(value) => edit("photoUrl", value || undefined)}
            type="url"
            value={fields().photoUrl ?? ""}
          />
          <Switch
            checked={fields().isPremium}
            disabled={readOnly()}
            id={`${props.id}-premium`}
            label={copy.premium}
            onCheckedChange={(checked) => edit("isPremium", checked)}
          />
          <Show when={readOnly()}>
            <p class="users-feature__placeholder" role="status">
              {copy.readOnlyPlaceholder}
            </p>
          </Show>
          <Show when={failed()}>
            <p class="users-feature__error" role="alert">
              {copy.saveError}
            </p>
          </Show>
        </div>
      </WindowShell>
    </section>
  );
}
