import type { paths } from './generated/schema';

export type CoreApiPath = keyof paths;

export interface GeneratedApiTransport {
  request<TResponse>(path: CoreApiPath | string, init?: RequestInit): Promise<TResponse>;
  stream(path: CoreApiPath | string, init?: RequestInit): Promise<Response>;
}
