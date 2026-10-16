import { Injectable } from '@nestjs/common';

import type { IClock } from '@application/shared/interfaces/i-clock';

/** Reads the host wall clock. The only non-deterministic time source. */
@Injectable()
export class SystemClock implements IClock {
  public now(): Date {
    return new Date();
  }
}
