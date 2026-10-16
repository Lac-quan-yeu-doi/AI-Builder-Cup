export interface ProviderCapabilities {
  readonly supportsTools: boolean;
  readonly supportsThinking: boolean;
  readonly supportsTemperature: boolean;
  readonly supportsStreaming: boolean;
}
export const defaultProviderCapabilities = (
  _model: string,
): ProviderCapabilities => ({
  supportsTools: true,
  supportsThinking: true,
  supportsTemperature: true,
  supportsStreaming: true,
});
export interface RetryContract {
  readonly maxAttempts: number;
  readonly retryableStatusCodes: readonly number[];
}
export interface CircuitBreakerContract {
  readonly failureThreshold: number;
  readonly cooldownMs: number;
}
export interface CredentialRotationContract {
  readonly cooldownMs: number;
}
