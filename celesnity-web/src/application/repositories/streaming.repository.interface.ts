import type {
  CreateMqttStreamAdapterInput,
  MqttStreamAdapter,
  MqttStreamAdapterRegistration,
} from '@/src/entities/models/streaming';

export interface StreamingRepository {
  list(): Promise<readonly MqttStreamAdapter[]>;
  create(input: CreateMqttStreamAdapterInput): Promise<MqttStreamAdapterRegistration>;
  pause(id: string): Promise<MqttStreamAdapter>;
  resume(id: string): Promise<MqttStreamAdapter>;
  rotateCredential(id: string): Promise<MqttStreamAdapterRegistration>;
  archive(id: string): Promise<void>;
}
