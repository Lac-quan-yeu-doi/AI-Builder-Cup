/** 754 → "12:34"; an hour or more → "1:02:34". */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

export function formatPercent(value: number | undefined): string {
  return value === undefined ? '—' : `${Math.round(value * 100)}%`;
}
