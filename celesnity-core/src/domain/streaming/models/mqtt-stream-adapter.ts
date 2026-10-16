export type StreamAdapterStatus =
  'PROVISIONING' | 'ACTIVE' | 'DEGRADED' | 'PAUSED' | 'FAILED' | 'ARCHIVED';

export type StreamAdapterDesiredState = 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
export type StreamingPlacementKind = 'SHARED' | 'DEDICATED';

export interface MqttStreamAdapter {
  readonly id: string;
  readonly publicKey: string;
  readonly tenantId: string;
  readonly tenantStorageKey: string;
  readonly tenantDisplayName: string;
  readonly name: string;
  readonly brokerUrl: string;
  readonly topicFilter: string;
  readonly qos: 0 | 1 | 2;
  readonly desiredState: StreamAdapterDesiredState;
  readonly status: StreamAdapterStatus;
  readonly placementKind: StreamingPlacementKind;
  readonly deploymentId: string;
  readonly generation: number;
  readonly observedGeneration: number;
  readonly lastError?: string;
  readonly lastReconciledAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StoredMqttCredentials {
  readonly ciphertext: string;
  readonly initializationVector: string;
  readonly authenticationTag: string;
  readonly keyVersion: string;
}

export interface MqttStreamAdapterRecord extends MqttStreamAdapter {
  readonly credentials: StoredMqttCredentials;
}

export interface IssuedMqttCredential {
  readonly username: string;
  readonly password: string;
}

export interface MqttStreamAdapterRegistration {
  readonly adapter: MqttStreamAdapter;
  readonly credential: IssuedMqttCredential;
}
