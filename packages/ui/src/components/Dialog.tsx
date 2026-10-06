import type { JSX } from "@solidjs/web";
import { createEffect, onCleanup, Show } from "solid-js";
import { Button } from "./Button";

export type DialogProps = {
  children?: JSX.Element;
  class?: string;
  description?: string;
  /** Backdrop clicks cancel only when allowed; destructive flows keep it off. */
  dismissOnBackdrop?: boolean;
  footer?: JSX.Element;
  id: string;
  onCancel: () => void;
  open: boolean;
  title: string;
};

/**
 * Modal native dialog: the browser makes the page inert and traps focus.
 * Escape and backdrop requests call onCancel; the owner closes it by setting
 * open=false, after which focus returns to the element that opened it.
 */
export function Dialog(props: DialogProps) {
  let dialog: HTMLDialogElement | undefined;
  let returnFocus: HTMLElement | null = null;

  createEffect(
    () => props.open,
    (open) => {
      if (!dialog) return;
      if (open && !dialog.open) {
        returnFocus = document.activeElement as HTMLElement | null;
        dialog.showModal();
      } else if (!open && dialog.open) {
        dialog.close();
        if (returnFocus?.isConnected) returnFocus.focus();
        returnFocus = null;
      }
    },
  );
  onCleanup(() => {
    if (dialog?.open) dialog.close();
  });

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click mirrors Escape, which the cancel event handles.
    <dialog
      aria-describedby={
        props.description ? `${props.id}-description` : undefined
      }
      aria-labelledby={`${props.id}-title`}
      class={`studio-dialog${props.class ? ` ${props.class}` : ""}`}
      id={props.id}
      onCancel={(event) => {
        event.preventDefault();
        props.onCancel();
      }}
      onClick={(event) => {
        if (props.dismissOnBackdrop && event.target === event.currentTarget) {
          props.onCancel();
        }
      }}
      onClose={() => {
        // A forced close (repeated Escape) still reports a cancellation.
        if (props.open) props.onCancel();
      }}
      ref={(element) => {
        dialog = element;
      }}
    >
      <div class="studio-dialog__body">
        <h2 class="studio-dialog__title" id={`${props.id}-title`}>
          {props.title}
        </h2>
        <Show when={props.description}>
          <p class="studio-dialog__description" id={`${props.id}-description`}>
            {props.description}
          </p>
        </Show>
        {props.children}
      </div>
      <Show when={props.footer}>
        <div class="studio-dialog__footer">{props.footer}</div>
      </Show>
    </dialog>
  );
}

export type ConfirmDialogProps = Omit<DialogProps, "footer"> & {
  cancelLabel: string;
  confirmLabel: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
};

/** Confirmation; destructive variants start focus on Cancel. */
export function ConfirmDialog(props: ConfirmDialogProps) {
  return (
    <Dialog
      class={props.class}
      description={props.description}
      dismissOnBackdrop={props.destructive ? false : props.dismissOnBackdrop}
      footer={
        <>
          <Button
            autofocus={props.destructive}
            disabled={props.loading}
            onClick={() => props.onCancel()}
          >
            {props.cancelLabel}
          </Button>
          <Button
            autofocus={!props.destructive}
            loading={props.loading}
            onClick={() => props.onConfirm()}
            variant={props.destructive ? "danger" : "primary"}
          >
            {props.confirmLabel}
          </Button>
        </>
      }
      id={props.id}
      onCancel={props.onCancel}
      open={props.open}
      title={props.title}
    >
      {props.children}
    </Dialog>
  );
}
