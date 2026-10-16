export interface GenerationRecorder {
  recordGeneration(name: string): Promise<void>;
}
