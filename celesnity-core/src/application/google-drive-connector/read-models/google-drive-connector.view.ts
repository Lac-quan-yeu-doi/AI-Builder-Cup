export type GoogleDriveConnectionStatus = 'connected' | 'needs_sign_in' | 'not_connected';

export interface GoogleDriveStatusView {
  readonly status: GoogleDriveConnectionStatus;
  readonly email?: string;
  readonly checkedAt: string;
}

export interface GoogleDriveFileView {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly createdTime?: string;
  readonly modifiedTime?: string;
  readonly size?: string;
  readonly webViewLink?: string;
}
