import { PlayIcon } from 'lucide-react';

import { Button } from '@/app/_components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/_components/ui/tooltip';

/**
 * Runs the query as far as this step and shows the rows. A bare glyph on the
 * page read as "play a video"; the outline gives it the edges of a control and
 * the tooltip says what it will do before you press it.
 */
export function NotebookPreviewButton({
  label,
  onClick,
  disabled = false,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-9 text-muted-foreground hover:text-foreground"
          aria-label={`Preview ${label}`}
          disabled={disabled}
          onClick={onClick}
        >
          <PlayIcon aria-hidden="true" className="size-3.5 fill-current" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Preview {label}</TooltipContent>
    </Tooltip>
  );
}
