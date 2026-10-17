'use client';

import { useEffect, useState } from 'react';

/**
 * Loads a stored video into an object URL for as long as the caller needs it.
 * The URL is tagged with the key it was made for, so a stale video is never
 * shown and nothing resets inside the effect.
 */
export function useGuideVideo(
  key: string,
  load: (key: string) => Promise<Blob | undefined>,
): string | undefined {
  const [loaded, setLoaded] = useState<{ readonly key: string; readonly url: string }>();
  useEffect(() => {
    let active = true;
    let url: string | undefined;
    void load(key).then(
      (blob) => {
        if (!active || blob === undefined) return;
        url = URL.createObjectURL(blob);
        setLoaded({ key, url });
      },
      () => undefined,
    );
    return () => {
      active = false;
      if (url !== undefined) URL.revokeObjectURL(url);
    };
    // `load` is a stable controller method; the key decides what to load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return loaded?.key === key ? loaded.url : undefined;
}
