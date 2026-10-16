export interface DailyMetadataCrawlerSchedule {
  readonly cadence: 'DAILY';
  readonly timeOfDay: string;
  readonly timezone: string;
}

export type MetadataCrawlerScheduleView =
  | (DailyMetadataCrawlerSchedule & { readonly editable: true })
  | {
      readonly cadence: 'CUSTOM';
      readonly expression: string;
      readonly timezone: string;
      readonly editable: false;
    };

export interface CompiledMetadataCrawlerSchedule {
  readonly expression: string;
  readonly timezone: string;
}

export interface IMetadataCrawlerSchedule {
  next(expression: string, timezone: string, after: Date): Date;
  compile(input: DailyMetadataCrawlerSchedule): CompiledMetadataCrawlerSchedule;
  describe(expression: string, timezone: string): MetadataCrawlerScheduleView;
}
