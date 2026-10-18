import * as THREE from 'three';

import type { EquipmentKind, VisibleState } from '@/src/entities/models/plant-walkthrough';

/*
 * The twin's colours come from the design tokens in app/globals.css, read at
 * runtime, so the 3D view follows the same palette as the rest of the
 * workspace. Kinds take the categorical chart scale; states take the status
 * scales; selection is the focus blue.
 */
export interface TwinPalette {
  readonly area: THREE.Color;
  readonly line: THREE.Color;
  readonly body: Readonly<Record<EquipmentKind, THREE.Color>>;
  readonly trim: THREE.Color;
  readonly glow: THREE.Color;
  readonly state: Readonly<Record<VisibleState, THREE.Color>>;
  readonly flow: THREE.Color;
  readonly selected: THREE.Color;
  readonly hover: THREE.Color;
}

const FALLBACK = 'grey';

export function readTwinPalette(): TwinPalette {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => new THREE.Color(style.getPropertyValue(name).trim() || FALLBACK);
  const soft = (name: string, amount: number) => token(name).lerp(token('--background'), amount);
  return {
    area: soft('--muted', 0.1),
    line: token('--border').lerp(token('--muted'), 0.5),
    body: {
      machine: soft('--mchart-1', 0.72),
      conveyor: soft('--muted-foreground', 0.35),
      station: soft('--mchart-3', 0.55),
      storage: soft('--mchart-2', 0.62),
      inspection: soft('--mchart-4', 0.7),
      utility: soft('--mchart-5', 0.62),
    },
    trim: soft('--foreground', 0.45),
    glow: soft('--status-warning-light', 0.2),
    state: {
      running: token('--status-success'),
      idle: token('--status-warning'),
      stopped: token('--destructive'),
      unknown: token('--muted-foreground'),
    },
    flow: soft('--foreground', 0.3),
    selected: token('--ring'),
    hover: soft('--ring', 0.45),
  };
}
