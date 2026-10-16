import type { StreamingRepository } from '@/src/application/repositories/streaming.repository.interface';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import type { components } from '@/src/infrastructure/api/generated/schema';
import type {
  CreateMqttStreamAdapterInput,
  MqttStreamAdapter,
  MqttStreamAdapterRegistration,
} from '@/src/entities/models/streaming';

type AdapterDto = components['schemas']['MqttStreamAdapterResponseDto'];
type CreateAdapterDto = components['schemas']['CreateMqttStreamAdapterRequestDto'];
type RegistrationDto = components['schemas']['MqttStreamAdapterRegistrationResponseDto'];

export class CoreApiStreamingRepository implements StreamingRepository {
  public constructor(private readonly transport: GeneratedApiTransport) {}

  public list(): Promise<readonly MqttStreamAdapter[]> {
    return this.transport.request<readonly AdapterDto[]>('/streaming/mqtt-adapters', {
      method: 'GET',
    });
  }

  public create(input: CreateMqttStreamAdapterInput): Promise<MqttStreamAdapterRegistration> {
    const body: CreateAdapterDto = input;
    return this.transport.request<RegistrationDto>('/streaming/mqtt-adapters', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  public pause(id: string): Promise<MqttStreamAdapter> {
    return this.transport.request<AdapterDto>(`${pathFor(id)}/pause`, { method: 'POST' });
  }

  public resume(id: string): Promise<MqttStreamAdapter> {
    return this.transport.request<AdapterDto>(`${pathFor(id)}/resume`, { method: 'POST' });
  }

  public rotateCredential(id: string): Promise<MqttStreamAdapterRegistration> {
    return this.transport.request<RegistrationDto>(`${pathFor(id)}/credentials`, {
      method: 'POST',
    });
  }

  public archive(id: string): Promise<void> {
    return this.transport.request<void>(pathFor(id), { method: 'DELETE' });
  }
}

function pathFor(id: string): string {
  return `/streaming/mqtt-adapters/${encodeURIComponent(id)}`;
}
