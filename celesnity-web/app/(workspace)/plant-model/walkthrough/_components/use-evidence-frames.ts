'use client';

import { useEffect, useState } from 'react';

const WIDTH = 320;

/**
 * Grabs a still at each timestamp from a local video, so every machine can show
 * the frame Gemini cited. Runs in the browser on a hidden <video>, one seek at
 * a time, so the server never has to decode video.
 */
export function useEvidenceFrames(
  videoUrl: string | undefined,
  times: readonly number[],
): ReadonlyMap<number, string> {
  const key = [...new Set(times)].sort((a, b) => a - b).join(',');
  const source = `${videoUrl ?? ''}|${key}`;
  // Frames are tagged with the video and times they came from, so a stale set
  // is never shown and nothing has to be reset when the input changes.
  const [captured, setCaptured] = useState<{
    readonly source: string;
    readonly frames: ReadonlyMap<number, string>;
  }>({ source: '', frames: EMPTY });
  const setFrames = (frames: ReadonlyMap<number, string>) => setCaptured({ source, frames });

  useEffect(() => {
    if (videoUrl === undefined || key === '') return;
    let cancelled = false;
    const wanted = key.split(',').map(Number);
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.playsInline = true;
    video.src = videoUrl;

    const canvas = document.createElement('canvas');
    const seek = (time: number) =>
      new Promise<void>((resolve, reject) => {
        const done = () => {
          video.removeEventListener('seeked', done);
          video.removeEventListener('error', fail);
          resolve();
        };
        const fail = () => reject(new Error('Video could not be read.'));
        video.addEventListener('seeked', done);
        video.addEventListener('error', fail);
        video.currentTime = Math.min(time, Math.max(0, video.duration - 0.05));
      });

    const run = async () => {
      await new Promise<void>((resolve, reject) => {
        if (video.readyState >= 1) return resolve();
        video.addEventListener('loadedmetadata', () => resolve(), { once: true });
        video.addEventListener('error', () => reject(new Error('Video could not be read.')), {
          once: true,
        });
      });
      canvas.width = WIDTH;
      canvas.height = Math.round((WIDTH * video.videoHeight) / Math.max(1, video.videoWidth));
      const context = canvas.getContext('2d');
      if (context === null) return;
      const next = new Map<number, string>();
      for (const time of wanted) {
        if (cancelled) return;
        await seek(time);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        next.set(time, canvas.toDataURL('image/jpeg', 0.75));
        setFrames(new Map(next));
      }
    };

    run().catch(() => {
      if (!cancelled) setFrames(new Map());
    });
    return () => {
      cancelled = true;
      video.removeAttribute('src');
      video.load();
    };
    // `setFrames` closes over `source`, which is derived from these two.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUrl, key]);

  return captured.source === source ? captured.frames : EMPTY;
}

const EMPTY: ReadonlyMap<number, string> = new Map();
