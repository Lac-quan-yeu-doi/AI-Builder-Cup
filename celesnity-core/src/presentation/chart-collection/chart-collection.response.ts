import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  ChartCollection,
  CollectionAccess,
} from '@domain/chart-collection/models/chart-collection';

export class ChartCollectionResponse {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly organization_id!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly parent_id!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly owner_identity_id!: string | null;
  @ApiProperty({ enum: ['ROOT', 'PERSONAL', 'COLLECTION'] }) public readonly type!: string;
  @ApiProperty() public readonly name!: string;
  @ApiProperty({ enum: ['NO_ACCESS', 'VIEW', 'CURATE'] }) public readonly access!: CollectionAccess;
  @ApiPropertyOptional({ nullable: true }) public readonly archived_at!: string | null;
  @ApiProperty() public readonly created_at!: string;
  @ApiProperty() public readonly updated_at!: string;

  private constructor(collection: ChartCollection, access: CollectionAccess = 'VIEW') {
    this.id = collection.id;
    this.organization_id = collection.organizationId;
    this.parent_id = collection.parentId;
    this.owner_identity_id = collection.ownerIdentityId;
    this.type = collection.type;
    this.name = collection.name;
    this.access = access;
    this.archived_at = collection.archivedAt;
    this.created_at = collection.createdAt;
    this.updated_at = collection.updatedAt;
  }

  public static from(
    collection: ChartCollection,
    access: CollectionAccess = 'VIEW',
  ): ChartCollectionResponse {
    return new ChartCollectionResponse(collection, access);
  }
}
