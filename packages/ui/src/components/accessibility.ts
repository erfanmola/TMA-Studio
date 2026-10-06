export function describedByIds(
  provided: string | undefined,
  id: string,
  description?: string,
  error?: string,
): string | undefined {
  const ids = [
    provided,
    description ? `${id}-description` : undefined,
    error ? `${id}-error` : undefined,
  ]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.split(/\s+/u))
    .filter((value, index, all) => all.indexOf(value) === index);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

export function focusLeavesControl(
  contains: (target: Node) => boolean,
  relatedTarget: Node | null,
): boolean {
  return relatedTarget === null || !contains(relatedTarget);
}
