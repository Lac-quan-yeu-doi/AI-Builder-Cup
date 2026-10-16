import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { IStreamingSecretGenerator } from '@application/streaming/interfaces/i-streaming-secret-generator';

@Injectable()
export class RandomStreamingSecretGenerator implements IStreamingSecretGenerator {
  public generate(): string {
    return randomBytes(32).toString('base64url');
  }
}
