import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
  CreateAutomationWorkflowRequestDto,
  UpdateAutomationWorkflowRequestDto,
  AddWorkflowStepRequestDto,
  UpdateWorkflowStepRequestDto,
} from '@presentation/automation-workflow/automation-workflow.dto';

describe('CreateAutomationWorkflowRequestDto triggerFields', () => {
  it('accepts a workflow with no triggerFields', async () => {
    const dto = plainToInstance(CreateAutomationWorkflowRequestDto, {
      name: 'Ingest to Slack',
      triggerType: 'EVENT',
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each(['text', 'number', 'date', 'datetime', 'boolean'])(
    'accepts the supported type %s',
    async (type) => {
      const dto = plainToInstance(CreateAutomationWorkflowRequestDto, {
        name: 'Ingest to Slack',
        triggerType: 'EVENT',
        triggerFields: [{ name: 'field', type }],
      });
      await expect(validate(dto)).resolves.toHaveLength(0);
    },
  );

  it('accepts optional label and required flags on a field', async () => {
    const dto = plainToInstance(CreateAutomationWorkflowRequestDto, {
      name: 'Ingest to Slack',
      triggerType: 'EVENT',
      triggerFields: [{ name: 'run_date', type: 'date', label: 'Run date', required: false }],
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects an unknown trigger field type', async () => {
    const dto = plainToInstance(CreateAutomationWorkflowRequestDto, {
      name: 'Ingest to Slack',
      triggerType: 'EVENT',
      triggerFields: [{ name: 'field', type: 'json' }],
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a trigger field with a non-string name', async () => {
    const dto = plainToInstance(CreateAutomationWorkflowRequestDto, {
      name: 'Ingest to Slack',
      triggerType: 'EVENT',
      triggerFields: [{ name: 42, type: 'text' }],
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('UpdateAutomationWorkflowRequestDto triggerFields', () => {
  it('accepts a valid triggerFields patch', async () => {
    const dto = plainToInstance(UpdateAutomationWorkflowRequestDto, {
      triggerFields: [{ name: 'amount', type: 'number', required: true }],
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects an unknown trigger field type in a patch', async () => {
    const dto = plainToInstance(UpdateAutomationWorkflowRequestDto, {
      triggerFields: [{ name: 'amount', type: 'currency' }],
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('workflow step DTOs systemPrompt', () => {
  it('AddWorkflowStepRequestDto accepts an optional systemPrompt', async () => {
    const dto = plainToInstance(AddWorkflowStepRequestDto, {
      agentId: 'schema-extractor',
      inputTemplate: { message: '$.trigger.bucket' },
      systemPrompt: 'You are a terse schema critic.',
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('AddWorkflowStepRequestDto is valid without a systemPrompt', async () => {
    const dto = plainToInstance(AddWorkflowStepRequestDto, {
      agentId: 'schema-extractor',
      inputTemplate: { message: '$.trigger.bucket' },
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('AddWorkflowStepRequestDto rejects a non-string systemPrompt', async () => {
    const dto = plainToInstance(AddWorkflowStepRequestDto, {
      agentId: 'schema-extractor',
      inputTemplate: { message: '$.trigger.bucket' },
      systemPrompt: 42,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('UpdateWorkflowStepRequestDto accepts an optional systemPrompt', async () => {
    const dto = plainToInstance(UpdateWorkflowStepRequestDto, {
      systemPrompt: 'You are a blunt editor.',
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('UpdateWorkflowStepRequestDto rejects a non-string systemPrompt', async () => {
    const dto = plainToInstance(UpdateWorkflowStepRequestDto, {
      systemPrompt: { not: 'a string' },
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
