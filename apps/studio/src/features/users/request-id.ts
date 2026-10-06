let sequence = 0;

/** Correlation IDs only; uniqueness within the renderer process is sufficient. */
export function nextRequestId(): string {
  sequence++;
  return `req-${Date.now().toString(36)}-${sequence.toString(36)}`;
}
