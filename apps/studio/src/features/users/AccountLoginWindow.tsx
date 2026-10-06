import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  Show,
} from "solid-js";
import type {
  AccountService,
  AccountStatus,
  LoginState,
} from "../../contracts/account-service";
import type { Locale } from "../../i18n/locale";
import { Button, WindowShell } from "../../ui";

const words = {
  en: [
    "Sign in to Telegram",
    "Phone number",
    "Code",
    "Two-step verification password",
    "Continue",
    "Cancel",
    "Wait {time} seconds before trying again.",
    "Check your code or try again.",
    "Signed in as {name}",
    "Telegram API credentials are not configured in the host.",
    "Session-only storage is active. This login will not survive app restart.",
    "System secure storage is active.",
  ],
  ru: [
    "Войти в Telegram",
    "Номер телефона",
    "Код",
    "Пароль двухэтапной проверки",
    "Продолжить",
    "Отмена",
    "Повторите попытку через {time} с.",
    "Проверьте код и попробуйте снова.",
    "Вход выполнен: {name}",
    "В хосте не настроены данные Telegram API.",
    "Включено хранение только на время сеанса. После перезапуска вход будет потерян.",
    "Используется системное защищённое хранилище.",
  ],
  de: [
    "Bei Telegram anmelden",
    "Telefonnummer",
    "Code",
    "Passwort für die Bestätigung in zwei Schritten",
    "Weiter",
    "Abbrechen",
    "Versuche es in {time} Sekunden erneut.",
    "Prüfe den Code und versuche es erneut.",
    "Angemeldet als {name}",
    "Telegram-API-Zugangsdaten sind im Host nicht eingerichtet.",
    "Nur Sitzungsspeicher ist aktiv. Die Anmeldung bleibt nach einem Neustart nicht erhalten.",
    "System-Speicher ist aktiv.",
  ],
  fa: [
    "ورود به تلگرام",
    "شماره تلفن",
    "کد",
    "گذرواژهٔ تأیید دومرحله‌ای",
    "ادامه",
    "لغو",
    "پس از {time} ثانیه دوباره تلاش کنید.",
    "کد را بررسی و دوباره تلاش کنید.",
    "ورود به‌عنوان {name}",
    "اطلاعات API تلگرام در میزبان تنظیم نشده است.",
    "ذخیره‌سازی فقط برای این نشست فعال است؛ ورود پس از راه‌اندازی دوباره باقی نمی‌ماند.",
    "ذخیره‌سازی امن سیستم فعال است.",
  ],
  ar: [
    "تسجيل الدخول إلى تيليجرام",
    "رقم الهاتف",
    "الرمز",
    "كلمة مرور التحقق بخطوتين",
    "متابعة",
    "إلغاء",
    "حاول مجددًا بعد {time} ثانية.",
    "تحقق من الرمز وحاول مجددًا.",
    "تم تسجيل الدخول باسم {name}",
    "بيانات Telegram API غير مهيأة في المضيف.",
    "التخزين للجلسة الحالية فقط. لن يستمر تسجيل الدخول بعد إعادة تشغيل التطبيق.",
    "التخزين الآمن للنظام مفعّل.",
  ],
} as const;

