import { For, Show } from "solid-js";
import { formatBytes, formatShare } from "./format";

export type StorageSegment = {
  bytes: number | null;
  id: string;
  label: string;
};

export type StorageStatus = "ready" | "estimating" | "unknown" | "error";

export type StorageBarLabels = {
  caption: string;
  item: string;
  share: string;
  size: string;
  /** Status line per state; `ready` usually carries the measured time. */
  status: Record<StorageStatus, string>;
  unknownSize: string;
};

export type StorageBarProps = {
  capacityBytes?: number;
  class?: string;
  id: string;
  labels: StorageBarLabels;
  locale: string;
  segments: readonly StorageSegment[];
  status: StorageStatus;
};

const TONES = 4;

/**
 * Usage bar with a real table carrying the same numbers; the bar itself is
 * decorative. Unknown sizes are reported as unknown, never as zero.
 */
export function StorageBar(props: StorageBarProps) {
  const known = () =>
    props.segments.reduce((sum, segment) => sum + (segment.bytes ?? 0), 0);
  const total = () => Math.max(props.capacityBytes ?? 0, known());
  const width = (bytes: number | null) =>
    props.status === "ready" && bytes !== null && total() > 0
      ? `${(bytes / total()) * 100}%`
      : "0%";

  return (
    <section
      aria-busy={props.status === "estimating" ? "true" : undefined}
      aria-labelledby={`${props.id}-caption`}
      class={`studio-storage${props.class ? ` ${props.class}` : ""}`}
      data-status={props.status}
    >
      <div class="studio-storage__header">
        <h3 class="studio-storage__caption" id={`${props.id}-caption`}>
          {props.labels.caption}
        </h3>
        <p class="studio-storage__status" role="status">
          {props.labels.status[props.status]}
        </p>
      </div>
      <div aria-hidden="true" class="studio-storage__bar">
        <For each={props.segments}>
          {(segment, index) => (
            <span
              class="studio-storage__segment"
              data-tone={index() % TONES}
              style={{ width: width(segment.bytes) }}
            />
          )}
        </For>
      </div>
      <table class="studio-storage__table">
        <thead>
          <tr>
            <th scope="col">{props.labels.item}</th>
            <th scope="col">{props.labels.size}</th>
            <th scope="col">{props.labels.share}</th>
          </tr>
        </thead>
        <tbody>
          <For each={props.segments}>
            {(segment, index) => (
              <tr>
                <th scope="row">
                  <span
                    aria-hidden="true"
                    class="studio-storage__swatch"
                    data-tone={index() % TONES}
                  />
                  {segment.label}
                </th>
                <td class="studio-storage__number">
                  <Show
                    fallback={props.labels.unknownSize}
                    when={props.status === "ready" && segment.bytes !== null}
                  >
                    {formatBytes(segment.bytes ?? 0, props.locale)}
                  </Show>
                </td>
                <td class="studio-storage__number">
                  <Show
                    fallback="—"
                    when={props.status === "ready" && segment.bytes !== null}
                  >
                    {formatShare(segment.bytes ?? 0, total(), props.locale)}
                  </Show>
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </section>
  );
}
