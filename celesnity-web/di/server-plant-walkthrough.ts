// Server-only Gemini work, for route handlers (which may not import
// infrastructure directly).
export { GeminiAnswerError, isGeminiConfigured } from '@/src/infrastructure/services/gemini-client';
export { extractPlantWalkthrough } from '@/src/infrastructure/services/gemini-plant-walkthrough.extractor';
export {
  answerRepairQuestion,
  captureRepair,
  compareRepairs,
  verifyRepairStep,
} from '@/src/infrastructure/services/gemini-repair-capture';
