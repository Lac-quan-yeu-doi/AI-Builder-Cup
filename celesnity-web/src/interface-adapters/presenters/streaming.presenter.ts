import type {
  IssuedMqttCredential,
  MqttStreamAdapter,
  MqttStreamAdapterRegistration,
} from '@/src/entities/models/streaming';

export interface MqttStreamAdapterViewModel extends MqttStreamAdapter {
  readonly isReady: boolean;
  readonly canPause: boolean;
  readonly canResume: boolean;
}

export interface MqttStreamAdapterRegistrationViewModel {
  readonly adapter: MqttStreamAdapterViewModel;
  readonly credential: IssuedMqttCredential;
}

export function presentStreamAdapter(adapter: MqttStreamAdapter): MqttStreamAdapterViewModel {
  return {
    ...adapter,
    isReady: adapter.generation === adapter.observedGeneration && adapter.status === 'ACTIVE',
    canPause: adapter.desiredState === 'ACTIVE',
    canResume: adapter.desiredState === 'PAUSED',
  };
}

export function presentStreamAdapterRegistration(
  registration: MqttStreamAdapterRegistration,
): MqttStreamAdapterRegistrationViewModel {
  return {
    adapter: presentStreamAdapter(registration.adapter),
    credential: { ...registration.credential },
  };
}
