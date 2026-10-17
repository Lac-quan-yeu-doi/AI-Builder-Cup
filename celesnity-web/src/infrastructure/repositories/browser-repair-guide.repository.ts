import type { RepairGuideRepository } from '@/src/application/repositories/repair-guide.repository.interface';
import type { RepairGuide } from '@/src/entities/models/repair-guide';

/*
 * Repair guides live in this browser until Core has an endpoint for them:
 * the guides as JSON in localStorage, and the expert videos (too large for
 * localStorage) in IndexedDB. Swapping to Core is a new repository bound in
 * the repair-guides DI module; nothing above this layer changes.
 */

const GUIDES_KEY = 'celesnity.repairGuides.v1';
const DATABASE = 'celesnity-repair-videos';
const STORE = 'videos';

export class BrowserRepairGuideRepository implements RepairGuideRepository {
  public async list(siteId: string): Promise<readonly RepairGuide[]> {
    return this.read()
      .filter((guide) => guide.siteId === siteId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  public async get(id: string): Promise<RepairGuide | undefined> {
    return this.read().find((guide) => guide.id === id);
  }

  public async save(guide: RepairGuide): Promise<RepairGuide> {
    const others = this.read().filter((value) => value.id !== guide.id);
    this.write([...others, guide]);
    return guide;
  }

  public async remove(id: string): Promise<void> {
    this.write(this.read().filter((guide) => guide.id !== id));
    const database = await openVideos();
    await request(database.transaction(STORE, 'readwrite').objectStore(STORE).delete(id));
    await request(
      database.transaction(STORE, 'readwrite').objectStore(STORE).delete(`${id}:compare`),
    );
  }

  public async saveVideo(key: string, video: Blob): Promise<void> {
    const database = await openVideos();
    await request(database.transaction(STORE, 'readwrite').objectStore(STORE).put(video, key));
  }

  public async getVideo(key: string): Promise<Blob | undefined> {
    const database = await openVideos();
    const value: unknown = await request(
      database.transaction(STORE, 'readonly').objectStore(STORE).get(key),
    );
    return value instanceof Blob ? value : undefined;
  }

  private read(): RepairGuide[] {
    try {
      const raw = window.localStorage.getItem(GUIDES_KEY);
      const parsed: unknown = raw === null ? [] : JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as RepairGuide[]) : [];
    } catch {
      return [];
    }
  }

  private write(guides: readonly RepairGuide[]): void {
    window.localStorage.setItem(GUIDES_KEY, JSON.stringify(guides));
  }
}

let opening: Promise<IDBDatabase> | undefined;

function openVideos(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const open = window.indexedDB.open(DATABASE, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => {
      opening = undefined;
      reject(open.error ?? new Error('Video storage is unavailable.'));
    };
  });
  return opening;
}

function request<T>(operation: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error ?? new Error('Video storage failed.'));
  });
}
