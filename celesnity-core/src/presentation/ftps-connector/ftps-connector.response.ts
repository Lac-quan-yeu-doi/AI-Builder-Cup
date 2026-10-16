import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type {
  FtpsActiveConnectionView,
  FtpsConnectorMetadataView,
  FtpsStatusView,
} from '@application/ftps-connector/read-models/ftps-connector.view';

export class FtpsConnectorMetadataResponseDto {
  @ApiProperty({ enum: ['FTPS'] }) public readonly connectorType!: 'FTPS';
  @ApiProperty() public readonly host!: string;
  @ApiProperty() public readonly port!: number;
  @ApiProperty({ enum: ['explicit-tls'] }) public readonly encryption!: 'explicit-tls';
  @ApiProperty({ enum: ['passive'] }) public readonly transferMode!: 'passive';
  @ApiProperty() public readonly remotePath!: string;
  @ApiProperty() public readonly username!: string;
  @ApiProperty() public readonly password!: string;

  public static from(view: FtpsConnectorMetadataView): FtpsConnectorMetadataResponseDto {
    return Object.assign(new FtpsConnectorMetadataResponseDto(), view);
  }
}

export class FtpsActiveConnectionResponseDto {
  @ApiProperty() public readonly connectionId!: string;
  @ApiPropertyOptional() public readonly remoteAddress?: string;
  @ApiPropertyOptional({ format: 'date-time' }) public readonly connectedAt?: string;
  @ApiPropertyOptional({ format: 'date-time' }) public readonly lastActivityAt?: string;

  public static from(view: FtpsActiveConnectionView): FtpsActiveConnectionResponseDto {
    return Object.assign(new FtpsActiveConnectionResponseDto(), view);
  }
}

export class FtpsConnectorStatusResponseDto {
  @ApiProperty({ enum: ['Success', 'Fail'] }) public readonly status!: 'Success' | 'Fail';
  @ApiProperty() public readonly username!: string;
  @ApiProperty() public readonly activeConnectionCount!: number;
  @ApiProperty({ format: 'date-time' }) public readonly checkedAt!: string;
  @ApiPropertyOptional({
    enum: [
      'NO_ACTIVE_CONNECTION',
      'STATUS_SERVICE_UNAVAILABLE',
      'STATUS_AUTHENTICATION_FAILED',
      'STATUS_RESPONSE_INVALID',
    ],
  })
  public readonly reason?: string;
  @ApiPropertyOptional({ type: FtpsActiveConnectionResponseDto })
  public readonly connection?: FtpsActiveConnectionResponseDto;

  public static from(view: FtpsStatusView): FtpsConnectorStatusResponseDto {
    return Object.assign(new FtpsConnectorStatusResponseDto(), {
      status: view.status,
      username: view.username,
      activeConnectionCount: view.activeConnectionCount,
      checkedAt: view.checkedAt,
      ...(view.reason === undefined ? {} : { reason: view.reason }),
      ...(view.connection === undefined
        ? {}
        : { connection: FtpsActiveConnectionResponseDto.from(view.connection) }),
    });
  }
}
