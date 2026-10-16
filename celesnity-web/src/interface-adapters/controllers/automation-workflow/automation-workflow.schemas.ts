import { z } from 'zod';

export const automationWorkflowIdSchema = z.string();

const triggerFieldSchema = z.object({
  name: z.string(),
  type: z.enum(['text', 'number', 'date', 'datetime', 'boolean']),
  label: z.string().optional(),
  required: z.boolean().optional(),
});

export const createAutomationWorkflowInputSchema = z.object({
  name: z.string(),
  triggerType: z.enum(['EVENT', 'SCHEDULE']),
  eventTopic: z.string().optional(),
  scheduleCron: z.string().optional(),
  scheduleTimezone: z.string().optional(),
  triggerFields: z.array(triggerFieldSchema).optional(),
});

export const updateAutomationWorkflowInputSchema = z.object({
  name: z.string().optional(),
  enabled: z.boolean().optional(),
  triggerFields: z.array(triggerFieldSchema).optional(),
});

export const addWorkflowStepInputSchema = z.object({
  agentId: z.string(),
  inputTemplate: z.record(z.string(), z.string()),
  systemPrompt: z.string().optional(),
});

export const updateWorkflowStepInputSchema = z.object({
  agentId: z.string().optional(),
  inputTemplate: z.record(z.string(), z.string()).optional(),
  systemPrompt: z.string().optional(),
});

export const testFireWorkflowInputSchema = z.object({
  payload: z.record(z.string(), z.unknown()),
  forceFailAtStep: z.number().int().min(1).optional(),
});

export const retryWorkflowRunInputSchema = z.object({
  resumeFromStep: z.number().int().min(1),
});
