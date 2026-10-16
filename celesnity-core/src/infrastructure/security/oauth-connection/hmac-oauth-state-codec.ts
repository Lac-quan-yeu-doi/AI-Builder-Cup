import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

import type {
  IOAuthStateCodec,
  OAuthStatePayload,
} from '@application/oauth-connection/i-oauth-state-codec';
import type { IClock } from '@application/shared/interfaces/i-clock';

const STATE_TTL_MS = 10 * 60_000;
const HKDF_INFO = 'celesnity:oauth-state';

interface EncodedState {
  readonly i: string;
  readonly p: string;
  readonly r?: string;
  readonly e: number;
  readonly n: string;
}

export interface HmacOAuthStateCodecConfig {
  readonly keyring: string;
  readonly activeKeyVersion: string;
}

export class HmacOAuthStateCodec implements IOAuthStateCodec {
  private readonly keys: ReadonlyMap<string, Buffer>;

  public constructor(
    private readonly config: HmacOAuthStateCodecConfig,
    private readonly clock: IClock,
  ) {
    this.keys = deriveSigningKeys(config.keyring);
    if (!this.keys.has(config.activeKeyVersion)) {
      throw new Error('OAuth state signing key version is not in the keyring.');
    }
  }

  public encode(payload: OAuthStatePayload): string {
    const body: EncodedState = {
      i: payload.identityId,
      p: payload.provider,
      ...(payload.returnTo === undefined ? {} : { r: payload.returnTo }),
      e: this.clock.now().getTime() + STATE_TTL_MS,
      n: randomBytes(12).toString('base64url'),
    };
    const version = this.config.activeKeyVersion;
    const encodedBody = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
    return `${version}.${encodedBody}.${this.sign(version, encodedBody).toString('base64url')}`;
  }

  public decode(state: string, expectedProvider: string): OAuthStatePayload | undefined {
    const [version, encodedBody, signature, ...rest] = state.split('.');
    if (!version || !encodedBody || !signature || rest.length > 0 || !this.keys.has(version)) {
      return undefined;
    }
    const expected = this.sign(version, encodedBody);
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return undefined;

    let body: Partial<EncodedState>;
    try {
      body = JSON.parse(Buffer.from(encodedBody, 'base64url').toString('utf8')) as Partial<EncodedState>;
    } catch {
      return undefined;
    }
    if (
      typeof body.i !== 'string' ||
      typeof body.p !== 'string' ||
      typeof body.e !== 'number' ||
      body.p !== expectedProvider ||
      body.e < this.clock.now().getTime()
    ) {
      return undefined;
    }
    return {
      identityId: body.i,
      provider: body.p,
      ...(typeof body.r === 'string' ? { returnTo: body.r } : {}),
    };
  }

  private sign(version: string, encodedBody: string): Buffer {
    return createHmac('sha256', this.keys.get(version)!)
      .update(`${version}.${encodedBody}`)
      .digest();
  }
}

function deriveSigningKeys(keyring: string): ReadonlyMap<string, Buffer> {
  const keys = new Map<string, Buffer>();
  for (const entry of keyring.split(',')) {
    const separator = entry.indexOf(':');
    const version = entry.slice(0, separator).trim();
    const key = Buffer.from(entry.slice(separator + 1).trim(), 'base64');
    if (separator < 1 || key.length !== 32) throw new Error('Invalid credential keyring.');
    keys.set(version, Buffer.from(hkdfSync('sha256', key, Buffer.alloc(0), HKDF_INFO, 32)));
  }
  return keys;
}
