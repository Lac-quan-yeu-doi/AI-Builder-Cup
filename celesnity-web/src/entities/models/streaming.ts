export type StreamAdapterStatus = 'PROVISIONING' | 'ACTIVE' | 'DEGRADED' | 'PAUSED' | 'FAILED';

export interface MqttStreamAdapter {
  readonly id: string;
  readonly adapterKey: string;
  readonly tenantStorageKey: string;
  readonly tenantDisplayName: string;
  readonly name: string;
  readonly brokerUrl: string;
  readonly topicFilter: string;
  readonly qos: 0 | 1 | 2;
  readonly desiredState: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  readonly status: StreamAdapterStatus;
  readonly placementKind: 'SHARED' | 'DEDICATED';
  readonly deploymentId: string;
  readonly generation: number;
  readonly observedGeneration: number;
  readonly bronzeObjectPrefix: string;
  readonly lastError?: string;
  readonly updatedAt: string;
}

export interface CreateMqttStreamAdapterInput {
  readonly tenantStorageKey: string;
  readonly tenantDisplayName: string;
  readonly name: string;
  readonly qos: 0 | 1 | 2;
  readonly placementKind: 'SHARED' | 'DEDICATED';
}

export interface IssuedMqttCredential {
  readonly username: string;
  readonly password: string;
}

export interface MqttStreamAdapterRegistration {
  readonly adapter: MqttStreamAdapter;
  readonly credential: IssuedMqttCredential;
}
