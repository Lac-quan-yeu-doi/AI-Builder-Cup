import type { DatabaseServiceConnectorDescriptor } from '@application/database-service/read-models/database-service-connector-descriptor';

/**
 * FTPS is a managed endpoint in the first version, not a persisted database
 * service. The descriptor is still part of the Core connector catalog so Web
 * never has to invent a connector option locally.
 */
export const FTPS_CONNECTOR_DESCRIPTOR = {
  connectorType: 'FTPS',
  label: 'FTPS',
  configSchemaVersion: 1,
  formSchema: {
    fields: [
      { key: 'host', label: 'Host', type: 'text', required: true, mode: 'structured' },
      { key: 'port', label: 'Port', type: 'number', required: true, mode: 'structured' },
      { key: 'username', label: 'Username', type: 'text', required: true, mode: 'structured' },
      {
        key: 'password',
        label: 'Password',
        type: 'password',
        required: true,
        secret: true,
        mode: 'structured',
      },
      {
        key: 'remotePath',
        label: 'Remote folder',
        type: 'text',
        required: true,
        mode: 'structured',
      },
    ],
  },
} as const satisfies DatabaseServiceConnectorDescriptor;
