import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';

/** Generates UUID v4 identifiers from the platform CSPRNG. */
@Injectable()
export class RandomUuidGenerator implements IIdGenerator {
  public next(): string {
    return randomUUID();
  }
}
