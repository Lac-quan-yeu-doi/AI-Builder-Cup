'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { TableRef } from '@/src/entities/models/catalog';
import type { TableMetadataViewModel } from '@/src/interface-adapters/presenters/catalog.presenter';

import type {
  DataSourceBrowserControllers,
  DataSourceBrowserResult,
  DataSourceBrowserState,
} from './data-source-picker.types';

const initialState: DataSourceBrowserState = {
  catalogs: [],
  namespaces: [],
  tables: [],
  metadata: null,
  loading: null,
  error: null,
};

type RequestKind = 'CATALOGS' | 'NAMESPACES' | 'TABLES' | 'METADATA';

/**
 * Loads the catalog tree behind the chart builder. Each operation has its own
 * sequence number so a response for an abandoned branch cannot overwrite the
 * branch currently selected by the user.
 */
export function useDataSourceBrowser({
  controllers,
  catalogLock,
}: {
  readonly controllers: DataSourceBrowserControllers;
  readonly catalogLock?: string;
}): DataSourceBrowserResult {
  const [state, setState] = useState<DataSourceBrowserState>(initialState);
  const sequences = useRef<Record<RequestKind, number>>({
    CATALOGS: 0,
    NAMESPACES: 0,
    TABLES: 0,
    METADATA: 0,
  });

  const begin = useCallback((kind: RequestKind): number => {
    sequences.current[kind] += 1;
    return sequences.current[kind];
  }, []);

  const isCurrent = useCallback(
    (kind: RequestKind, sequence: number): boolean => sequences.current[kind] === sequence,
    [],
  );

  const loadCatalogs = useCallback(async (): Promise<void> => {
    const sequence = begin('CATALOGS');
    setState((current) => ({ ...current, loading: 'CATALOGS', error: null }));
    try {
      const catalogs = (await controllers.listCatalogs()).filter(
        (catalog) => !catalogLock || catalog.name === catalogLock,
      );
      if (!isCurrent('CATALOGS', sequence)) return;
      setState((current) => ({ ...current, catalogs, loading: null, error: null }));
    } catch {
      if (!isCurrent('CATALOGS', sequence)) return;
      setState((current) => ({
        ...current,
        catalogs: [],
        loading: null,
        error: 'Catalogs unavailable.',
      }));
    }
  }, [begin, catalogLock, controllers, isCurrent]);

  const loadNamespaces = useCallback(
    async (catalog: string): Promise<void> => {
      const sequence = begin('NAMESPACES');
      setState((current) => ({
        ...current,
        namespaces: [],
        tables: [],
        metadata: null,
        loading: 'NAMESPACES',
        error: null,
      }));
      try {
        const namespaces = await controllers.listNamespaces(catalog);
        if (!isCurrent('NAMESPACES', sequence)) return;
        setState((current) => ({ ...current, namespaces, loading: null, error: null }));
      } catch {
        if (!isCurrent('NAMESPACES', sequence)) return;
        setState((current) => ({
          ...current,
          namespaces: [],
          loading: null,
          error: 'Schemas unavailable.',
        }));
      }
    },
    [begin, controllers, isCurrent],
  );

  const loadTables = useCallback(
    async (catalog: string, schema: string): Promise<void> => {
      const sequence = begin('TABLES');
      setState((current) => ({
        ...current,
        tables: [],
        metadata: null,
        loading: 'TABLES',
        error: null,
      }));
      try {
        const tables = await controllers.listTables(catalog, schema);
        if (!isCurrent('TABLES', sequence)) return;
        setState((current) => ({ ...current, tables, loading: null, error: null }));
      } catch {
        if (!isCurrent('TABLES', sequence)) return;
        setState((current) => ({
          ...current,
          tables: [],
          loading: null,
          error: 'Tables unavailable.',
        }));
      }
    },
    [begin, controllers, isCurrent],
  );

  const loadTableMetadata = useCallback(
    async (ref: TableRef): Promise<TableMetadataViewModel | null> => {
      const sequence = begin('METADATA');
      setState((current) => ({ ...current, metadata: null, loading: 'METADATA', error: null }));
      try {
        const metadata = await controllers.loadTableMetadata(ref);
        if (!isCurrent('METADATA', sequence)) return null;
        setState((current) => ({ ...current, metadata, loading: null, error: null }));
        return metadata;
      } catch {
        if (!isCurrent('METADATA', sequence)) return null;
        setState((current) => ({
          ...current,
          metadata: null,
          loading: null,
          error: 'Table metadata unavailable.',
        }));
        return null;
      }
    },
    [begin, controllers, isCurrent],
  );

  useEffect(() => {
    let cancelled = false;
    const sequence = begin('CATALOGS');
    void controllers
      .listCatalogs()
      .then((catalogs) => {
        const visibleCatalogs = catalogs.filter(
          (catalog) => !catalogLock || catalog.name === catalogLock,
        );
        if (cancelled || !isCurrent('CATALOGS', sequence)) return;
        setState((current) => ({
          ...current,
          catalogs: visibleCatalogs,
          loading: null,
          error: null,
        }));
      })
      .catch(() => {
        if (cancelled || !isCurrent('CATALOGS', sequence)) return;
        setState((current) => ({
          ...current,
          catalogs: [],
          loading: null,
          error: 'Catalogs unavailable.',
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [begin, catalogLock, controllers, isCurrent]);

  return { ...state, loadCatalogs, loadNamespaces, loadTables, loadTableMetadata };
}
