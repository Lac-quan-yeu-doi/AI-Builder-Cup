export interface ParsedSystemReminderContent {
  readonly content: string;
  readonly reminders: readonly string[];
}

const SYSTEM_REMINDER_PATTERN = /<system-reminder\b[^>]*>([\s\S]*?)(?:<\/system-reminder\s*>|$)/gi;
const ORPHAN_CLOSING_TAG_PATTERN = /<\/system-reminder\s*>/gi;

export function parseSystemReminderContent(content: string): ParsedSystemReminderContent {
  const reminders: string[] = [];
  const withoutReminders = content
    .replace(SYSTEM_REMINDER_PATTERN, (_match, body: string) => {
      const reminder = body.trim();
      if (reminder) reminders.push(reminder);
      return '';
    })
    .replace(ORPHAN_CLOSING_TAG_PATTERN, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { content: withoutReminders, reminders };
}
