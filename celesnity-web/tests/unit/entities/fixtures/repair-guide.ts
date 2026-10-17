import type { RepairGuide, RepairProcedure } from '@/src/entities/models/repair-guide';

export const BELT_PROCEDURE: RepairProcedure = {
  title: 'Thay dây đai máy giặt W1',
  faultSymptom: 'Dây đai trượt, kêu rít khi khởi động',
  summary: 'Thay dây đai mòn và căng lại. Máy chạy êm sau khi căng đúng.',
  prerequisites: [
    { text: 'Ngắt điện và khoá tủ điện (LOTO)', safety: true },
    { text: 'Chuẩn bị dây đai mới', safety: false },
  ],
  tools: ['Cờ lê 17', 'Đồng hồ đo lực căng'],
  parts: ['Dây đai B-52'],
  steps: [
    {
      title: 'Tháo nắp che',
      instruction: 'Tháo 4 vít và nhấc nắp che dây đai ra.',
      startSec: 4,
      endSec: 20,
      tools: ['Tua vít'],
      parameters: [],
      safetyCritical: true,
      safetyNote: 'Chỉ mở khi đã khoá tủ điện.',
      rationale: '',
      rationaleQuestion: '',
    },
    {
      title: 'Căng dây đai',
      instruction: 'Nới bu lông động cơ, kéo động cơ ra để căng dây, siết lại.',
      startSec: 20,
      endSec: 75,
      tools: ['Cờ lê 17'],
      parameters: [{ name: 'Lực siết', value: '45', unit: 'N·m', heard: 'siết khoảng bốn lăm' }],
      safetyCritical: false,
      safetyNote: '',
      rationale: '',
      rationaleQuestion: 'Vì sao anh gõ nhẹ vào puli trước khi siết?',
    },
  ],
  outcome: 'Chạy thử, không còn tiếng rít.',
  durationSec: 600,
  openQuestions: [],
};

export function guide(overrides: Partial<RepairGuide> = {}): RepairGuide {
  return {
    id: 'guide-1',
    siteId: 'site-1',
    machineId: 'washer-1',
    machineName: 'Washer W1',
    faultName: 'Belt slipping',
    expert: 'Anh Tuấn',
    status: 'draft',
    revision: 1,
    createdAt: '2026-10-17T01:00:00.000Z',
    updatedAt: '2026-10-17T01:00:00.000Z',
    model: 'gemini',
    videoName: 'belt.mp4',
    procedure: BELT_PROCEDURE,
    confirmations: {},
    answers: {},
    history: [{ revision: 1, at: '2026-10-17T01:00:00.000Z', note: 'Captured' }],
    runs: [],
    ...overrides,
  };
}
