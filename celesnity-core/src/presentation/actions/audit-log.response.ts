import { ApiProperty } from '@nestjs/swagger';

import type { AuditLogEntry } from '@application/actions/audit-log-entry.model';

export class AuditLogEntryResponse {
  @ApiProperty({ format: 'uuid' })
  public readonly id: string;

  @ApiProperty()
  public readonly action_name: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  public readonly actor: unknown;

  @ApiProperty({ type: 'object', additionalProperties: true })
  public readonly input: unknown;

  @ApiProperty({ format: 'date-time' })
  public readonly created_at: string;

  private constructor(entry: AuditLogEntry) {
    this.id = entry.id;
    this.action_name = entry.actionName;
    this.actor = entry.actor;
    this.input = entry.input;
    this.created_at = entry.createdAt;
  }

  public static from(entry: AuditLogEntry): AuditLogEntryResponse {
    return new AuditLogEntryResponse(entry);
  }

  public static fromList(entries: readonly AuditLogEntry[]): readonly AuditLogEntryResponse[] {
    return entries.map((e) => AuditLogEntryResponse.from(e));
  }
}
