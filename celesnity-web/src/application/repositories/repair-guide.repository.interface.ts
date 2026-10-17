import type { RepairGuide } from '@/src/entities/models/repair-guide';

/** Where repair guides and the expert videos they replay from are kept. */
export interface RepairGuideRepository {
  list(siteId: string): Promise<readonly RepairGuide[]>;
  get(id: string): Promise<RepairGuide | undefined>;
  save(guide: RepairGuide): Promise<RepairGuide>;
  remove(id: string): Promise<void>;
  saveVideo(key: string, video: Blob): Promise<void>;
  getVideo(key: string): Promise<Blob | undefined>;
}
