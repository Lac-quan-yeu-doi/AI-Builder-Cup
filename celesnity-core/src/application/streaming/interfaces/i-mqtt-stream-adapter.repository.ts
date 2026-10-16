import type {
  MqttStreamAdapter,
  MqttStreamAdapterRecord,
  StreamAdapterDesiredState,
} from '@domain/streaming/models/mqtt-stream-adapter';

export interface SaveAdapterInput {
  readonly adapter: MqttStreamAdapterRecord;
}

export interface ReconcileCandidate extends MqttStreamAdapterRecord {
  readonly attemptId: string;
}

export interface IMqttStreamAdapterRepository {
  list(tenantStorageKey?: string): Promise<readonly MqttStreamAdapter[]>;
  findById(id: string): Promise<MqttStreamAdapterRecord | undefined>;
  create(input: SaveAdapterInput): Promise<MqttStreamAdapterRecord | 'NAME_CONFLICT'>;
  setDesiredState(
    id: string,
    desiredState: StreamAdapterDesiredState,
    updatedAt: string,
  ): Promise<MqttStreamAdapterRecord | undefined>;
  replaceCredentials(
    id: string,
    credentials: MqttStreamAdapterRecord['credentials'],
    updatedAt: string,
  ): Promise<MqttStreamAdapterRecord | undefined>;
  claimReconciliation(limit: number, now: string): Promise<ReconcileCandidate[]>;
  completeReconciliation(
    adapterId: string,
    generation: number,
    attemptId: string,
    now: string,
  ): Promise<void>;
  failReconciliation(
    adapterId: string,
    generation: number,
    attemptId: string,
    error: string,
    now: string,
  ): Promise<void>;
}
