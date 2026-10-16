// Server-only plant walkthrough extraction, for route handlers (which may not
// import infrastructure directly).
export {
  extractPlantWalkthrough,
  isGeminiConfigured,
  WalkthroughExtractionError,
} from '@/src/infrastructure/services/gemini-plant-walkthrough.extractor';
