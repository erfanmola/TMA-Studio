import { createSignal, For, onCleanup, Show } from "solid-js";
import type { StorageScanResult } from "../../contracts/storage-rpc";
import { dictionaries, directionFor, type Locale } from "../../i18n/locale";
import { Button, StorageBar } from "../../ui";
import {
  type StoragePort,
  StorageServiceError,
} from "./storage-bridge-service";

export function StorageSection(props: {
  id: string;
  locale: Locale;
  service: StoragePort;
}) {
  const copy = dictionaries[props.locale].settings;
  const storage = copy.storage;
  const [result, setResult] = createSignal<StorageScanResult | null>(null);
  const [phase, setPhase] = createSignal<
    "idle" | "scanning" | "ready" | "error"
  >("idle");
  const [notice, setNotice] = createSignal("");
  const [clearing, setClearing] = createSignal<string | null>(null);
  let controller: AbortController | null = null;
  let closed = false;
  onCleanup(() => {
    closed = true;
    controller?.abort();
  });

  const errorText = (error: unknown): string => {
    const code = error instanceof StorageServiceError ? error.code : "INTERNAL";
    switch (code) {
      case "ABORTED":
        return storage.aborted;
      case "PARTIAL":
        return storage.partial;
      case "IN_USE":
        return storage.inUse;
      default:
        return phase() === "idle" ? storage.failed : storage.clearFailed;
    }
  };

  const scan = async () => {
    controller?.abort();
    const next = new AbortController();
    controller = next;
    setPhase("scanning");
    setNotice(storage.scanning);
    try {
      const scanResult = await props.service.scan(next.signal);
      if (closed || next.signal.aborted) return;
      setResult(scanResult);
      setPhase("ready");
      setNotice("");
    } catch (error) {
      if (closed) return;
      if (error instanceof StorageServiceError && error.code === "ABORTED") {
        setPhase(result() ? "ready" : "idle");
        setNotice(storage.aborted);
        return;
      }
      setPhase(result() ? "ready" : "error");
      setNotice(errorText(error));
    }
  };

  const clear = async (partitionId: string, kind: "cache" | "site") => {
    // No window.confirm here: CEF auto-cancels JS dialogs (no parent window
    // handle), so the clear would never run. Site-data clears are confirmed
    // by the host with a native dialog before reaching the service.
    setClearing(partitionId);
    try {
      const row =
        kind === "cache"
          ? await props.service.clearCache(partitionId)
          : await props.service.clearSiteData(partitionId);
      if (closed) return;
      setResult((current) =>
        current
          ? {
              ...current,
              rows: current.rows.map((entry) =>
                entry.partitionId === row.partitionId ? row : entry,
              ),
              scannedAt: new Date().toISOString(),
            }
          : current,
      );
      setNotice(storage.cleared);
    } catch (error) {
      if (closed) return;
      setNotice(errorText(error));
      // Remeasure truthfully after a failed clear.
      try {
        await scan();
      } catch {
        // Notice already set.
      }
    } finally {
      if (!closed) setClearing(null);
    }
  };

  const segments = () =>
    (result()?.rows ?? []).map((row) => ({
      id: row.partitionId,
      label: `${row.projectId} · ${row.platform}`,
      bytes: row.status === "ready" ? row.bytes : null,
    }));

  return (
    <div class="settings-window__section">
      <div class="settings-window__row">
        <Button
          disabled={phase() === "scanning"}
          id={`${props.id}-scan`}
          onClick={() => void scan()}
          variant="primary"
        >
          {phase() === "scanning" ? storage.scanning : storage.scan}
        </Button>
        <Show when={phase() === "scanning"}>
          <Button id={`${props.id}-cancel`} onClick={() => controller?.abort()}>
            {storage.cancel}
          </Button>
        </Show>
        <Show when={phase() === "error"}>
          <Button id={`${props.id}-retry`} onClick={() => void scan()}>
            {storage.retry}
          </Button>
        </Show>
      </div>
      <p aria-live="polite" class="settings-window__note" role="status">
        {notice()}
      </p>
      <Show when={result()}>
        {(scanResult) => (
          <>
            <StorageBar
              id={`${props.id}-bar`}
              labels={{
                caption: storage.caption,
                item: storage.item,
                share: storage.share,
                size: storage.size,
                status: {
                  ready: scanResult().scannedAt,
                  estimating: storage.scanning,
                  unknown: storage.unknown,
                  error: storage.error,
                },
                unknownSize: storage.unknown,
              }}
              locale={props.locale}
              segments={segments()}
              status="ready"
            />
            <table class="settings-window__table">
              <thead>
                <tr>
                  <th scope="col">{storage.item}</th>
                  <th scope="col">{storage.size}</th>
                  <th scope="col">{storage.item}</th>
                </tr>
              </thead>
              <tbody>
                <For each={scanResult().rows}>
                  {(row) => (
                    <tr>
                      <th scope="row">
                        {row.projectId} · {row.platform}
                      </th>
                      <td class="settings-window__number">
                        {row.status === "ready" && row.bytes !== null
                          ? `${(row.bytes / 1024).toFixed(1)} KB`
                          : row.status === "unknown"
                            ? storage.unknown
                            : storage.error}
                      </td>
                      <td>
                        <Button
                          disabled={clearing() !== null}
                          id={`${props.id}-cache-${row.partitionId}`}
                          loading={clearing() === row.partitionId}
                          onClick={() => void clear(row.partitionId, "cache")}
                          size="small"
                        >
                          {storage.clearCache}
                        </Button>{" "}
                        <Button
                          disabled={clearing() !== null}
                          id={`${props.id}-site-${row.partitionId}`}
                          loading={clearing() === row.partitionId}
                          onClick={() => void clear(row.partitionId, "site")}
                          size="small"
                          variant="danger"
                        >
                          {storage.clearSite}
                        </Button>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </>
        )}
      </Show>
      <Show when={!result() && phase() === "idle"}>
        <p class="settings-window__note" dir={directionFor(props.locale)}>
          {storage.empty}
        </p>
      </Show>
    </div>
  );
}
