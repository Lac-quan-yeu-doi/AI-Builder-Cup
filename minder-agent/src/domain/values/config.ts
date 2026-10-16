export interface ApplicationConfig {
  readonly realm?: string;
  readonly channels: readonly string[];
  readonly formatter?: string;
}
export interface PermissionConfig {
  readonly allow: readonly string[];
  readonly deny: readonly string[];
}
