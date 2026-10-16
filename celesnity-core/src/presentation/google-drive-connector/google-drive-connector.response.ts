import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type {
  GoogleDriveStatusView,
  GoogleDriveFileView,
} from '@application/google-drive-connector/read-models/google-drive-connector.view';

export class GoogleDriveStatusResponseDto {
  @ApiProperty({ enum: ['connected', 'needs_sign_in', 'not_connected'] })
  public readonly status!: 'connected' | 'needs_sign_in' | 'not_connected';

  @ApiPropertyOptional() public readonly email?: string;
  @ApiProperty({ format: 'date-time' }) public readonly checkedAt!: string;

  public static from(view: GoogleDriveStatusView): GoogleDriveStatusResponseDto {
    return Object.assign(new GoogleDriveStatusResponseDto(), view);
  }
}

export class GoogleDriveFileResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly name!: string;
  @ApiProperty() public readonly mimeType!: string;
  @ApiPropertyOptional({ format: 'date-time' }) public readonly createdTime?: string;
  @ApiPropertyOptional({ format: 'date-time' }) public readonly modifiedTime?: string;
  @ApiPropertyOptional() public readonly size?: string;
  @ApiPropertyOptional() public readonly webViewLink?: string;

  public static from(view: GoogleDriveFileView): GoogleDriveFileResponseDto {
    return Object.assign(new GoogleDriveFileResponseDto(), view);
  }
}
