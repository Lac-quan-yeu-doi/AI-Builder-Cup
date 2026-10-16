import type { FtpsStatusProbeResult } from '@application/ftps-connector/read-models/ftps-connector.view';

export interface IFtpsStatusReader {
  read(username: string): Promise<FtpsStatusProbeResult>;
}
