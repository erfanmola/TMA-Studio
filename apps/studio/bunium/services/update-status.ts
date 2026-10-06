import type {
  UpdateChannel,
  UpdateCheckOutcome,
  UpdateReleaseDescriptor,
  UpdateStatusRecord,
} from "../../src/contracts/entities";
import { ValidationError } from "../../src/contracts/schemas";
import {
  parseUpdateStatusRequest,
  safeUpdateStatusReply,
} from "../../src/contracts/update-status-rpc";
import { StoreConflictError, type StudioStore } from "./store";

export class UpdateStatusServiceError extends Error {
  constructor(
    readonly code: "INVALID_INPUT" | "STALE" | "CONFLICT" | "INTERNAL",
  ) {
    super(code);
    this.name = "UpdateStatusServiceError";
  }
}

const CHANNELS: readonly UpdateChannel[] = ["stable", "preview"];
const OUTCOMES: readonly UpdateCheckOutcome[] = [
  "up-to-date",
  "update-available",
  "runtime-installer-available",
  "check-failed",
  "unconfigured",
];

export interface UpdateStatusOptions {
  channel?: UpdateChannel;
  now?: () => string;
}

function sameRelease(
  left: UpdateReleaseDescriptor,
  right: UpdateReleaseDescriptor,
): boolean {
  return (
    left.sequence === right.sequence &&
    left.version === right.version &&
    left.channel === right.channel
  );
}

/**
 * Host-owned update status. Persists the installed release sequence (the
 * value Bunium's update check needs as `currentSequence` to reject feed
 * replay) and validated check outcomes. Feed fetching, signature
 * verification and installation stay outside this service: there is no
 * configured feed or trusted key here, so nothing is ever marked available
 * from unverified input. The configured channel is injected and defaults to
 * stable until Settings wiring supplies it.
 */
export class HostUpdateStatusService {
  private readonly channel: UpdateChannel;
  private readonly now: () => string;

  constructor(
    private readonly store: StudioStore,
    options: UpdateStatusOptions = {},
  ) {
    if (options.channel !== undefined && !CHANNELS.includes(options.channel)) {
      throw new UpdateStatusServiceError("INVALID_INPUT");
    }
    this.channel = options.channel ?? "stable";
    this.now = options.now ?? (() => new Date().toISOString());
  }

  status(): UpdateStatusRecord {
    try {
      return (
        this.store.getUpdateStatus() ?? {
          revision: 0,
          installed: null,
          lastCheckAt: null,
          lastOutcome: null,
          pending: null,
        }
      );
    } catch {
      throw new UpdateStatusServiceError("INTERNAL");
    }
  }

  recordInstalled(descriptor: UpdateReleaseDescriptor): UpdateStatusRecord {
    const current = this.status();
    const installed = current.installed;
    if (installed) {
      if (descriptor.sequence < installed.sequence) {
        throw new UpdateStatusServiceError("STALE");
      }
      if (descriptor.sequence === installed.sequence) {
        if (sameRelease(descriptor, installed)) return current;
        throw new UpdateStatusServiceError("STALE");
      }
    }
    const pending =
      current.pending && current.pending.sequence > descriptor.sequence
        ? current.pending
        : null;
    return this.save(
      {
        ...current,
        installed: { ...descriptor },
        pending,
      },
      current.revision,
    );
  }

  recordCheck(
    outcome: UpdateCheckOutcome,
    candidate?: UpdateReleaseDescriptor | null,
    checkedAt?: string,
  ): UpdateStatusRecord {
    if (!OUTCOMES.includes(outcome)) {
      throw new UpdateStatusServiceError("INVALID_INPUT");
    }
    const current = this.status();
    const at = checkedAt ?? this.now();
    switch (outcome) {
      case "unconfigured":
      case "check-failed":
        if (candidate != null) {
          throw new UpdateStatusServiceError("INVALID_INPUT");
        }
        return this.save(
          {
            ...current,
            lastCheckAt: at,
            lastOutcome: outcome,
            ...(outcome === "unconfigured" ? { pending: null } : {}),
          },
          current.revision,
        );
      case "up-to-date": {
        if (
          candidate != null &&
          (!current.installed || !sameRelease(candidate, current.installed))
        ) {
          throw new UpdateStatusServiceError("INVALID_INPUT");
        }
        return this.save(
          {
            ...current,
            lastCheckAt: at,
            lastOutcome: outcome,
            pending: null,
          },
          current.revision,
        );
      }
      case "update-available":
      case "runtime-installer-available": {
        if (candidate == null) {
          throw new UpdateStatusServiceError("INVALID_INPUT");
        }
        if (candidate.channel !== this.channel) {
          throw new UpdateStatusServiceError("INVALID_INPUT");
        }
        const baseline = current.installed?.sequence ?? 0;
        if (candidate.sequence <= baseline) {
          throw new UpdateStatusServiceError("STALE");
        }
        return this.save(
          {
            ...current,
            lastCheckAt: at,
            lastOutcome: outcome,
            pending: { ...candidate },
          },
          current.revision,
        );
      }
    }
  }

  private save(
    next: UpdateStatusRecord,
    expectedRevision: number,
  ): UpdateStatusRecord {
    try {
      return this.store.saveUpdateStatus(next, expectedRevision);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new UpdateStatusServiceError("INVALID_INPUT");
      }
      if (error instanceof StoreConflictError) {
        throw new UpdateStatusServiceError("CONFLICT");
      }
      throw new UpdateStatusServiceError("INTERNAL");
    }
  }
}

export async function handleUpdateStatusRequest(
  payload: unknown,
  service: HostUpdateStatusService,
) {
  const request = parseUpdateStatusRequest(payload);
  if (!request) return null;
  try {
    return safeUpdateStatusReply(request.requestId, service.status());
  } catch {
    return {
      requestId: request.requestId,
      ok: false as const,
      error: "INTERNAL" as const,
    };
  }
}
