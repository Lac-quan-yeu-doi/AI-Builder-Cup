export function resolveResumeCursor(
  explicit: string | null,
  lastEventId: string | string[] | undefined,
): number {
  const value =
    explicit ?? (typeof lastEventId === "string" ? lastEventId : undefined);
  if (value === undefined) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}
