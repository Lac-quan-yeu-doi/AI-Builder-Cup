import { extname } from "node:path";

const BINARY_EXTENSIONS = new Set([
  ".7z",
  ".avi",
  ".avif",
  ".bin",
  ".bmp",
  ".bz2",
  ".class",
  ".db",
  ".dll",
  ".doc",
  ".docx",
  ".dylib",
  ".eot",
  ".exe",
  ".flac",
  ".gif",
  ".gz",
  ".heic",
  ".ico",
  ".jar",
  ".jpeg",
  ".jpg",
  ".lock",
  ".mkv",
  ".mov",
  ".mp3",
  ".mp4",
  ".o",
  ".otf",
  ".pdf",
  ".png",
  ".pyc",
  ".rar",
  ".so",
  ".sqlite",
  ".sqlite3",
  ".tar",
  ".tif",
  ".tiff",
  ".ttf",
  ".wasm",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".xls",
  ".xlsx",
  ".xz",
  ".zip",
]);

/** Detect likely binary data without decoding it into a lossy text string. */
export function isBinaryFile(path: string, value: Buffer): boolean {
  if (BINARY_EXTENSIONS.has(extname(path).toLowerCase())) return true;
  const sample = value.subarray(0, Math.min(value.length, 8_192));
  if (sample.length === 0) return false;
  if (sample.includes(0)) return true;
  let nonPrintable = 0;
  for (const byte of sample) {
    if (byte < 9 || (byte > 13 && byte < 32)) nonPrintable += 1;
  }
  return nonPrintable / sample.length > 0.3;
}
