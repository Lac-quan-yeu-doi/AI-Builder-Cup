import type { TranslationKey } from '@/app/_i18n/en';

export interface PluginDefinition {
  readonly id: string;
  readonly nameKey: TranslationKey;
  readonly descriptionKey: TranslationKey;
  readonly longDescriptionKey: TranslationKey;
  readonly statusEndpoint: string;
  readonly authorizeUrl: string;
  readonly disconnectEndpoint: string;
  readonly iconColor: string;
  readonly iconLabel: string;
}

export const PLUGINS: readonly PluginDefinition[] = [
  {
    id: 'google-drive',
    nameKey: 'plugins.googleDrive.name',
    descriptionKey: 'plugins.googleDrive.description',
    longDescriptionKey: 'plugins.googleDrive.longDescription',
    statusEndpoint: '/api/core/google-drive-connector/status',
    authorizeUrl: '/api/core/google-drive-connector/oauth/authorize',
    disconnectEndpoint: '/api/core/google-drive-connector/connection',
    iconColor: '#4285F4',
    iconLabel: 'GD',
  },
];
