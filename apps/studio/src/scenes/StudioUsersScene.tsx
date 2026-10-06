import { createSignal, onCleanup, Show } from "solid-js";
import { BuniumAccountBridgeService } from "../features/users/account-bridge-service";
import { UsersWindow } from "../features/users/UsersWindow";
import { UserWindow } from "../features/users/UserWindow";
import { BuniumUsersBridgeService } from "../features/users/users-bridge-service";
import type { Locale } from "../i18n/locale";
import type { WindowPlatform } from "../ui";
import "../features/users/users.scss";

function localeFromUrl(): Locale {
  const locale = new URLSearchParams(window.location.search).get("locale");
  return locale && ["en", "ru", "de", "fa", "ar"].includes(locale)
    ? (locale as Locale)
    : "en";
}

export default function StudioUsersScene() {
  const locale = localeFromUrl();
  const platformValue = new URLSearchParams(window.location.search).get(
    "platform",
  );
  const platform: WindowPlatform =
    platformValue === "windows" || platformValue === "linux"
      ? platformValue
      : "macos";
  const theme =
    new URLSearchParams(window.location.search).get("theme") === "dark"
      ? "dark"
      : "light";
  const accountService = new BuniumAccountBridgeService();
  const usersService = new BuniumUsersBridgeService();
  onCleanup(() => {
    accountService.close();
    usersService.close();
  });
  const [detailId, setDetailId] = createSignal<string | null | "">("");

  return (
    <section
      class="users-scene"
      data-scene={`users-${theme}-${locale}`}
      data-theme={theme}
      dir={locale === "fa" || locale === "ar" ? "rtl" : "ltr"}
      lang={locale}
    >
      <span aria-hidden="true" class="users-scene__font-sample">
        نمونهٔ فارسی
      </span>
      <UsersWindow
        id={`users-${theme}-${locale}-window`}
        locale={locale}
        onCreate={() => setDetailId(null)}
        onDelete={(id) => {
          if (detailId() === id) setDetailId("");
        }}
        onOpenUser={setDetailId}
        accountService={accountService}
        platform={platform}
        service={usersService}
        theme={theme}
      />
      <Show when={detailId() !== ""}>
        <UserWindow
          id={`users-${theme}-${locale}-detail`}
          identityId={detailId()}
          locale={locale}
          onClose={() => setDetailId("")}
          onRefresh={async (identityId) => {
            await accountService.refresh(identityId);
          }}
          onSaved={(identity) => setDetailId(identity.id)}
          platform={platform}
          service={usersService}
          theme={theme}
        />
      </Show>
    </section>
  );
}
