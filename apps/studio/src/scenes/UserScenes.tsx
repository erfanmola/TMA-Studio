import { createSignal, For, onCleanup, Show } from "solid-js";
import type {
  AccountIdentityView,
  AccountService,
} from "../contracts/account-service";
import type { Identity } from "../contracts/entities";
import { BuniumAccountBridgeService } from "../features/users/account-bridge-service";
import { MemoryUsersService } from "../features/users/memory-service";
import { UsersWindow } from "../features/users/UsersWindow";
import { UserWindow } from "../features/users/UserWindow";
import { dictionaries, type Locale } from "../i18n/locale";
import "../features/users/users.scss";

const scenes = [
  { locale: "en", theme: "light" },
  { locale: "en", theme: "dark" },
  { locale: "fa", theme: "light" },
  { locale: "fa", theme: "dark" },
] as const;

function reviewAccountService(): AccountService {
  const profile = {
    telegramId: "765432109",
    firstName: "Fixture Account",
    username: "fixture_account",
    languageCode: "en",
    isPremium: false,
  };
  const accounts: AccountIdentityView[] = [];
  const complete = () => {
    if (accounts.length === 0)
      accounts.push({
        id: "fixture-identity",
        profile,
        status: "ready",
        revision: 1,
        refreshedAt: new Date().toISOString(),
      });
    return {
      state: "complete" as const,
      identityId: "fixture-identity",
      profile,
    };
  };
  return {
    async status() {
      return {
        providerConfigured: true,
        vault: { mode: "session-only", backend: "memory" },
      };
    },
    async listAccounts() {
      return accounts.map((account) => structuredClone(account));
    },
    async beginPhoneLogin(phone) {
      if (phone.endsWith("124"))
        return {
          state: "flood-wait",
          retryAt: new Date(Date.now() + 1_000).toISOString(),
          resume: "phone",
        };
      return {
        state: "code",
        challengeId: "fixture-challenge",
        maskedPhone: "+15••••23",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      };
    },
    async submitCode(_challengeId, code) {
      if (code === "00000")
        return {
          state: "code",
          challengeId: "fixture-challenge",
          maskedPhone: "+15••••23",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          error: "INVALID_CODE",
        };
      if (code === "11111")
        return { state: "password", challengeId: "fixture-challenge" };
      return complete();
    },
    async submitPassword() {
      return complete();
    },
    async cancel() {
      return { state: "cancelled" };
    },
    async refresh() {
      return complete();
    },
  };
}

function sampleIdentity(
  locale: Locale,
  kind: "alex" | "nima" | "sara",
): Identity {
  const copy = dictionaries[locale].users;
  if (kind === "sara") {
    return {
      id: "telegram-sara",
      kind: "telegram",
      accountRef: "account-review-only",
      profile: {
        telegramId: "133777000",
        firstName: copy.sampleSara,
        languageCode: "fa",
        isPremium: false,
        photoUrl: "data:image/png;base64,AAAA",
      },
      status: "reauthorize",
      revision: 1,
    };
  }
  return {
    id: kind === "alex" ? "mock-alex" : "mock-nima",
    kind: "mock",
    telegramId: kind === "alex" ? "9007199254740993" : "5000000003",
    firstName: kind === "alex" ? copy.sampleAlex : copy.sampleNima,
    lastName: kind === "alex" ? "Morgan" : "Rostami",
    username: kind === "alex" ? "alex_m" : "nima_r",
    languageCode: "en",
    isPremium: kind === "alex",
    ...(kind === "nima" ? { photoUrl: "data:image/png;base64,AAAA" } : {}),
    revision: 1,
  };
}

function UserScene(props: {
  locale: Locale;
  theme: "light" | "dark";
  accountService: AccountService;
}) {
  const copy = dictionaries[props.locale].users;
  const identities = [
    sampleIdentity(props.locale, "alex"),
    sampleIdentity(props.locale, "nima"),
    sampleIdentity(props.locale, "sara"),
  ];
  const service = new MemoryUsersService(identities, [
    { id: "orbit", identityId: "mock-alex", name: "Orbit Store" },
    { id: "paper", identityId: "mock-alex", name: "Paper Plane" },
  ]);
  const syncAccounts = async () => {
    const accounts = await props.accountService.listAccounts();
    service.setRealIdentities(
      accounts.map((account) => ({
        ...account,
        kind: "telegram" as const,
        accountRef: "host-managed",
      })),
    );
  };
  const [detailId, setDetailId] = createSignal<string | null>("mock-alex");
  const [returnIdentity, setReturnIdentity] = createSignal<string | null>(null);
  const sceneId = `users-${props.theme}-${props.locale}`;

  return (
    <section
      class="users-scene"
      data-scene={sceneId}
      data-theme={props.theme}
      dir={props.locale === "fa" || props.locale === "ar" ? "rtl" : "ltr"}
      lang={props.locale}
    >
      <span aria-hidden="true" class="users-scene__font-sample">
        نمونهٔ فارسی
      </span>
      <UsersWindow
        id={`${sceneId}-window`}
        locale={props.locale}
        onCreate={() => {
          setDetailId(null);
        }}
        onDelete={(id) => {
          if (detailId() === id) setDetailId("");
        }}
        onOpenUser={setDetailId}
        onLoginComplete={setReturnIdentity}
        accountService={props.accountService}
        platform="macos"
        service={service}
        theme={props.theme}
      />
      <Show when={detailId() !== ""}>
        <UserWindow
          id={`${sceneId}-detail`}
          identityId={detailId()}
          locale={props.locale}
          onClose={() => setDetailId("")}
          onRefresh={async (identityId) => {
            await props.accountService.refresh(identityId);
            await syncAccounts();
          }}
          onSaved={(identity) => {
            setDetailId(identity.id);
            setReturnIdentity(identity.id);
          }}
          platform="macos"
          service={service}
          theme={props.theme}
        />
      </Show>
      <output
        class="users-scene__return"
        data-returned-identity={returnIdentity() ?? ""}
      >
        {returnIdentity() ? copy.returnedToProject : ""}
      </output>
    </section>
  );
}

export default function UserScenes() {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("locale");
  const locale =
    requested && ["en", "ru", "de", "fa", "ar"].includes(requested)
      ? (requested as Locale)
      : null;
  const theme = params.get("theme") === "dark" ? "dark" : "light";
  const accountService = window.__bunium
    ? new BuniumAccountBridgeService()
    : reviewAccountService();
  if (accountService instanceof BuniumAccountBridgeService)
    onCleanup(() => accountService.close());
  if (locale)
    return (
      <UserScene
        locale={locale}
        theme={theme}
        accountService={accountService}
      />
    );
  if (!import.meta.env.DEV)
    return (
      <UserScene locale="en" theme="light" accountService={accountService} />
    );
  return (
    <main class="users-scene-board">
      <For each={scenes}>
        {(scene) => (
          <UserScene
            locale={scene.locale}
            theme={scene.theme}
            accountService={accountService}
          />
        )}
      </For>
    </main>
  );
}
