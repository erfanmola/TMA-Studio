import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const uiRoot = new URL("../../packages/ui/src/", import.meta.url);
const buttonSource = readFileSync(
  new URL("components/Button.tsx", uiRoot),
  "utf8",
);
const iconButtonSource = readFileSync(
  new URL("components/IconButton.tsx", uiRoot),
  "utf8",
);
const fieldRowSource = readFileSync(
  new URL("components/FieldRow.tsx", uiRoot),
  "utf8",
);
const textFieldSource = readFileSync(
  new URL("components/TextField.tsx", uiRoot),
  "utf8",
);
const secretFieldSource = readFileSync(
  new URL("components/SecretField.tsx", uiRoot),
  "utf8",
);
const sceneSource = readFileSync(
  new URL("../../apps/studio/src/scenes/PrimitiveScenes.tsx", import.meta.url),
  "utf8",
);
const appSource = readFileSync(
  new URL("../../apps/studio/src/App.tsx", import.meta.url),
  "utf8",
);
const styleSource = readFileSync(
  new URL("styles/_primitives.scss", uiRoot),
  "utf8",
);
const tokenSource = readFileSync(
  new URL("styles/_tokens.scss", uiRoot),
  "utf8",
);

describe("primitive state scenes", () => {
  test("actions retain native keyboard semantics, names, busy state and fixed control geometry", () => {
    expect(buttonSource).toContain("<button");
    expect(buttonSource).toContain('type={props.type ?? "button"}');
    expect(buttonSource).toContain(
      "disabled={props.disabled || props.loading}",
    );
    expect(buttonSource).toContain(
      'aria-busy={props.loading ? "true" : undefined}',
    );
    expect(iconButtonSource).toContain('"aria-label": string');
    expect(iconButtonSource).toContain("<button");
    expect(styleSource).toContain(":hover:not(:disabled)");
    expect(styleSource).toContain(":active:not(:disabled)");
    expect(styleSource).toContain(":focus-visible");
    expect(styleSource).toContain(":disabled");
    expect(styleSource).toContain(".studio-button.is-loading");
    expect(styleSource).toContain(".studio-button__label");
    expect(styleSource).toContain("prefers-reduced-motion: reduce");
  });

  test("fields are controlled and associate visible labels, help and errors", () => {
    expect(fieldRowSource).toContain('class="studio-field-row__label"');
    expect(fieldRowSource).toContain("for={props.id}");
    expect(fieldRowSource).toContain("-label`}");
    expect(fieldRowSource).toContain('role="alert"');
    expect(textFieldSource).toContain("value={props.value}");
    expect(textFieldSource).toContain(
      "onInput={(event) => props.onValueChange(event.currentTarget.value)}",
    );
    expect(textFieldSource).toContain("describedByIds(");
    expect(textFieldSource).toContain('props["aria-describedby"],');
    expect(textFieldSource).toContain(
      'aria-invalid={props.error ? "true" : props["aria-invalid"]}',
    );
    expect(styleSource).toContain(".studio-input-shell:focus-within");
    expect(styleSource).toContain('[data-invalid="true"]');
  });

  test("secret reveal toggles a password input and resets when focus exits the field", () => {
    expect(secretFieldSource).toContain(
      'type={revealed() ? "text" : "password"}',
    );
    expect(secretFieldSource).toContain(
      'aria-pressed={revealed() ? "true" : "false"}',
    );
    expect(secretFieldSource).toContain("revealLabel");
    expect(secretFieldSource).toContain("hideLabel");
    expect(textFieldSource).toContain("onControlExit?.()");
    expect(tokenSource).toContain(':root, [data-theme="light"]');
    expect(tokenSource).toContain('[data-theme="dark"]');
    expect(styleSource).toContain("padding-inline:");
  });

  test("provides light/dark English/Persian review scenes without a feature page", () => {
    expect(sceneSource).toContain('{ theme: "light", locale: "en" }');
    expect(sceneSource).toContain('{ theme: "dark", locale: "en" }');
    expect(sceneSource).toContain('{ theme: "light", locale: "fa" }');
    expect(sceneSource).toContain('{ theme: "dark", locale: "fa" }');
    expect(sceneSource).toContain("data-theme={props.theme}");
    expect(sceneSource).toContain("dir={directionFor(props.locale)}");
    expect(sceneSource).toContain("lang={props.locale}");
    expect(sceneSource).toContain("<SecretField");
    expect(sceneSource).toContain("<TextField");
    expect(sceneSource).toContain("<Button loading>");
    expect(sceneSource).toContain("<Button disabled>");
    expect(sceneSource).toContain('<Button variant="danger">');
    expect(appSource).toContain("import.meta.env.DEV");
    expect(appSource).toContain('scene === "primitives"');
  });
});
