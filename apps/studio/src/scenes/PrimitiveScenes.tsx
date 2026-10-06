import { createSignal, For } from "solid-js";
import { dictionaries, directionFor, type Locale } from "../i18n/locale";
import { Button, IconButton, SecretField, TextField } from "../ui";

const stateScenes = [
  { theme: "light", locale: "en" },
  { theme: "dark", locale: "en" },
  { theme: "light", locale: "fa" },
  { theme: "dark", locale: "fa" },
] as const;

function PrimitiveStateScene(props: {
  locale: Locale;
  theme: "light" | "dark";
}) {
  const [name, setName] = createSignal("");
  const [secret, setSecret] = createSignal("demo-secret");
  const copy = dictionaries[props.locale].primitives;
  const idSuffix = `${props.theme}-${props.locale}`;

  return (
    <section
      class="primitive-state-scene"
      data-theme={props.theme}
      dir={directionFor(props.locale)}
      lang={props.locale}
    >
      <h2>{copy.sceneTitle}</h2>
      <div class="primitive-state-scene__actions">
        <Button variant="primary">{copy.primaryAction}</Button>
        <Button size="small" variant="secondary">
          {copy.secondaryAction}
        </Button>
        <Button loading>{copy.loadingAction}</Button>
        <Button disabled>{copy.disabledAction}</Button>
        <Button variant="danger">{copy.dangerAction}</Button>
        <IconButton aria-label={copy.iconAction}>
          <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
            <circle cx="5" cy="12" r="1.5" fill="currentColor" />
            <circle cx="12" cy="12" r="1.5" fill="currentColor" />
            <circle cx="19" cy="12" r="1.5" fill="currentColor" />
          </svg>
        </IconButton>
      </div>
      <div class="primitive-state-scene__fields">
        <TextField
          description={copy.fieldDescription}
          error={copy.fieldError}
          id={`project-${idSuffix}`}
          label={copy.fieldLabel}
          onValueChange={setName}
          required
          value={name()}
        />
        <TextField
          disabled
          id={`disabled-${idSuffix}`}
          label={copy.fieldLabel}
          onValueChange={() => undefined}
          value={copy.disabledAction}
        />
        <SecretField
          hideLabel={dictionaries[props.locale].fields.secret.hide}
          id={`secret-${idSuffix}`}
          label={copy.secretLabel}
          onValueChange={setSecret}
          revealLabel={dictionaries[props.locale].fields.secret.reveal}
          value={secret()}
        />
      </div>
    </section>
  );
}

export default function PrimitiveScenes() {
  return (
    <main class="primitive-state-board">
      <For each={stateScenes}>
        {(scene) => (
          <PrimitiveStateScene locale={scene.locale} theme={scene.theme} />
        )}
      </For>
    </main>
  );
}
