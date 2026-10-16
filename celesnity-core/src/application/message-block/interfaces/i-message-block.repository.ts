import type { MessageBlock } from '@domain/message-block/models/message-block';
import type { AuthenticatedContext } from '@application/administration/authenticated-context';

export interface IMessageBlockRepository {
  bindRoom(
    roomId: string,
    agentName: string,
    principal: Pick<AuthenticatedContext, 'organizationId' | 'identityId' | 'mfaVerified' | 'mfaRequired'>,
  ): Promise<void>;
  create(block: MessageBlock): Promise<MessageBlock>;
  listByRoom(
    roomId: string,
    organizationId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<readonly MessageBlock[]>;
}
