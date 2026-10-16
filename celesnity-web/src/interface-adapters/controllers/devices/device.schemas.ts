import { z } from 'zod';

export const deviceIdSchema = z.string().uuid();
export const createFirmwareCampaignInputSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    releaseId: z.string().uuid(),
    deviceIds: z.array(deviceIdSchema).min(1).max(500),
    canarySize: z.number().int().min(1).max(500),
    batchSize: z.number().int().min(1).max(100),
  })
  .refine((value) => value.canarySize <= new Set(value.deviceIds).size, {
    message: 'Canary size cannot exceed the unique target count.',
    path: ['canarySize'],
  });
export const transitionFirmwareCampaignInputSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['start', 'advance', 'pause', 'resume', 'abort']),
});
export const adapterIdSchema = z.string().uuid();
export const registerDeviceInputSchema = z.object({
  adapterId: adapterIdSchema,
  externalDeviceId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u),
  deviceType: z.enum(['GATEWAY', 'SENSOR']),
  name: z.string().trim().min(1).max(160),
  model: z.string().trim().min(1).max(120),
  hardwareRevision: z.string().trim().min(1).max(80).optional(),
  currentFirmwareVersion: z.string().trim().min(1).max(120).optional(),
  deploymentSite: z.string().trim().min(1).max(160).optional(),
  physicalLocation: z.string().trim().min(1).max(255).optional(),
  gatewayId: deviceIdSchema.optional(),
  measurementPointKey: z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u)
    .optional(),
  measurementPointName: z.string().trim().min(1).max(160).optional(),
});

export const transitionDeviceLifecycleInputSchema = z.object({
  id: deviceIdSchema,
  state: z.enum(['PROVISIONED', 'COMMISSIONED', 'DECOMMISSIONED']),
  reason: z.string().trim().min(1).max(500).optional(),
});

export const replaceDeviceInputSchema = z.object({
  id: deviceIdSchema,
  externalDeviceId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u),
  name: z.string().trim().min(1).max(160),
  model: z.string().trim().min(1).max(120),
  hardwareRevision: z.string().trim().min(1).max(80).optional(),
  currentFirmwareVersion: z.string().trim().min(1).max(120).optional(),
  reason: z.string().trim().min(1).max(500).optional(),
});

export const createFirmwareReleaseInputSchema = z.object({
  version: z.string().trim().min(1).max(120),
  deviceModel: z.string().trim().min(1).max(120),
  hardwareRevision: z.string().trim().min(1).max(80).optional(),
  file: z
    .instanceof(File)
    .refine((file) => file.size > 0 && file.size <= 64 * 1024 * 1024)
    .refine((file) => /\.(bin|hex|uf2|img)$/iu.test(file.name)),
  releaseNotes: z.string().trim().min(1).max(2000).optional(),
});

export const startFirmwareDeploymentInputSchema = z.object({
  deviceId: deviceIdSchema,
  releaseId: z.string().uuid(),
});

const configurationKeySchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u);
const configurationParametersSchema = z.object({
  samplingRateHz: z.number().min(0.001).max(100_000).optional(),
  reportingIntervalSeconds: z.number().int().min(1).max(86_400).optional(),
  channels: z.record(configurationKeySchema, z.boolean()).optional(),
  gatewayUplinkMode: z.enum(['MQTT', 'BULK_HTTP']).optional(),
  diagnosticLogging: z
    .array(
      z.enum(['CPU_LOAD', 'CPU_TEMPERATURE', 'MEMORY', 'BATTERY_PERCENT', 'RSSI_SNR', 'UPTIME']),
    )
    .optional(),
  logLevel: z.enum(['ERROR', 'WARNING', 'INFO', 'DEBUG']).optional(),
  alertThresholds: z.record(configurationKeySchema, z.number().finite()).optional(),
});

export const pushDeviceConfigurationInputSchema = z
  .object({
    deviceId: deviceIdSchema,
    parameters: configurationParametersSchema.optional(),
    restoreFactoryDefaults: z.boolean().optional(),
  })
  .refine(
    (input) =>
      input.restoreFactoryDefaults === true ||
      (input.parameters !== undefined && Object.keys(input.parameters).length > 0),
    'At least one configuration parameter is required',
  );

export const createDeviceConfigurationTemplateInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  parameters: configurationParametersSchema.refine(
    (parameters) => Object.keys(parameters).length > 0,
    'At least one configuration parameter is required',
  ),
});

export const deployDeviceConfigurationTemplateInputSchema = z
  .object({
    templateId: deviceIdSchema,
    deploymentSite: z.string().trim().min(1).max(160).optional(),
    deviceType: z.enum(['GATEWAY', 'SENSOR']).optional(),
  })
  .refine((input) => input.deploymentSite !== undefined || input.deviceType !== undefined, {
    message: 'A deployment site or device type target is required',
  });
