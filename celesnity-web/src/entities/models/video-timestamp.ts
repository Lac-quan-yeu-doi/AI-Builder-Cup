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

/**
 * Gemini sometimes writes a video position as clock digits: 7:43 becomes 743
 * instead of 463 seconds. When some values run past the end of the video and
 * every value reads as minutes and seconds, this returns the converter that
 * puts them back in seconds; otherwise undefined.
 */
export function clockDigitsFix(
  values: readonly number[],
  videoSeconds: number,
): ((value: number) => number) | undefined {
  if (!Number.isFinite(videoSeconds) || videoSeconds <= 0 || values.length === 0) return undefined;
  const slack = 2;
  if (values.every((value) => value <= videoSeconds + slack)) return undefined;
  const asClock = (value: number) => {
    const whole = Math.floor(value);
    return Math.floor(whole / 100) * 60 + (whole % 100) + (value - whole);
  };
  const readable = values.every((value) => Math.floor(value) % 100 < 60);
  const fits = values.every((value) => asClock(value) <= videoSeconds + slack);
  return readable && fits ? asClock : undefined;
}
