'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@/app/_components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/app/_components/ui/sheet';

import { useNotebookEditor } from '../notebook/notebook-editor-context';

export interface ResponsiveEditorProps {
  readonly editorId: string;
  readonly ariaLabel: string;
  readonly title?: string;
  readonly description?: string;
  readonly trigger: ReactNode;
  readonly children: ReactNode;
  readonly onCancel?: () => void;
}

export function ResponsiveEditor({
  editorId,
  ariaLabel,
  title = ariaLabel,
  description,
  trigger,
  children,
  onCancel,
}: ResponsiveEditorProps) {
  const { open, setOpen } = useNotebookEditor(editorId);
  const narrow = useNarrowViewport();

  function changeOpen(nextOpen: boolean): void {
    setOpen(nextOpen);
    if (!nextOpen) onCancel?.();
  }

  if (narrow) {
    return (
      <Sheet open={open} onOpenChange={changeOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto" aria-label={ariaLabel}>
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            {description ? <SheetDescription>{description}</SheetDescription> : null}
          </SheetHeader>
          <div className="px-4 pb-4">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" aria-label={ariaLabel} className="w-90 p-0">
        {children}
      </PopoverContent>
    </Popover>
  );
}

function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)');
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return narrow;
}
