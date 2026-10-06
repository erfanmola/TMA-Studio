export type StudioWindowAction =
  | { kind: "create-project" }
  | { kind: "open-project"; projectId: string }
  | { kind: "users" }
  | { kind: "settings" };
export type StudioWindowRequest = {
  requestId: string;
  action: StudioWindowAction;
};
export type StudioWindowReply =
  | { requestId: string; ok: true }
  | {
      requestId: string;
      ok: false;
      error: "INVALID_INPUT" | "NOT_FOUND" | "INTERNAL";
    };

type RecordValue = Record<string, unknown>;
function record(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value: RecordValue, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}
function safeId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    ![...value].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 32 || code === 127;
    })
  );
}

export function parseStudioWindowRequest(
  value: unknown,
): StudioWindowRequest | null {
  let candidate = value;
  if (typeof candidate === "string") {
    if (candidate.length > 4_096) return null;
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  if (
    !record(candidate) ||
    !exactKeys(candidate, ["requestId", "action"]) ||
    typeof candidate.requestId !== "string" ||
    !/^[\w-]{1,64}$/u.test(candidate.requestId) ||
    !record(candidate.action) ||
    typeof candidate.action.kind !== "string"
  )
    return null;
  const action = candidate.action;
  switch (action.kind) {
    case "create-project":
    case "users":
    case "settings":
      return exactKeys(action, ["kind"])
        ? {
            requestId: candidate.requestId,
            action: { kind: action.kind },
          }
        : null;
    case "open-project":
      return exactKeys(action, ["kind", "projectId"]) &&
        safeId(action.projectId)
        ? {
            requestId: candidate.requestId,
            action: { kind: action.kind, projectId: action.projectId },
          }
        : null;
    default:
      return null;
  }
}
