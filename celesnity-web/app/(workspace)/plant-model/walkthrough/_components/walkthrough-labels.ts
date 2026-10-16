import type { BadgeVariant } from '@/app/_components/ui/badge';
import type { TranslationKey } from '@/app/_i18n/en';
import type { EquipmentKind, VisibleState } from '@/src/entities/models/plant-walkthrough';

export const STATE_LABEL: Record<VisibleState, TranslationKey> = {
  running: 'plantWalkthrough.state.running',
  idle: 'plantWalkthrough.state.idle',
  stopped: 'plantWalkthrough.state.stopped',
  unknown: 'plantWalkthrough.state.unknown',
};

export const STATE_TONE: Record<VisibleState, BadgeVariant> = {
  running: 'success',
  idle: 'warning',
  stopped: 'danger',
  unknown: 'outline',
};

/** The legend's dots, in the same status scales the twin's lights read. */
export const STATE_DOT: Record<VisibleState, string> = {
  running: 'bg-status-success',
  idle: 'bg-status-warning',
  stopped: 'bg-destructive',
  unknown: 'bg-muted-foreground',
};

export const KIND_LABEL: Record<EquipmentKind, TranslationKey> = {
  machine: 'plantWalkthrough.kind.machine',
  conveyor: 'plantWalkthrough.kind.conveyor',
  station: 'plantWalkthrough.kind.station',
  storage: 'plantWalkthrough.kind.storage',
  inspection: 'plantWalkthrough.kind.inspection',
  utility: 'plantWalkthrough.kind.utility',
};
