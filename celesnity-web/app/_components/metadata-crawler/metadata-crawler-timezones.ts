const FALLBACK_TIMEZONES = ['UTC', 'Asia/Ho_Chi_Minh'] as const;

export function metadataCrawlerTimezoneOptions(): readonly string[] {
  const supported =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return [...new Set([...FALLBACK_TIMEZONES, ...supported])].sort();
}

export function metadataCrawlerDefaultTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
