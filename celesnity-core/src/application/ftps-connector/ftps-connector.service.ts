import type { IFtpsStatusReader } from '@application/ftps-connector/interfaces/i-ftps-status-reader';
import type {
  FtpsConnectorMetadataView,
  FtpsStatusView,
} from '@application/ftps-connector/read-models/ftps-connector.view';
import type { IClock } from '@application/shared/interfaces/i-clock';

export interface FtpsConnectorConfiguration {
  readonly host: string;
  readonly port: number;
  readonly remotePath: string;
  readonly username: string;
  /** External FTPS client credential; never an SFTPGo management secret. */
  readonly password: string;
}

export class FtpsConnectorService {
  public constructor(
    private readonly statusReader: IFtpsStatusReader,
    private readonly config: FtpsConnectorConfiguration,
    private readonly clock: IClock,
  ) {}

  public metadata(): FtpsConnectorMetadataView {
    return {
      connectorType: 'FTPS',
      host: this.config.host,
      port: this.config.port,
      encryption: 'explicit-tls',
      transferMode: 'passive',
      remotePath: this.config.remotePath,
      username: this.config.username,
      password: this.config.password,
    };
  }

  public async status(): Promise<FtpsStatusView> {
    return {
      ...(await this.statusReader.read(this.config.username)),
      checkedAt: this.clock.now().toISOString(),
    };
  }
}
