/**
 * A still of what Walk-in Twin draws: two machines on an isometric floor with
 * a flow between them. Drawn in tokens, so it follows the skin.
 */
export function FloorSketch({ className }: { readonly className?: string }) {
  const box = (x: number, y: number, light: 'success' | 'warning') => (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 18 L34 0 L68 18 L34 36 Z" className="fill-card stroke-border" strokeWidth="1.5" />
      <path
        d="M0 18 L0 52 L34 70 L34 36 Z"
        className="fill-muted stroke-border"
        strokeWidth="1.5"
      />
      <path
        d="M68 18 L68 52 L34 70 L34 36 Z"
        className="fill-secondary stroke-border"
        strokeWidth="1.5"
      />
      <circle
        cx="54"
        cy="14"
        r="5"
        className={light === 'success' ? 'fill-status-success' : 'fill-status-warning'}
      />
    </g>
  );
  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-hidden>
      <defs>
        <pattern id="floor-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0 L0 0 0 20" className="fill-none stroke-border" strokeWidth="0.75" />
        </pattern>
      </defs>
      <rect width="200" height="200" fill="url(#floor-grid)" />
      <path d="M20 120 L100 76 L180 120 L100 164 Z" className="fill-background stroke-border" />
      {box(42, 66, 'success')}
      {box(100, 96, 'warning')}
      <path
        d="M76 70 Q 110 40 134 100"
        className="fill-none stroke-muted-foreground"
        strokeWidth="1.5"
        strokeDasharray="4 4"
      />
    </svg>
  );
}
