export type ChatAttachmentType = 'chart' | 'document' | 'mention';

export interface ChatAttachment {
  readonly type: ChatAttachmentType;
  readonly id: string;
  readonly title: string;
}

/**
 * Appends a plain-language note naming the manually attached resources to
 * the outgoing message — the same string is both sent to the agent and
 * stored as the displayed message, so the user sees exactly what the agent
 * was told. Kept as one string rather than a separate wire field: the chat
 * transport (`RoomRunBody`) only carries `input: string`, and the agent has
 * no tool to fetch a chart's data by id outside its own writes, so a plain
 * readable reference is what it can actually act on.
 */
export function formatMessageWithAttachments(
  text: string,
  attachments: readonly ChatAttachment[],
): string {
  if (attachments.length === 0) return text;
  const mentions = attachments.filter((a) => a.type === 'mention');
  const others = attachments.filter((a) => a.type !== 'mention');
  const parts: string[] = [text];
  if (mentions.length > 0) {
    const names = mentions.map((m) => m.title).join(', ');
    parts.push(`(Using: ${names})`);
  }
  if (others.length > 0) {
    const label = others
      .map((attachment) => `${attachment.type} "${attachment.title}"`)
      .join(', ');
    parts.push(`(Attached: ${label})`);
  }
  return parts.join('\n\n');
}
