import { app, BuniumWindow, showMessageBox, WindowControlError } from "bunium";

const closed: string[] = [];
const focusResults: string[] = [];
const sleep = (ms: number) => Bun.sleep(ms);
async function stage(name: string): Promise<void> {
  if (process.env.BUNIUM_WINDOW_CONTROLS_HOLD !== "1") return;
  console.log(`WINDOW_CONTROL_STAGE:${name}`);
  await sleep(5000);
}
function requestFocus(window: BuniumWindow, label: string): void {
  try {
    window.focus();
    focusResults.push(`${label}:focused`);
  } catch (error) {
    if (error instanceof WindowControlError && error.code === "failed") {
      focusResults.push(`${label}:os-refused`);
      return;
    }
    if (error instanceof WindowControlError && error.code === "unsupported") {
      focusResults.push(`${label}:unsupported`);
      return;
    }
    throw error;
  }
}
function expectUnsupported(action: () => void, label: string): void {
  let unsupported = false;
  try {
    action();
  } catch (error) {
    unsupported =
      error instanceof WindowControlError && error.code === "unsupported";
  }
  if (!unsupported) throw new Error(`${label} did not report unsupported`);
}
const main = new BuniumWindow({
  url: "about:blank",
  width: 480,
  height: 360,
  title: "01f native window controls fixture",
});
const dialog = new BuniumWindow({
  url: "about:blank",
  width: 360,
  height: 240,
  title: "01f owned dialog ordering fixture",
  resizable: false,
});
main.onClose(() => closed.push("main"));
dialog.onClose(() => closed.push("dialog"));

try {
  const mainCapabilities = main.controlCapabilities;
  const dialogCapabilities = dialog.controlCapabilities;
  if (
    !mainCapabilities.minimize ||
    !mainCapabilities.restore ||
    !mainCapabilities.show ||
    !mainCapabilities.hide
  ) {
    throw new Error(
      `common window capability report is incomplete: ${JSON.stringify(mainCapabilities)}`,
    );
  }
  if (dialogCapabilities.maximize) {
    throw new Error("non-resizable window advertised maximize support");
  }

  main.show();
  await stage("shown-without-focus-request");
  requestFocus(main, "main");
  requestFocus(main, "main-repeat");
  await stage("focus-requested");
  main.minimize();
  main.minimize();
  await stage("minimized");
  main.restore();
  main.restore();
  if (mainCapabilities.maximize) {
    main.maximize();
    main.maximize();
    await stage("maximized");
    main.restore();
  } else {
    expectUnsupported(() => main.maximize(), "maximize");
  }
  if (mainCapabilities.alwaysOnTop) {
    main.setAlwaysOnTop(true);
  } else {
    expectUnsupported(() => main.setAlwaysOnTop(true), "main always-on-top");
  }
  if (dialogCapabilities.alwaysOnTop) {
    dialog.setAlwaysOnTop(true);
  } else {
    expectUnsupported(
      () => dialog.setAlwaysOnTop(true),
      "dialog always-on-top",
    );
  }
  requestFocus(dialog, "dialog");
  requestFocus(main, "main-after-dialog");
  await stage(
    mainCapabilities.alwaysOnTop
      ? "floating-dialog-and-host"
      : "window-management-capabilities-limited",
  );
  if (process.env.BUNIUM_WINDOW_CONTROLS_MODAL === "1") {
    const result = await showMessageBox({
      message: "Native modal above an always-on-top host",
      detail: "Dismiss with the OK button to continue the native fixture.",
      okLabel: "OK",
    });
    console.log(`WINDOW_CONTROL_MODAL_RESULT:${result.response}`);
  }
  if (mainCapabilities.alwaysOnTop) main.setAlwaysOnTop(false);
  if (dialogCapabilities.alwaysOnTop) dialog.setAlwaysOnTop(false);
  main.hide();
  main.hide();
  await stage("hidden");
  main.show();

  expectUnsupported(() => dialog.maximize(), "fixed-size maximize");

  // Closing a window disposes its CEF view before releasing the native host.
  // Both calls and both close notifications must remain idempotent.
  dialog.close();
  dialog.close();
  main.close();
  main.close();
  if (closed.length !== 2 || closed[0] !== "dialog" || closed[1] !== "main") {
    throw new Error(
      `close listeners ran out of order or more than once: ${JSON.stringify(closed)}`,
    );
  }
  if (main.controlCapabilities.maximize || dialog.controlCapabilities.focus) {
    throw new Error("closed windows still report native controls");
  }
  let closedError = false;
  try {
    main.focus();
  } catch (error) {
    closedError =
      error instanceof WindowControlError && error.code === "closed";
  }
  if (!closedError)
    throw new Error("control after close did not report a closed-window error");

  console.log(
    `WINDOW_CONTROL_EVIDENCE:${JSON.stringify({ mainCapabilities, dialogCapabilities, focusResults, closed })}`,
  );
  console.log("NATIVE_WINDOW_CONTROLS_GATE:PASS");
} catch (error) {
  console.error(`NATIVE_WINDOW_CONTROLS_GATE:FAIL ${String(error)}`);
  process.exitCode = 1;
} finally {
  dialog.close();
  main.close();
  app.shutdown();
}
