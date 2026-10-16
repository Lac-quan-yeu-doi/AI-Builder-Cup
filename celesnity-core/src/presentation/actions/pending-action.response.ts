import { ApiProperty } from '@nestjs/swagger';

import type { PendingAction } from '@application/actions/pending-action.model';

export class PendingActionResponse {
  @ApiProperty({ format: 'uuid' })
  public readonly id: string;

  @ApiProperty()
  public readonly action_name: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  public readonly input: unknown;

  @ApiProperty({ type: 'object', additionalProperties: true })
  public readonly actor: unknown;

  @ApiProperty({ enum: ['pending', 'approved', 'rejected', 'failed'] })
  public readonly status: string;

  @ApiProperty({ nullable: true, type: String })
  public readonly rationale: string | null;

  @ApiProperty({ nullable: true, type: 'object', additionalProperties: true })
  public readonly result: unknown;

  @ApiProperty({ nullable: true, type: String })
  public readonly error_message: string | null;

  @ApiProperty({ format: 'date-time' })
  public readonly created_at: string;

  @ApiProperty({ nullable: true, format: 'date-time', type: String })
  public readonly decided_at: string | null;

  @ApiProperty({ format: 'date-time' })
  public readonly expires_at: string;

  private constructor(pendingAction: PendingAction) {
    this.id = pendingAction.id;
    this.action_name = pendingAction.actionName;
    this.input = pendingAction.input;
    this.actor = pendingAction.actor;
    this.status = pendingAction.status;
    this.rationale = pendingAction.rationale;
    this.result = pendingAction.result;
    this.error_message = pendingAction.errorMessage;
    this.created_at = pendingAction.createdAt;
    this.decided_at = pendingAction.decidedAt;
    this.expires_at = pendingAction.expiresAt;
  }

  public static from(pendingAction: PendingAction): PendingActionResponse {
    return new PendingActionResponse(pendingAction);
  }

  public static fromList(
    pendingActions: readonly PendingAction[],
  ): readonly PendingActionResponse[] {
    return pendingActions.map((p) => PendingActionResponse.from(p));
  }
}