export function AccountLoginWindow(props: {
  id: string;
  locale: Locale;
  service: AccountService;
  onComplete?: (identityId: string) => void;
  onClose?: () => void;
}) {
  const copy = createMemo(() => words[props.locale]);
  const [state, setState] = createSignal<LoginState>({ state: "phone" });
  const [phone, setPhone] = createSignal("");
  const [code, setCode] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [status, setStatus] = createSignal<AccountStatus | null>(null);
  const [remaining, setRemaining] = createSignal(0);
  let countdown: ReturnType<typeof setInterval> | undefined;
  createEffect(
    () => props.service,
    (service) => {
      void service
        .status()
        .then(setStatus)
        .catch(() => setStatus(null));
    },
  );
  countdown = window.setInterval(() => {
    const current = state();
    if (current.state !== "flood-wait") return;
    const next = Math.max(
      0,
      Math.ceil((Date.parse(current.retryAt) - Date.now()) / 1000),
    );
    setRemaining(next);
    if (next === 0) {
      if (current.resume === "phone") setState({ state: "phone" });
      else if (current.challengeId && current.resume === "code")
        setState({
          state: "code",
          challengeId: current.challengeId,
          maskedPhone: current.maskedPhone ?? "",
          expiresAt: current.retryAt,
        });
      else if (current.challengeId && current.resume === "password")
        setState({ state: "password", challengeId: current.challengeId });
    }
  }, 250);
  onCleanup(() => {
    if (countdown) window.clearInterval(countdown);
  });
  const perform = async (run: () => Promise<LoginState>) => {
    setBusy(true);
    try {
      const next = await run();
      setState(next.state === "cancelled" ? { state: "phone" } : next);
      if (next.state === "flood-wait")
        setRemaining(
          Math.max(
            0,
            Math.ceil((Date.parse(next.retryAt) - Date.now()) / 1000),
          ),
        );
      if (next.state === "cancelled") props.onClose?.();
      if (next.state === "code") setPhone("");
      if (next.state === "complete") props.onComplete?.(next.identityId);
    } catch {
      setState({ state: "error", code: "UNAVAILABLE" });
    } finally {
      setBusy(false);
      setCode("");
      setPassword("");
    }
  };
  const challengeId = () => {
    const current = state();
    return "challengeId" in current ? current.challengeId : undefined;
  };
  const maskedPhone = () => {
    const current = state();
    return current.state === "code" ? current.maskedPhone : "";
  };
  const profileName = () => {
    const current = state();
    return current.state === "complete" ? current.profile.firstName : "";
  };
  const codeError = () => {
    const current = state();
    return current.state === "code" && current.error;
  };
  const passwordError = () => {
    const current = state();
    return current.state === "password" && current.error;
  };
  return (
    <section
      class="account-login"
      lang={props.locale}
      dir={props.locale === "fa" || props.locale === "ar" ? "rtl" : "ltr"}
    >
      <WindowShell id={props.id} title={copy()[0]} platform="macos">
        <Show when={status() && !status()?.providerConfigured}>
          <p role="status">{copy()[9]}</p>
        </Show>
        <Show when={status()?.vault.mode === "session-only"}>
          <p role="status">{copy()[10]}</p>
        </Show>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const current = state();
            if (current.state === "phone")
              void perform(() => props.service.beginPhoneLogin(phone()));
            else if (current.state === "code")
              void perform(() =>
                props.service.submitCode(current.challengeId, code()),
              );
            else if (current.state === "password")
              void perform(() =>
                props.service.submitPassword(current.challengeId, password()),
              );
          }}
        >
          <Show when={state().state === "phone"}>
            <label>
              {copy()[1]}
              <input
                type="tel"
                autocomplete="tel"
                value={phone()}
                onInput={(event) => setPhone(event.currentTarget.value)}
              />
            </label>
          </Show>
          <Show when={state().state === "code"}>
            <p>{maskedPhone()}</p>
            <Show when={codeError()}>
              <p role="alert">{copy()[7]}</p>
            </Show>
            <label>
              {copy()[2]}
              <input
                inputmode="numeric"
                autocomplete="one-time-code"
                value={code()}
                onInput={(event) => setCode(event.currentTarget.value)}
              />
            </label>
          </Show>
          <Show when={state().state === "password"}>
            <Show when={passwordError()}>
              <p role="alert">{copy()[7]}</p>
            </Show>
            <label>
              {copy()[3]}
              <input
                type="password"
                autocomplete="current-password"
                value={password()}
                onInput={(event) => setPassword(event.currentTarget.value)}
              />
            </label>
          </Show>
          <Show when={state().state === "flood-wait"}>
            <p role="status">
              {copy()[6].replace("{time}", String(remaining()))}
            </p>
          </Show>
          <Show when={state().state === "error"}>
            <p role="alert">{copy()[7]}</p>
          </Show>
          <Show when={state().state === "complete"}>
            <p role="status">{copy()[8].replace("{name}", profileName())}</p>
          </Show>
          <div class="account-login__actions">
            <Button
              disabled={
                busy() ||
                (state().state === "flood-wait" && remaining() > 0) ||
                status()?.providerConfigured === false ||
                state().state === "complete"
              }
              type="submit"
            >
              {copy()[4]}
            </Button>
            <Button
              disabled={busy()}
              onClick={() =>
                void perform(() => props.service.cancel(challengeId()))
              }
            >
              {copy()[5]}
            </Button>
          </div>
        </form>
      </WindowShell>
    </section>
  );
}
