import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { IColumnProfileCache } from '@application/catalog-exploration/interfaces/i-column-profile-cache';
import type { ColumnProfile } from '@domain/catalog-exploration/models/catalog-models';

// Bounds the number of retained profiles so long-lived API processes cannot
// grow unbounded. Eviction is least-recently-inserted, same as
// InMemoryQueryResultStore.
const MAX_RETAINED_PROFILES = 256;

interface CacheEntry {
  readonly value: readonly ColumnProfile[];
  readonly expiresAt: number;
}

/**
 * In-process, single-instance, TTL-based cache of table column profiles.
 *
 * Profiling has no data-version signal to invalidate on (Trino/Iceberg
 * snapshot metadata isn't surfaced anywhere in this codebase), so staleness
 * is bounded purely by time (Requirement: pick 01, "grounding via
 * summarized stats"). Results are lost on restart and not shared across
 * instances — acceptable for a cache whose worst case is a re-profile, not
 * a correctness bug.
 */
@Injectable()
export class InMemoryColumnProfileStore implements IColumnProfileCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly ttlMs: number;

  public constructor(config: ConfigService) {
    this.ttlMs = config.getOrThrow<number>('COLUMN_PROFILE_CACHE_TTL_MS');
  }

  public get(key: string): readonly ColumnProfile[] | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  public set(key: string, value: readonly ColumnProfile[]): void {
    // Refresh insertion order so recently written entries are evicted last.
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    this.evictOverflow();
  }

  private evictOverflow(): void {
    while (this.entries.size > MAX_RETAINED_PROFILES) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) {
        return;
      }
      this.entries.delete(oldest);
    }
  }
}
