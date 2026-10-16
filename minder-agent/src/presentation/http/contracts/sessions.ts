export interface SessionTranscriptDto {
  readonly session_id: string;
  readonly messages: readonly unknown[];
}
