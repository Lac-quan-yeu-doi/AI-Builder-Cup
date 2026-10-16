/** 75 → "1:15". */
export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Splits text around "m:ss" timestamps so they can be rendered as links. */
export function splitTimestamps(
  text: string,
): ({ text: string } | { seconds: number; label: string })[] {
  const parts: ({ text: string } | { seconds: number; label: string })[] = [];
  let last = 0;
  for (const match of text.matchAll(/\b(\d{1,2}):([0-5]\d)\b/g)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ text: text.slice(last, index) });
    parts.push({ seconds: Number(match[1]) * 60 + Number(match[2]), label: match[0] });
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
