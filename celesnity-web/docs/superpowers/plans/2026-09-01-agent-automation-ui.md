# Agent Automation UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `celesnity-web` a minimal "Automations" surface — list, create/edit, and trigger-history views — backed by the new `celesnity-core` Automation API, reusing the existing agent-manifest listing for the agent picker.

**Architecture:** Standard clean-architecture vertical slice mirroring the existing `database-service` feature exactly: entity types → repository interface → one-liner factory use-cases → Zod-validated controllers → a `CoreApiClient`-backed infrastructure repository → DI wiring in `di/` → a `'use client'` feature/screen/list/form component set → a new workspace route.

**Tech Stack:** Next.js (App Router), TypeScript, Zod, Vitest, native `fetch` via the existing `CoreApiClient`/`GeneratedApiTransport` abstraction.

**Spec:** `docs/superpowers/specs/2026-09-01-agent-automation-platform-design.md` (in `celesnity-core`) and `docs/superpowers/plans/2026-09-01-agent-automation-backend.md` (in `celesnity-core`) — this plan assumes that backend plan is implemented and deployed first; the endpoints it calls (`POST /automations`, `GET /automations`, `PATCH /automations/:id`, `GET /automations/:id/triggers`) do not exist until then.

## Global Constraints

- No visual template-builder for `inputTemplate` — a raw JSON textarea is sufficient for v1.
- No new HTTP client — use the existing `CoreApiClient`/`GeneratedApiTransport` pattern exactly as `CoreApiDatabaseServiceRepository` does.
- The agent picker reuses the **already-existing** `ListAgentManifestsController` (bound in `di/modules/agent-manifests.module.ts`, calling `minder-agent`'s `/agent-manifests` directly via `AgentApiClient`) — do not build a new repository or endpoint for listing agents.
- Every new key added to `app/_i18n/en.ts` must get a matching key in `app/_i18n/vi.ts` in the same commit, or the build fails (`TranslationKey = keyof typeof en` makes `vi.ts` a compile error otherwise).
- Tests use Vitest. Repository tests use a hand-written `FakeGeneratedApiTransport` (no `vi.mock`). Screen/component tests use `renderUi()` from `tests/support/render-ui.ts` with hand-built `vi.fn()` controllers passed as props — matching the production DI-via-props pattern.
- Follow the existing file layout: `src/entities/models/`, `src/application/repositories/`, `src/application/use-cases/`, `src/interface-adapters/controllers/`, `src/infrastructure/repositories/`, `app/_components/<feature>/`, `app/(workspace)/<route>/page.tsx`.

---

### Task 1: Entity types and repository interface

**Files:**

- Create: `src/entities/models/agent-automation.ts`
- Create: `src/application/repositories/agent-automation.repository.interface.ts`

**Interfaces:**

- Produces: types `AgentAutomation`, `AgentAutomationInput`, `AgentAutomationTrigger`, `AgentAutomationTriggerStatus`; interface `AgentAutomationRepository`.

Pure type definitions — no runtime behavior, no test cycle. Unblocks every later task.

- [ ] **Step 1: Write the entity types**

```ts
// src/entities/models/agent-automation.ts
export type AgentAutomationTriggerStatus =
  'SUCCESS' | 'MAPPING_FAILED' | 'UNKNOWN_AGENT' | 'UNREACHABLE';

export interface AgentAutomation {
  readonly id: string;
  readonly name: string;
  readonly eventTopic: string;
  readonly agentId: string;
  readonly inputTemplate: Readonly<Record<string, string>>;
  readonly enabled: boolean;
  readonly createdAt: string;
}

export interface AgentAutomationInput {
  readonly name: string;
  readonly eventTopic: string;
  readonly agentId: string;
  readonly inputTemplate: Readonly<Record<string, string>>;
}

export interface AgentAutomationTrigger {
  readonly id: string;
  readonly status: AgentAutomationTriggerStatus;
  readonly sessionKey?: string;
  readonly errorMessage?: string;
  readonly createdAt: string;
}
```

- [ ] **Step 2: Write the repository interface**

```ts
// src/application/repositories/agent-automation.repository.interface.ts
import {
  AgentAutomation,
  AgentAutomationInput,
  AgentAutomationTrigger,
} from '@/src/entities/models/agent-automation';

export interface AgentAutomationRepository {
  list(): Promise<readonly AgentAutomation[]>;
  create(input: AgentAutomationInput): Promise<AgentAutomation>;
  setEnabled(id: string, enabled: boolean): Promise<AgentAutomation>;
  listTriggers(automationId: string): Promise<readonly AgentAutomationTrigger[]>;
}
```

Confirm the exact import alias convention (`@/src/...` vs relative) by checking an existing sibling file, e.g. `src/application/repositories/database-service.repository.interface.ts`, before finalizing this import.

- [ ] **Step 3: Commit**

```bash
git add src/entities/models/agent-automation.ts src/application/repositories/agent-automation.repository.interface.ts
git commit -m "feat(automations): add AgentAutomation entity types and repository interface"
```

---

### Task 2: `CoreApiAgentAutomationRepository`

**Files:**

- Create: `src/infrastructure/repositories/core-api-agent-automation.repository.ts`
- Create: `src/infrastructure/repositories/agent-automation-api.mapper.ts`
- Test: `tests/unit/infrastructure/repositories/core-api-agent-automation.repository.test.ts`

**Interfaces:**

- Consumes: `AgentAutomationRepository`, `AgentAutomation`, `AgentAutomationInput`, `AgentAutomationTrigger` (Task 1); `GeneratedApiTransport`, `translateCoreApiError` (existing).
- Produces: `CoreApiAgentAutomationRepository` implementing `AgentAutomationRepository`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/infrastructure/repositories/core-api-agent-automation.repository.test.ts
import { describe, expect, it } from 'vitest';
import { CoreApiAgentAutomationRepository } from '@/src/infrastructure/repositories/core-api-agent-automation.repository';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api-transport'; // confirm exact path/name before use

interface RecordedRequest {
  path: string;
  init?: RequestInit;
}

class FakeGeneratedApiTransport implements GeneratedApiTransport {
  public readonly requests: RecordedRequest[] = [];
  private readonly responses: unknown[];

  public constructor(responses: unknown[]) {
    this.responses = [...responses];
  }

  public async request<T>(path: string, init?: RequestInit): Promise<T> {
    this.requests.push({ path, init });
    const next = this.responses.shift();
    if (next instanceof Error) throw next;
    return next as T;
  }

  public async stream(): Promise<never> {
    throw new Error('not used in these tests');
  }
}

describe('CoreApiAgentAutomationRepository', () => {
  it('lists automations and maps every response field', async () => {
    const transport = new FakeGeneratedApiTransport([
      [
        {
          id: 'auto-1',
          name: 'Crawl summarizer',
          eventTopic: 'celesnity.streaming.control.v1',
          agentId: 'chat-assistant',
          inputTemplate: { message: '$.payload.summary' },
          enabled: true,
          createdAt: '2026-09-01T00:00:00.000Z',
        },
      ],
    ]);
    const repository = new CoreApiAgentAutomationRepository(transport);

    const result = await repository.list();

    expect(transport.requests).toEqual([{ path: '/automations', init: { method: 'GET' } }]);
    expect(result).toEqual([
      {
        id: 'auto-1',
        name: 'Crawl summarizer',
        eventTopic: 'celesnity.streaming.control.v1',
        agentId: 'chat-assistant',
        inputTemplate: { message: '$.payload.summary' },
        enabled: true,
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    ]);
  });

  it('creates an automation via POST /automations', async () => {
    const transport = new FakeGeneratedApiTransport([
      {
        id: 'auto-2',
        name: 'New one',
        eventTopic: 'topic.x',
        agentId: 'agent-x',
        inputTemplate: {},
        enabled: true,
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    ]);
    const repository = new CoreApiAgentAutomationRepository(transport);

    const result = await repository.create({
      name: 'New one',
      eventTopic: 'topic.x',
      agentId: 'agent-x',
      inputTemplate: {},
    });

    expect(transport.requests).toEqual([
      {
        path: '/automations',
        init: {
          method: 'POST',
          body: JSON.stringify({
            name: 'New one',
            eventTopic: 'topic.x',
            agentId: 'agent-x',
            inputTemplate: {},
          }),
        },
      },
    ]);
    expect(result.id).toBe('auto-2');
  });

  it('toggles an automation via PATCH /automations/{id}', async () => {
    const transport = new FakeGeneratedApiTransport([
      {
        id: 'auto-1',
        name: 'Crawl summarizer',
        eventTopic: 'topic',
        agentId: 'agent',
        inputTemplate: {},
        enabled: false,
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    ]);
    const repository = new CoreApiAgentAutomationRepository(transport);

    const result = await repository.setEnabled('auto-1', false);

    expect(transport.requests).toEqual([
      {
        path: '/automations/auto-1',
        init: { method: 'PATCH', body: JSON.stringify({ enabled: false }) },
      },
    ]);
    expect(result.enabled).toBe(false);
  });

  it('lists triggers for an automation', async () => {
    const transport = new FakeGeneratedApiTransport([
      [
        {
          id: 'trg-1',
          status: 'SUCCESS',
          sessionKey: 'automation:auto-1:delivery-1',
          createdAt: '2026-09-01T00:00:00.000Z',
        },
      ],
    ]);
    const repository = new CoreApiAgentAutomationRepository(transport);

    const result = await repository.listTriggers('auto-1');

    expect(transport.requests).toEqual([
      { path: '/automations/auto-1/triggers', init: { method: 'GET' } },
    ]);
    expect(result[0]).toEqual({
      id: 'trg-1',
      status: 'SUCCESS',
      sessionKey: 'automation:auto-1:delivery-1',
      createdAt: '2026-09-01T00:00:00.000Z',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/infrastructure/repositories/core-api-agent-automation.repository.test.ts`
Expected: FAIL — cannot find module `@/src/infrastructure/repositories/core-api-agent-automation.repository`

- [ ] **Step 3: Write the implementation**

First read `src/infrastructure/repositories/core-api-database-service.repository.ts` and its sibling mapper file to confirm the exact `GeneratedApiTransport` type import path and the `translateCoreApiError` import path, then mirror them here.

```ts
// src/infrastructure/repositories/agent-automation-api.mapper.ts
import {
  AgentAutomation,
  AgentAutomationInput,
  AgentAutomationTrigger,
} from '@/src/entities/models/agent-automation';

interface AgentAutomationResponseDto {
  id: string;
  name: string;
  eventTopic: string;
  agentId: string;
  inputTemplate: Record<string, string>;
  enabled: boolean;
  createdAt: string;
}

interface AgentAutomationTriggerResponseDto {
  id: string;
  status: AgentAutomationTrigger['status'];
  sessionKey?: string;
  errorMessage?: string;
  createdAt: string;
}

export function fromAgentAutomationResponse(dto: AgentAutomationResponseDto): AgentAutomation {
  return {
    id: dto.id,
    name: dto.name,
    eventTopic: dto.eventTopic,
    agentId: dto.agentId,
    inputTemplate: dto.inputTemplate,
    enabled: dto.enabled,
    createdAt: dto.createdAt,
  };
}

export function fromAgentAutomationTriggerResponse(
  dto: AgentAutomationTriggerResponseDto,
): AgentAutomationTrigger {
  return {
    id: dto.id,
    status: dto.status,
    ...(dto.sessionKey === undefined ? {} : { sessionKey: dto.sessionKey }),
    ...(dto.errorMessage === undefined ? {} : { errorMessage: dto.errorMessage }),
    createdAt: dto.createdAt,
  };
}

export function toCreateAgentAutomationRequest(
  input: AgentAutomationInput,
): Record<string, unknown> {
  return {
    name: input.name,
    eventTopic: input.eventTopic,
    agentId: input.agentId,
    inputTemplate: input.inputTemplate,
  };
}
```

```ts
// src/infrastructure/repositories/core-api-agent-automation.repository.ts
import {
  AgentAutomation,
  AgentAutomationInput,
  AgentAutomationTrigger,
} from '@/src/entities/models/agent-automation';
import { AgentAutomationRepository } from '@/src/application/repositories/agent-automation.repository.interface';
import { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api-transport';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';
import {
  fromAgentAutomationResponse,
  fromAgentAutomationTriggerResponse,
  toCreateAgentAutomationRequest,
} from './agent-automation-api.mapper';

export class CoreApiAgentAutomationRepository implements AgentAutomationRepository {
  public constructor(private readonly transport: GeneratedApiTransport) {}

  public async list(): Promise<readonly AgentAutomation[]> {
    const response = await this.request<unknown[]>('/automations', { method: 'GET' });
    return response.map((dto) =>
      fromAgentAutomationResponse(dto as Parameters<typeof fromAgentAutomationResponse>[0]),
    );
  }

  public async create(input: AgentAutomationInput): Promise<AgentAutomation> {
    const response = await this.request<unknown>('/automations', {
      method: 'POST',
      body: JSON.stringify(toCreateAgentAutomationRequest(input)),
    });
    return fromAgentAutomationResponse(
      response as Parameters<typeof fromAgentAutomationResponse>[0],
    );
  }

  public async setEnabled(id: string, enabled: boolean): Promise<AgentAutomation> {
    const response = await this.request<unknown>(`/automations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    });
    return fromAgentAutomationResponse(
      response as Parameters<typeof fromAgentAutomationResponse>[0],
    );
  }

  public async listTriggers(automationId: string): Promise<readonly AgentAutomationTrigger[]> {
    const response = await this.request<unknown[]>(`/automations/${automationId}/triggers`, {
      method: 'GET',
    });
    return response.map((dto) =>
      fromAgentAutomationTriggerResponse(
        dto as Parameters<typeof fromAgentAutomationTriggerResponse>[0],
      ),
    );
  }

  private async request<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
    try {
      return await this.transport.request<TResponse>(path, init);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/infrastructure/repositories/core-api-agent-automation.repository.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/repositories/core-api-agent-automation.repository.ts src/infrastructure/repositories/agent-automation-api.mapper.ts tests/unit/infrastructure/repositories/core-api-agent-automation.repository.test.ts
git commit -m "feat(automations): add CoreApiAgentAutomationRepository"
```

---

### Task 3: Use-cases

**Files:**

- Create: `src/application/use-cases/automations/list-automations.use-case.ts`
- Create: `src/application/use-cases/automations/create-automation.use-case.ts`
- Create: `src/application/use-cases/automations/toggle-automation.use-case.ts`
- Create: `src/application/use-cases/automations/list-automation-triggers.use-case.ts`

**Interfaces:**

- Consumes: `AgentAutomationRepository` (Task 1).
- Produces: `ListAutomationsUseCase`, `CreateAutomationUseCase`, `ToggleAutomationUseCase`, `ListAutomationTriggersUseCase` (all `ReturnType<typeof create...UseCase>`, one-liner factories — no independent test cycle, these are pure delegation matching `createListDatabaseServicesUseCase` exactly).

- [ ] **Step 1: Write the four use-cases**

```ts
// src/application/use-cases/automations/list-automations.use-case.ts
import { AgentAutomationRepository } from '@/src/application/repositories/agent-automation.repository.interface';

export type ListAutomationsUseCase = ReturnType<typeof createListAutomationsUseCase>;
export const createListAutomationsUseCase = (repository: AgentAutomationRepository) => () =>
  repository.list();
```

```ts
// src/application/use-cases/automations/create-automation.use-case.ts
import { AgentAutomationInput } from '@/src/entities/models/agent-automation';
import { AgentAutomationRepository } from '@/src/application/repositories/agent-automation.repository.interface';

export type CreateAutomationUseCase = ReturnType<typeof createCreateAutomationUseCase>;
export const createCreateAutomationUseCase =
  (repository: AgentAutomationRepository) => (input: AgentAutomationInput) =>
    repository.create(input);
```

```ts
// src/application/use-cases/automations/toggle-automation.use-case.ts
import { AgentAutomationRepository } from '@/src/application/repositories/agent-automation.repository.interface';

export type ToggleAutomationUseCase = ReturnType<typeof createToggleAutomationUseCase>;
export const createToggleAutomationUseCase =
  (repository: AgentAutomationRepository) => (id: string, enabled: boolean) =>
    repository.setEnabled(id, enabled);
```

```ts
// src/application/use-cases/automations/list-automation-triggers.use-case.ts
import { AgentAutomationRepository } from '@/src/application/repositories/agent-automation.repository.interface';

export type ListAutomationTriggersUseCase = ReturnType<typeof createListAutomationTriggersUseCase>;
export const createListAutomationTriggersUseCase =
  (repository: AgentAutomationRepository) => (automationId: string) =>
    repository.listTriggers(automationId);
```

- [ ] **Step 2: Commit**

```bash
git add src/application/use-cases/automations/
git commit -m "feat(automations): add automation use-cases"
```

---

### Task 4: Controllers and schemas

**Files:**

- Create: `src/interface-adapters/controllers/automations/automation.schemas.ts`
- Create: `src/interface-adapters/controllers/automations/list-automations.controller.ts`
- Create: `src/interface-adapters/controllers/automations/create-automation.controller.ts`
- Create: `src/interface-adapters/controllers/automations/toggle-automation.controller.ts`
- Create: `src/interface-adapters/controllers/automations/list-automation-triggers.controller.ts`
- Create: `src/interface-adapters/presenters/automation.presenter.ts`

**Interfaces:**

- Consumes: use-cases (Task 3), entity types (Task 1).
- Produces: `AutomationViewModel`, `AutomationTriggerViewModel`, four controller functions.

First read `src/interface-adapters/controllers/database-services/create-database-service.controller.ts` and its `.schemas.ts` sibling to confirm the exact `InputParseError` import path before writing these.

- [ ] **Step 1: Write the Zod schema**

```ts
// src/interface-adapters/controllers/automations/automation.schemas.ts
import { z } from 'zod';

export const agentAutomationInputSchema = z.object({
  name: z.string().trim().min(1),
  eventTopic: z.string().trim().min(1),
  agentId: z.string().trim().min(1),
  inputTemplate: z.record(z.string(), z.string()),
});
```

- [ ] **Step 2: Write the presenter**

```ts
// src/interface-adapters/presenters/automation.presenter.ts
import { AgentAutomation, AgentAutomationTrigger } from '@/src/entities/models/agent-automation';

export interface AutomationViewModel {
  readonly id: string;
  readonly name: string;
  readonly eventTopic: string;
  readonly agentId: string;
  readonly inputTemplate: Readonly<Record<string, string>>;
  readonly enabled: boolean;
  readonly createdAt: string;
}

export interface AutomationTriggerViewModel {
  readonly id: string;
  readonly status: AgentAutomationTrigger['status'];
  readonly sessionKey?: string;
  readonly errorMessage?: string;
  readonly createdAt: string;
}

export function presentAutomation(model: AgentAutomation): AutomationViewModel {
  return {
    id: model.id,
    name: model.name,
    eventTopic: model.eventTopic,
    agentId: model.agentId,
    inputTemplate: model.inputTemplate,
    enabled: model.enabled,
    createdAt: model.createdAt,
  };
}

export function presentAutomationTrigger(
  model: AgentAutomationTrigger,
): AutomationTriggerViewModel {
  return {
    id: model.id,
    status: model.status,
    ...(model.sessionKey === undefined ? {} : { sessionKey: model.sessionKey }),
    ...(model.errorMessage === undefined ? {} : { errorMessage: model.errorMessage }),
    createdAt: model.createdAt,
  };
}
```

- [ ] **Step 3: Write the four controllers**

```ts
// src/interface-adapters/controllers/automations/list-automations.controller.ts
import { ListAutomationsUseCase } from '@/src/application/use-cases/automations/list-automations.use-case';
import {
  AutomationViewModel,
  presentAutomation,
} from '@/src/interface-adapters/presenters/automation.presenter';

export const createListAutomationsController =
  (useCase: ListAutomationsUseCase): (() => Promise<readonly AutomationViewModel[]>) =>
  async () => {
    const automations = await useCase();
    return automations.map(presentAutomation);
  };
```

```ts
// src/interface-adapters/controllers/automations/create-automation.controller.ts
import { InputParseError } from '@/src/entities/errors/common'; // confirm exact path from create-database-service.controller.ts
import { CreateAutomationUseCase } from '@/src/application/use-cases/automations/create-automation.use-case';
import { AgentAutomationInput } from '@/src/entities/models/agent-automation';
import {
  AutomationViewModel,
  presentAutomation,
} from '@/src/interface-adapters/presenters/automation.presenter';
import { agentAutomationInputSchema } from './automation.schemas';

export const createCreateAutomationController =
  (
    useCase: CreateAutomationUseCase,
  ): ((input: AgentAutomationInput) => Promise<AutomationViewModel>) =>
  async (input) => {
    const parsed = agentAutomationInputSchema.safeParse(input);
    if (!parsed.success)
      throw new InputParseError('Invalid agentAutomation input', { cause: parsed.error });
    return presentAutomation(await useCase(parsed.data));
  };
```

```ts
// src/interface-adapters/controllers/automations/toggle-automation.controller.ts
import { ToggleAutomationUseCase } from '@/src/application/use-cases/automations/toggle-automation.use-case';
import {
  AutomationViewModel,
  presentAutomation,
} from '@/src/interface-adapters/presenters/automation.presenter';

export const createToggleAutomationController =
  (
    useCase: ToggleAutomationUseCase,
  ): ((id: string, enabled: boolean) => Promise<AutomationViewModel>) =>
  async (id, enabled) =>
    presentAutomation(await useCase(id, enabled));
```

```ts
// src/interface-adapters/controllers/automations/list-automation-triggers.controller.ts
import { ListAutomationTriggersUseCase } from '@/src/application/use-cases/automations/list-automation-triggers.use-case';
import {
  AutomationTriggerViewModel,
  presentAutomationTrigger,
} from '@/src/interface-adapters/presenters/automation.presenter';

export const createListAutomationTriggersController =
  (
    useCase: ListAutomationTriggersUseCase,
  ): ((automationId: string) => Promise<readonly AutomationTriggerViewModel[]>) =>
  async (automationId) => {
    const triggers = await useCase(automationId);
    return triggers.map(presentAutomationTrigger);
  };
```

- [ ] **Step 4: Commit**

```bash
git add src/interface-adapters/controllers/automations/ src/interface-adapters/presenters/automation.presenter.ts
git commit -m "feat(automations): add automation controllers, schema, and presenter"
```

---

### Task 5: i18n strings

**Files:**

- Modify: `app/_i18n/en.ts`
- Modify: `app/_i18n/vi.ts`

**Interfaces:**

- Produces: translation keys `nav.automations`, `page.automations.title`, `page.automations.description`, `automations.create`, `automations.name`, `automations.eventTopic`, `automations.agent`, `automations.enabled`, `automations.inputTemplate`, `automations.triggers.title`, `automations.triggers.empty`, `automations.triggers.status.SUCCESS`, `automations.triggers.status.MAPPING_FAILED`, `automations.triggers.status.UNKNOWN_AGENT`, `automations.triggers.status.UNREACHABLE`.

- [ ] **Step 1: Add English keys**

Add to `app/_i18n/en.ts`, in the same object literal as the existing keys (alphabetical or grouped placement matching how `database-services` keys are grouped there):

```ts
'nav.automations': 'Automations',
'page.automations.title': 'Automations',
'page.automations.description': 'Trigger agents automatically from platform events.',
'automations.create': 'New automation',
'automations.name': 'Name',
'automations.eventTopic': 'Event topic',
'automations.agent': 'Agent',
'automations.enabled': 'Enabled',
'automations.inputTemplate': 'Input template (JSON)',
'automations.triggers.title': 'Recent triggers',
'automations.triggers.empty': 'No triggers yet.',
'automations.triggers.status.SUCCESS': 'Triggered',
'automations.triggers.status.MAPPING_FAILED': 'Payload mapping failed',
'automations.triggers.status.UNKNOWN_AGENT': 'Unknown agent',
'automations.triggers.status.UNREACHABLE': 'Agent unreachable',
```

- [ ] **Step 2: Add matching Vietnamese keys**

Add the same keys to `app/_i18n/vi.ts` (required — `Dictionary` is `Readonly<Record<TranslationKey, string>>`, a missing key is a compile error):

```ts
'nav.automations': 'Tự động hóa',
'page.automations.title': 'Tự động hóa',
'page.automations.description': 'Tự động kích hoạt tác nhân từ các sự kiện nền tảng.',
'automations.create': 'Tự động hóa mới',
'automations.name': 'Tên',
'automations.eventTopic': 'Chủ đề sự kiện',
'automations.agent': 'Tác nhân',
'automations.enabled': 'Đã bật',
'automations.inputTemplate': 'Mẫu đầu vào (JSON)',
'automations.triggers.title': 'Kích hoạt gần đây',
'automations.triggers.empty': 'Chưa có lần kích hoạt nào.',
'automations.triggers.status.SUCCESS': 'Đã kích hoạt',
'automations.triggers.status.MAPPING_FAILED': 'Lỗi ánh xạ dữ liệu',
'automations.triggers.status.UNKNOWN_AGENT': 'Không rõ tác nhân',
'automations.triggers.status.UNREACHABLE': 'Không thể kết nối tác nhân',
```

- [ ] **Step 3: Run the typecheck to confirm no missing keys**

Run: `npx tsc --noEmit`
Expected: no errors related to `app/_i18n/vi.ts` or `Dictionary`.

- [ ] **Step 4: Commit**

```bash
git add app/_i18n/en.ts app/_i18n/vi.ts
git commit -m "feat(automations): add automations i18n strings"
```

---

### Task 6: DI wiring

**Files:**

- Modify: `di/types.ts`
- Create: `di/modules/automations.module.ts`
- Modify: `di/container.ts`

**Interfaces:**

- Consumes: `CoreApiAgentAutomationRepository` (Task 2), use-cases (Task 3), controllers (Task 4), existing `CoreApiClient` binding, existing `ListAgentManifestsController` binding (from `di/modules/agent-manifests.module.ts` — reused as-is, no changes to that file).
- Produces: DI symbols and bindings for `AgentAutomationRepository`, the four use-cases, and the four controllers.

- [ ] **Step 1: Add symbols to `di/types.ts`**

Find the existing `DI_RETURN_TYPES` interface and `DI_SYMBOLS` const object (the `database-services` entries are a good anchor) and add, in the same three-section pattern (imports, return-types, symbols):

```ts
// imports section — add alongside existing database-service imports
import type { AgentAutomationRepository } from '@/src/application/repositories/agent-automation.repository.interface';
import type { ListAutomationsUseCase } from '@/src/application/use-cases/automations/list-automations.use-case';
import type { CreateAutomationUseCase } from '@/src/application/use-cases/automations/create-automation.use-case';
import type { ToggleAutomationUseCase } from '@/src/application/use-cases/automations/toggle-automation.use-case';
import type { ListAutomationTriggersUseCase } from '@/src/application/use-cases/automations/list-automation-triggers.use-case';

// DI_RETURN_TYPES interface — add alongside existing DatabaseServiceRepository entries
AgentAutomationRepository: AgentAutomationRepository;
ListAutomationsUseCase: ListAutomationsUseCase;
CreateAutomationUseCase: CreateAutomationUseCase;
ToggleAutomationUseCase: ToggleAutomationUseCase;
ListAutomationTriggersUseCase: ListAutomationTriggersUseCase;
ListAutomationsController: ReturnType<typeof import('@/src/interface-adapters/controllers/automations/list-automations.controller').createListAutomationsController>;
CreateAutomationController: ReturnType<typeof import('@/src/interface-adapters/controllers/automations/create-automation.controller').createCreateAutomationController>;
ToggleAutomationController: ReturnType<typeof import('@/src/interface-adapters/controllers/automations/toggle-automation.controller').createToggleAutomationController>;
ListAutomationTriggersController: ReturnType<typeof import('@/src/interface-adapters/controllers/automations/list-automation-triggers.controller').createListAutomationTriggersController>;

// DI_SYMBOLS const object — add matching entries
AgentAutomationRepository: createSymbol('AgentAutomationRepository'),
ListAutomationsUseCase: createSymbol('ListAutomationsUseCase'),
CreateAutomationUseCase: createSymbol('CreateAutomationUseCase'),
ToggleAutomationUseCase: createSymbol('ToggleAutomationUseCase'),
ListAutomationTriggersUseCase: createSymbol('ListAutomationTriggersUseCase'),
ListAutomationsController: createSymbol('ListAutomationsController'),
CreateAutomationController: createSymbol('CreateAutomationController'),
ToggleAutomationController: createSymbol('ToggleAutomationController'),
ListAutomationTriggersController: createSymbol('ListAutomationTriggersController'),
```

Confirm the exact `createSymbol` helper name and the real import syntax used for `ReturnType<typeof import(...)>` entries by reading the existing `database-services` block in this file first — mirror it exactly rather than the sketch above if the real file differs in mechanics.

- [ ] **Step 2: Write the module**

```ts
// di/modules/automations.module.ts
import { DI_SYMBOLS } from '../types';
import { createTypedModule } from '../create-typed-module'; // confirm exact helper import path from database-services.module.ts
import { CoreApiAgentAutomationRepository } from '@/src/infrastructure/repositories/core-api-agent-automation.repository';
import { createListAutomationsUseCase } from '@/src/application/use-cases/automations/list-automations.use-case';
import { createCreateAutomationUseCase } from '@/src/application/use-cases/automations/create-automation.use-case';
import { createToggleAutomationUseCase } from '@/src/application/use-cases/automations/toggle-automation.use-case';
import { createListAutomationTriggersUseCase } from '@/src/application/use-cases/automations/list-automation-triggers.use-case';
import { createListAutomationsController } from '@/src/interface-adapters/controllers/automations/list-automations.controller';
import { createCreateAutomationController } from '@/src/interface-adapters/controllers/automations/create-automation.controller';
import { createToggleAutomationController } from '@/src/interface-adapters/controllers/automations/toggle-automation.controller';
import { createListAutomationTriggersController } from '@/src/interface-adapters/controllers/automations/list-automation-triggers.controller';

export function createAutomationsModule() {
  const automationsModule = createTypedModule();

  automationsModule
    .bind(DI_SYMBOLS.AgentAutomationRepository)
    .toClass(CoreApiAgentAutomationRepository, [DI_SYMBOLS.CoreApiClient]);

  automationsModule
    .bind(DI_SYMBOLS.ListAutomationsUseCase)
    .toHigherOrderFunction(createListAutomationsUseCase, [DI_SYMBOLS.AgentAutomationRepository]);
  automationsModule
    .bind(DI_SYMBOLS.CreateAutomationUseCase)
    .toHigherOrderFunction(createCreateAutomationUseCase, [DI_SYMBOLS.AgentAutomationRepository]);
  automationsModule
    .bind(DI_SYMBOLS.ToggleAutomationUseCase)
    .toHigherOrderFunction(createToggleAutomationUseCase, [DI_SYMBOLS.AgentAutomationRepository]);
  automationsModule
    .bind(DI_SYMBOLS.ListAutomationTriggersUseCase)
    .toHigherOrderFunction(createListAutomationTriggersUseCase, [
      DI_SYMBOLS.AgentAutomationRepository,
    ]);

  automationsModule
    .bind(DI_SYMBOLS.ListAutomationsController)
    .toHigherOrderFunction(createListAutomationsController, [DI_SYMBOLS.ListAutomationsUseCase]);
  automationsModule
    .bind(DI_SYMBOLS.CreateAutomationController)
    .toHigherOrderFunction(createCreateAutomationController, [DI_SYMBOLS.CreateAutomationUseCase]);
  automationsModule
    .bind(DI_SYMBOLS.ToggleAutomationController)
    .toHigherOrderFunction(createToggleAutomationController, [DI_SYMBOLS.ToggleAutomationUseCase]);
  automationsModule
    .bind(DI_SYMBOLS.ListAutomationTriggersController)
    .toHigherOrderFunction(createListAutomationTriggersController, [
      DI_SYMBOLS.ListAutomationTriggersUseCase,
    ]);

  return automationsModule;
}
```

Confirm the exact factory-function/import name (`createTypedModule`, or whatever `database-services.module.ts` actually imports) before finalizing — mirror that file's structure exactly.

- [ ] **Step 3: Register the module in `di/container.ts`**

Find the existing `applicationContainer.load(Symbol.for('celesnity.DatabaseServicesModule'), createDatabaseServicesModule())`-style line and add:

```ts
applicationContainer.load(Symbol.for('celesnity.AutomationsModule'), createAutomationsModule());
```

- [ ] **Step 4: Run the typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add di/types.ts di/modules/automations.module.ts di/container.ts
git commit -m "feat(automations): wire automation repository, use-cases, and controllers into DI container"
```

---

### Task 7: UI components

**Files:**

- Create: `app/_components/automation/automation-list.tsx`
- Create: `app/_components/automation/automation-form.tsx`
- Create: `app/_components/automation/automation-trigger-history.tsx`
- Create: `app/_components/automation/automations-screen.tsx`
- Create: `app/_components/automation/automation-feature.tsx`
- Test: `tests/unit/app/automations-screen.test.ts`

**Interfaces:**

- Consumes: `AutomationViewModel`, `AutomationTriggerViewModel` (Task 4); `getInjection` (existing DI resolver); `ListAgentManifestsController` (existing, for the agent picker); UI primitives `Button`, `PageBar`, `Card`, `Dialog`/`DialogContent`, `Skeleton`, `Badge`, `PageAlert`/`InlineError`, `useTranslation()` (all existing).
- Produces: `AutomationList`, `AutomationForm`, `AutomationTriggerHistory`, `AutomationsScreen`, `AutomationFeature`.

- [ ] **Step 1: Write the failing screen test**

```ts
// tests/unit/app/automations-screen.test.ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderUi } from '@/tests/support/render-ui';
import { AutomationsScreen } from '@/app/_components/automation/automations-screen';
import type { AutomationViewModel } from '@/src/interface-adapters/presenters/automation.presenter';

describe('AutomationsScreen', () => {
  it('lists automations returned by the list controller on mount', async () => {
    const automation: AutomationViewModel = {
      id: 'auto-1', name: 'Crawl summarizer', eventTopic: 'celesnity.streaming.control.v1',
      agentId: 'chat-assistant', inputTemplate: { message: '$.payload.summary' }, enabled: true,
      createdAt: '2026-09-01T00:00:00.000Z',
    };
    const controllers = {
      list: vi.fn(async () => [automation]),
      create: vi.fn(),
      toggle: vi.fn(),
      listTriggers: vi.fn(async () => []),
      listAgents: vi.fn(async () => []),
    };

    const { findByText } = renderUi(<AutomationsScreen controllers={controllers} />);

    expect(await findByText('Crawl summarizer')).toBeTruthy();
    expect(controllers.list).toHaveBeenCalledTimes(1);
  });

  it('toggles an automation and reflects the new enabled state', async () => {
    const automation: AutomationViewModel = {
      id: 'auto-1', name: 'Crawl summarizer', eventTopic: 'topic', agentId: 'agent',
      inputTemplate: {}, enabled: true, createdAt: '2026-09-01T00:00:00.000Z',
    };
    const controllers = {
      list: vi.fn(async () => [automation]),
      create: vi.fn(),
      toggle: vi.fn(async (id: string, enabled: boolean) => ({ ...automation, enabled })),
      listTriggers: vi.fn(async () => []),
      listAgents: vi.fn(async () => []),
    };

    const { findByRole } = renderUi(<AutomationsScreen controllers={controllers} />);
    const toggleControl = await findByRole('switch');
    toggleControl.click();

    expect(controllers.toggle).toHaveBeenCalledWith('auto-1', false);
  });
});
```

Read one existing screen test first (e.g. `tests/unit/app/database-services-screen.test.tsx`) to confirm the exact render/query API (`findByText`/`findByRole` from `renderUi`'s return shape) before finalizing this file — mirror its exact assertions style.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/app/automations-screen.test.ts`
Expected: FAIL — cannot find module `@/app/_components/automation/automations-screen`

- [ ] **Step 3: Write the presentational list component**

```tsx
// app/_components/automation/automation-list.tsx
'use client';
import { useTranslation } from '@/app/_i18n/use-translation'; // confirm exact hook import path
import { Badge } from '@/app/_components/ui/badge';
import type { AutomationViewModel } from '@/src/interface-adapters/presenters/automation.presenter';

interface AutomationListProps {
  readonly automations: readonly AutomationViewModel[];
  readonly onToggle: (id: string, enabled: boolean) => void;
  readonly onSelect: (automation: AutomationViewModel) => void;
}

export function AutomationList({ automations, onToggle, onSelect }: AutomationListProps) {
  const { t } = useTranslation();
  return (
    <div>
      {automations.map((automation) => (
        <article key={automation.id}>
          <button type="button" onClick={() => onSelect(automation)}>
            {automation.name}
          </button>
          <span>{automation.eventTopic}</span>
          <span>{automation.agentId}</span>
          <Badge>{automation.enabled ? t('automations.enabled') : ''}</Badge>
          <input
            type="checkbox"
            role="switch"
            checked={automation.enabled}
            onChange={(event) => onToggle(automation.id, event.target.checked)}
          />
        </article>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write the create form**

```tsx
// app/_components/automation/automation-form.tsx
'use client';
import { useState } from 'react';
import { useTranslation } from '@/app/_i18n/use-translation';
import { Button } from '@/app/_components/ui/button';
import type { AgentAutomationInput } from '@/src/entities/models/agent-automation';

interface AgentOption {
  readonly id: string;
  readonly name: string;
}

interface AutomationFormProps {
  readonly agents: readonly AgentOption[];
  readonly onSubmit: (input: AgentAutomationInput) => void;
  readonly onCancel: () => void;
}

export function AutomationForm({ agents, onSubmit, onCancel }: AutomationFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [eventTopic, setEventTopic] = useState('');
  const [agentId, setAgentId] = useState(agents[0]?.id ?? '');
  const [inputTemplateJson, setInputTemplateJson] = useState('{}');
  const [error, setError] = useState<string | undefined>(undefined);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    let inputTemplate: Record<string, string>;
    try {
      inputTemplate = JSON.parse(inputTemplateJson);
    } catch {
      setError('Invalid JSON');
      return;
    }
    setError(undefined);
    onSubmit({ name, eventTopic, agentId, inputTemplate });
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        {t('automations.name')}
        <input value={name} onChange={(event) => setName(event.target.value)} required />
      </label>
      <label>
        {t('automations.eventTopic')}
        <input
          value={eventTopic}
          onChange={(event) => setEventTopic(event.target.value)}
          required
        />
      </label>
      <label>
        {t('automations.agent')}
        <select value={agentId} onChange={(event) => setAgentId(event.target.value)}>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('automations.inputTemplate')}
        <textarea
          value={inputTemplateJson}
          onChange={(event) => setInputTemplateJson(event.target.value)}
        />
      </label>
      {error !== undefined && <p role="alert">{error}</p>}
      <Button type="submit">{t('automations.create')}</Button>
      <Button type="button" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}
```

- [ ] **Step 5: Write the trigger history component**

```tsx
// app/_components/automation/automation-trigger-history.tsx
'use client';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { AutomationTriggerViewModel } from '@/src/interface-adapters/presenters/automation.presenter';

interface AutomationTriggerHistoryProps {
  readonly triggers: readonly AutomationTriggerViewModel[];
}

export function AutomationTriggerHistory({ triggers }: AutomationTriggerHistoryProps) {
  const { t } = useTranslation();
  if (triggers.length === 0) {
    return <p>{t('automations.triggers.empty')}</p>;
  }
  return (
    <ul>
      {triggers.map((trigger) => (
        <li key={trigger.id}>
          <span>{t(`automations.triggers.status.${trigger.status}`)}</span>
          <span>{trigger.createdAt}</span>
          {trigger.errorMessage !== undefined && <span>{trigger.errorMessage}</span>}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 6: Write the screen (owns state, composes the above)**

```tsx
// app/_components/automation/automations-screen.tsx
'use client';
import { useEffect, useState } from 'react';
import { useTranslation } from '@/app/_i18n/use-translation';
import { PageBar } from '@/app/_components/ui/page-bar';
import { Button } from '@/app/_components/ui/button';
import { Dialog, DialogContent } from '@/app/_components/ui/dialog';
import { AutomationList } from './automation-list';
import { AutomationForm } from './automation-form';
import { AutomationTriggerHistory } from './automation-trigger-history';
import type {
  AutomationViewModel,
  AutomationTriggerViewModel,
} from '@/src/interface-adapters/presenters/automation.presenter';
import type { AgentAutomationInput } from '@/src/entities/models/agent-automation';

interface AgentOption {
  readonly id: string;
  readonly name: string;
}

interface AutomationsScreenControllers {
  readonly list: () => Promise<readonly AutomationViewModel[]>;
  readonly create: (input: AgentAutomationInput) => Promise<AutomationViewModel>;
  readonly toggle: (id: string, enabled: boolean) => Promise<AutomationViewModel>;
  readonly listTriggers: (automationId: string) => Promise<readonly AutomationTriggerViewModel[]>;
  readonly listAgents: () => Promise<readonly AgentOption[]>;
}

interface AutomationsScreenProps {
  readonly controllers: AutomationsScreenControllers;
}

export function AutomationsScreen({ controllers }: AutomationsScreenProps) {
  const { t } = useTranslation();
  const [automations, setAutomations] = useState<readonly AutomationViewModel[]>([]);
  const [agents, setAgents] = useState<readonly AgentOption[]>([]);
  const [selected, setSelected] = useState<AutomationViewModel | undefined>(undefined);
  const [triggers, setTriggers] = useState<readonly AutomationTriggerViewModel[]>([]);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([controllers.list(), controllers.listAgents()]).then(
      ([loadedAutomations, loadedAgents]) => {
        if (cancelled) return;
        setAutomations(loadedAutomations);
        setAgents(loadedAgents);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [controllers]);

  async function handleToggle(id: string, enabled: boolean) {
    const updated = await controllers.toggle(id, enabled);
    setAutomations((current) =>
      current.map((automation) => (automation.id === id ? updated : automation)),
    );
  }

  async function handleCreate(input: AgentAutomationInput) {
    const created = await controllers.create(input);
    setAutomations((current) => [...current, created]);
    setFormOpen(false);
  }

  async function handleSelect(automation: AutomationViewModel) {
    setSelected(automation);
    setTriggers(await controllers.listTriggers(automation.id));
  }

  return (
    <div>
      <PageBar title={t('page.automations.title')} description={t('page.automations.description')}>
        <Button onClick={() => setFormOpen(true)}>{t('automations.create')}</Button>
      </PageBar>
      <AutomationList automations={automations} onToggle={handleToggle} onSelect={handleSelect} />
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <AutomationForm
            agents={agents}
            onSubmit={handleCreate}
            onCancel={() => setFormOpen(false)}
          />
        </DialogContent>
      </Dialog>
      {selected !== undefined && (
        <div>
          <h2>{t('automations.triggers.title')}</h2>
          <AutomationTriggerHistory triggers={triggers} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Write the feature wrapper (DI resolution boundary)**

Read `app/_components/database-service/database-service-feature.tsx` first to confirm the exact `getInjection` import path and the existing agent-manifest controller's DI symbol name (from `di/modules/agent-manifests.module.ts`) before finalizing this file.

```tsx
// app/_components/automation/automation-feature.tsx
'use client';
import { getInjection } from '@/di/container';
import { AutomationsScreen } from './automations-screen';

const controllers = Object.freeze({
  list: getInjection('ListAutomationsController'),
  create: getInjection('CreateAutomationController'),
  toggle: getInjection('ToggleAutomationController'),
  listTriggers: getInjection('ListAutomationTriggersController'),
  listAgents: getInjection('ListAgentManifestsController'),
});

export function AutomationFeature() {
  return <AutomationsScreen controllers={controllers} />;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run tests/unit/app/automations-screen.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add app/_components/automation/ tests/unit/app/automations-screen.test.ts
git commit -m "feat(automations): add Automations UI components"
```

---

### Task 8: Route and navigation

**Files:**

- Create: `app/(workspace)/automations/page.tsx`
- Modify: `app/_components/layout/workspace-navigation.ts`

**Interfaces:**

- Consumes: `AutomationFeature` (Task 7).
- Produces: the `/automations` route, reachable from the workspace nav.

- [ ] **Step 1: Write the page**

```tsx
// app/(workspace)/automations/page.tsx
import type { Metadata } from 'next';
import { PageContainer } from '@/app/_components/layout/page-container'; // confirm exact import path from executions/page.tsx
import { AutomationFeature } from '@/app/_components/automation/automation-feature';

export const metadata: Metadata = { title: 'Automations' };

export default function AutomationsPage() {
  return (
    <PageContainer>
      <AutomationFeature />
    </PageContainer>
  );
}
```

- [ ] **Step 2: Add a nav entry**

Read `app/_components/layout/workspace-navigation.ts` to find the `workspaceNavigationGroups` array and the icon import convention (lucide icons), then add one entry:

```ts
{ href: '/automations', labelKey: 'nav.automations', icon: WorkflowIcon }, // or whichever lucide icon best fits existing nav entries — check what's already imported for a similar concept before picking a new one
```

- [ ] **Step 3: Run the typecheck and full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no errors, all tests pass.

- [ ] **Step 4: Manually verify in the browser**

Start the dev server, navigate to `/automations`, confirm: the page loads, the list is empty (until the backend has automations), clicking "New automation" opens the form, the agent dropdown is populated from `minder-agent`'s `/agent-manifests` (via the reused `ListAgentManifestsController`).

- [ ] **Step 5: Commit**

```bash
git add "app/(workspace)/automations/page.tsx" app/_components/layout/workspace-navigation.ts
git commit -m "feat(automations): add /automations route and nav entry"
```
