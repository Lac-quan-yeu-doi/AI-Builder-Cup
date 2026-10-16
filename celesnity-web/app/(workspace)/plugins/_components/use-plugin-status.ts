'use client';

import { useCallback, useEffect, useState } from 'react';

export interface PluginStatus {
  readonly status: 'connected' | 'needs_sign_in' | 'not_connected';
  readonly email?: string;
}

export function usePluginStatus(statusEndpoint: string) {
  const [data, setData] = useState<PluginStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(statusEndpoint);
      if (res.ok) {
        setData(await res.json());
      } else {
        setData({ status: 'not_connected' });
      }
    } catch {
      setData({ status: 'not_connected' });
    } finally {
      setLoading(false);
    }
  }, [statusEndpoint]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, refresh } as const;
}
