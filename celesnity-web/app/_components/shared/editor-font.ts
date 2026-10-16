/**
 * The mono stack, as a literal, for editors that cannot take a CSS variable.
 *
 * Monaco takes `fontFamily` as a plain string in its options object, so it can
 * never resolve `var(--font-mono)`. Three editors used to each carry their own
 * hardcoded stack, and all three had drifted from the token — they were missing
 * `SF Mono` and `Liberation Mono` and had picked up `Monaco`, which on macOS is
 * a visibly different face from the one the rest of the app renders.
 *
 * Read from the document so there is still one source of truth; the literal is
 * only the server-render fallback.
 */
const FALLBACK =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

export function editorFontFamily(): string {
  if (typeof document === 'undefined') return FALLBACK;
  const token = getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim();
  return token || FALLBACK;
}
