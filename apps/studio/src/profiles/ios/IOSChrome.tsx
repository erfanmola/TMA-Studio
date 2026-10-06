import { createSignal } from "solid-js";
import type { LaunchMode } from "../../contracts/entities";
import { Button, Dialog } from "../../ui";
import { IOS_PROFILE_CAPABILITIES } from "./capabilities";

export interface IOSChromeLabels {
  back: string;
  close: string;
  engine: string;
  menu: string;
  mode: string;
  miniApp: string;
  safeArea: string;
  sheetDescription: string;
  sheetTitle: string;
  statusBar: string;
}

/** Browser-rendered iOS profile approximation; it does not provide WebKit or iOS APIs. */
export default function IOSChrome(props: {
  labels: IOSChromeLabels;
  mode: LaunchMode;
  theme: "light" | "dark";
}) {
  const [sheetOpen, setSheetOpen] = createSignal(false);

  return (
    <div
      class="ios-chrome"
      data-theme={props.theme}
      data-mode={props.mode}
      data-engine={IOS_PROFILE_CAPABILITIES.engine}
      data-protocol-engine={IOS_PROFILE_CAPABILITIES.protocolEngine}
      data-safe-area-metrics={IOS_PROFILE_CAPABILITIES.safeAreaMetrics}
    >
      <div
        class="ios-chrome__status"
        role="status"
        aria-label={props.labels.statusBar}
      >
        <span>9:41</span>
        <span class="ios-chrome__island" aria-hidden="true" />
        <span aria-hidden="true">●●● ▰</span>
      </div>
      <header class="ios-chrome__header">
        <button
          class="ios-chrome__back"
          type="button"
          aria-label={props.labels.back}
          onClick={() => setSheetOpen(true)}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <strong>{props.labels.miniApp}</strong>
        <button
          class="ios-chrome__menu"
          type="button"
          aria-label={props.labels.menu}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen() ? "true" : "false"}
          onClick={() => setSheetOpen(true)}
        >
          ···
        </button>
      </header>
      <span class="ios-chrome__engine">{props.labels.engine}</span>
      <Dialog
        class="ios-chrome__sheet"
        description={props.labels.sheetDescription}
        dismissOnBackdrop
        footer={
          <Button variant="primary" onClick={() => setSheetOpen(false)}>
            {props.labels.close}
          </Button>
        }
        id="ios-profile-sheet"
        onCancel={() => setSheetOpen(false)}
        open={sheetOpen()}
        title={props.labels.sheetTitle}
      />
      <div class="ios-chrome__home-indicator" aria-hidden="true" />
      <span class="ios-chrome__safe-area">{props.labels.safeArea}</span>
      <span class="ios-chrome__frame" aria-hidden="true" />
      <span class="ios-chrome__mode" aria-hidden="true">
        {props.mode}
      </span>
    </div>
  );
}
