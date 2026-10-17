'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

export interface StepClipHandle {
  replay(): void;
}

/**
 * Plays one slice of the expert's video, from the second a step starts to the
 * second it ends, then loops back. The expert's own voice stays on: hearing
 * how they describe the step is part of the know-how.
 */
export const StepClip = forwardRef<
  StepClipHandle,
  {
    readonly src?: string;
    readonly startSec: number;
    readonly endSec: number;
    readonly label: string;
  }
>(function StepClip({ src, startSec, endSec, label }, ref) {
  const video = useRef<HTMLVideoElement>(null);
  const end = Math.max(endSec, startSec + 1);

  const replay = () => {
    const element = video.current;
    if (element === null) return;
    element.currentTime = startSec;
    void element.play().catch(() => undefined);
  };
  useImperativeHandle(ref, () => ({ replay }));

  useEffect(() => {
    const element = video.current;
    if (element === null || src === undefined) return;
    element.currentTime = startSec;
  }, [src, startSec]);

  if (src === undefined) {
    return <div className="aspect-video w-full rounded-xl bg-muted" aria-hidden />;
  }
  return (
    <video
      ref={video}
      src={src}
      controls
      playsInline
      aria-label={label}
      className="aspect-video w-full rounded-xl bg-foreground object-contain"
      onTimeUpdate={(event) => {
        const element = event.currentTarget;
        if (element.currentTime >= end) {
          element.currentTime = startSec;
        }
      }}
    />
  );
});
