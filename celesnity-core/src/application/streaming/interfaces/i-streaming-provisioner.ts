import type { MqttStreamAdapterRecord } from '@domain/streaming/models/mqtt-stream-adapter';

export interface IStreamingProvisioner {
  apply(
    adapter: MqttStreamAdapterRecord,
    credentials: Readonly<Record<string, string>>,
  ): Promise<void>;
}
