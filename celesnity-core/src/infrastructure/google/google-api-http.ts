import { CloudFileError, CloudFileErrorCode } from '@application/cloud-file/errors/cloud-file.error';
import { OAuthConnectionError } from '@application/oauth-connection/errors/oauth-connection.error';
import type { IOAuthAccessTokenProvider } from '@application/oauth-connection/i-oauth-access-token-provider';

const RATE_LIMIT_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded']);

interface GoogleErrorBody {
  readonly error?: {
    readonly message?: string;
    readonly errors?: readonly { readonly reason?: string }[];
  };
}

export class GoogleApiHttp {
  public constructor(
    private readonly tokens: IOAuthAccessTokenProvider,
    private readonly provider: string,
  ) {}

  public async json<T>(identityId: string, url: string, init: RequestInit = {}): Promise<T> {
    const response = await this.send(identityId, url, init);
    return (await response.json()) as T;
  }

  public async bytes(identityId: string, url: string, maxBytes: number): Promise<Uint8Array> {
    const response = await this.send(identityId, url, {});
    const declared = Number(response.headers.get('content-length') ?? '0');
    if (declared > maxBytes) throw tooLarge(maxBytes);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw tooLarge(maxBytes);
    return bytes;
  }

  private async send(identityId: string, url: string, init: RequestInit): Promise<Response> {
    const accessToken = await this.tokens.getAccessToken(identityId, this.provider);
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${accessToken}`);
    if (init.body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    let response: Response;
    try {
      response = await fetch(url, { ...init, headers });
    } catch (error) {
      throw new CloudFileError(
        CloudFileErrorCode.PROVIDER_UNAVAILABLE,
        `Google API is unreachable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (response.ok) return response;
    throw await this.toError(response);
  }

  private async toError(response: Response): Promise<Error> {
    const body = (await response.json().catch(() => ({}))) as GoogleErrorBody;
    const message = body.error?.message ?? `Google API returned ${response.status}.`;
    const reasons = body.error?.errors?.map((entry) => entry.reason) ?? [];
    if (response.status === 401) return OAuthConnectionError.needsReauth(this.provider);
    if (response.status === 404) return new CloudFileError(CloudFileErrorCode.NOT_FOUND, message);
    if (response.status === 429 || reasons.some((reason) => reason && RATE_LIMIT_REASONS.has(reason))) {
      return new CloudFileError(CloudFileErrorCode.PROVIDER_UNAVAILABLE, message);
    }
    if (response.status === 403) return new CloudFileError(CloudFileErrorCode.ACCESS_DENIED, message);
    if (response.status === 400) return new CloudFileError(CloudFileErrorCode.UNSUPPORTED_FORMAT, message);
    return new CloudFileError(CloudFileErrorCode.PROVIDER_UNAVAILABLE, message);
  }
}

function tooLarge(maxBytes: number): CloudFileError {
  return new CloudFileError(
    CloudFileErrorCode.TOO_LARGE,
    `The file is larger than the ${Math.round(maxBytes / 1024 / 1024)} MB limit.`,
  );
}
