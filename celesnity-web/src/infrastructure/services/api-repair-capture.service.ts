import type {
  RepairCaptureResult,
  RepairCaptureService,
} from '@/src/application/services/repair-capture.service.interface';
import type {
  RepairAnswer,
  RepairComparison,
  RepairProcedure,
  RepairStep,
  StepVerification,
} from '@/src/entities/models/repair-guide';
import { CoreApiClient } from '@/src/infrastructure/api/core-api-client';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';

/** Calls this app's own `/api/repair-captures` routes, which hold the Gemini key. */
export class ApiRepairCaptureService implements RepairCaptureService {
  public constructor(
    private readonly transport: CoreApiClient = new CoreApiClient({ baseUrl: '/api' }),
  ) {}

  public capture(
    video: Blob,
    fileName: string,
    context: { readonly machineName: string; readonly faultName: string; readonly expert: string },
    signal?: AbortSignal,
  ): Promise<RepairCaptureResult> {
    const body = new FormData();
    body.set('video', video, fileName);
    body.set('machineName', context.machineName);
    body.set('faultName', context.faultName);
    body.set('expert', context.expert);
    return this.send('/repair-captures', { method: 'POST', body, signal });
  }

  public compare(
    first: { readonly expert: string; readonly procedure: RepairProcedure },
    second: { readonly expert: string; readonly procedure: RepairProcedure },
    signal?: AbortSignal,
  ): Promise<RepairComparison> {
    return this.send('/repair-captures/compare', {
      method: 'POST',
      body: JSON.stringify({ first, second }),
      signal,
    });
  }

  public verify(photo: Blob, step: RepairStep, signal?: AbortSignal): Promise<StepVerification> {
    const body = new FormData();
    body.set('photo', photo, 'step.jpg');
    body.set('step', JSON.stringify(step));
    return this.send('/repair-captures/verify', { method: 'POST', body, signal });
  }

  public ask(
    procedure: RepairProcedure,
    step: number,
    question: string,
    signal?: AbortSignal,
  ): Promise<RepairAnswer> {
    return this.send('/repair-captures/ask', {
      method: 'POST',
      body: JSON.stringify({ procedure, step, question }),
      signal,
    });
  }

  private async send<T>(path: string, init: RequestInit): Promise<T> {
    try {
      return await this.transport.request<T>(path, init);
    } catch (error: unknown) {
      throw translateCoreApiError(error);
    }
  }
}
