import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ConnectionAccessError } from '@application/database-service/errors/connection-access.error';
import type { NetworkDestination } from '@application/database-service/interfaces/i-connection-probe';
import type {
  IDestinationPolicy,
  ResolvedDestination,
} from '@application/database-service/interfaces/i-destination-policy';

/** Shared network policy used by every DBMS plugin's destination. */
@Injectable()
export class NetworkDestinationPolicy implements IDestinationPolicy {
  private readonly allowPrivateDestinations: boolean;
  private readonly allowedHosts: ReadonlySet<string>;

  public constructor(config: ConfigService) {
    this.allowPrivateDestinations = config.getOrThrow<boolean>(
      'CONNECTION_ALLOW_PRIVATE_DESTINATIONS',
    );
    this.allowedHosts = new Set(
      config
        .getOrThrow<string>('CONNECTION_ALLOWED_HOSTS')
        .split(',')
        .map((host) => host.trim().toLowerCase())
        .filter((host) => host.length > 0),
    );
  }

  public async resolveAllowed(destination: NetworkDestination): Promise<ResolvedDestination> {
    const addresses = await this.resolve(destination.host, destination.engineLabel);
    const privateDestinationAllowed =
      this.allowPrivateDestinations || this.allowedHosts.has(destination.host);

    for (const address of addresses) {
      if (isAlwaysRejected(address)) {
        throw ConnectionAccessError.destinationRejected(
          `The ${destination.engineLabel} destination is not routable.`,
        );
      }
      if (isPrivateOrSpecial(address) && !privateDestinationAllowed) {
        throw ConnectionAccessError.destinationRejected(
          `Private and local ${destination.engineLabel} destinations are disabled by policy.`,
        );
      }
    }

    return { ...destination, addresses };
  }

  private async resolve(host: string, engineLabel: string): Promise<readonly string[]> {
    if (isIP(host) !== 0) {
      return [host];
    }

    try {
      const addresses = await lookup(host, { all: true, verbatim: true });
      if (addresses.length === 0) {
        throw new Error('No addresses returned.');
      }
      return addresses.map(({ address }) => address);
    } catch {
      throw ConnectionAccessError.destinationRejected(
        `The ${engineLabel} destination could not be resolved.`,
      );
    }
  }
}

function isAlwaysRejected(address: string): boolean {
  if (isIP(address) === 4) {
    const octets = ipv4Octets(address);
    return octets[0] === 0 || octets[0] >= 224;
  }
  const normalized = address.toLowerCase();
  return normalized === '::' || normalized.startsWith('ff');
}

function isPrivateOrSpecial(address: string): boolean {
  if (isIP(address) === 4) {
    const [first, second] = ipv4Octets(address);
    return (
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 198 && (second === 18 || second === 19)) ||
      (first === 192 && second === 0) ||
      (first === 198 && second === 51) ||
      (first === 203 && second === 0)
    );
  }

  const normalized = address.toLowerCase();
  return (
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    /^fe[89ab]/u.test(normalized) ||
    normalized.startsWith('2001:db8:') ||
    normalized.startsWith('::ffff:')
  );
}

function ipv4Octets(address: string): readonly [number, number, number, number] {
  const values = address.split('.').map(Number);
  return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 0];
}
