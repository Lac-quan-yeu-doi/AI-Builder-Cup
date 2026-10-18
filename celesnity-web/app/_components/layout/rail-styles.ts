/*
 * Item states on the dark rail, shared by the workspace and plant rails.
 * "You are here" is a tinted row with a blue bar on its leading edge;
 * everything else stays grey until hovered. Items need `relative` for the bar.
 */
export const RAIL_CURRENT =
  'bg-sidebar-selected font-[650] text-foreground before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-ring';
export const RAIL_IDLE =
  'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:bg-sidebar-accent focus-visible:text-foreground';
