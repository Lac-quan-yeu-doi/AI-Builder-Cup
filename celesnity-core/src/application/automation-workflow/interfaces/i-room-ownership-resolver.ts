export interface IRoomOwnershipResolver {
  ownsRoom(roomId: string, organizationId: string): Promise<boolean>;
}
