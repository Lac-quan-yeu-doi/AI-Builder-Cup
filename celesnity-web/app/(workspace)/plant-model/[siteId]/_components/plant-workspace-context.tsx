'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { getInjection } from '@/di/container';
import type { PlantSite } from '@/src/entities/models/plant-model';

const plantModel = getInjection('PlantModelController');

interface PlantWorkspaceState {
  readonly site?: PlantSite;
  readonly dirty: boolean;
  readonly refresh: () => Promise<void>;
  readonly selectedNodeId?: string;
  readonly selectedRelationshipId?: string;
  readonly selectedDashboardId?: string;
  readonly setSite: (site: PlantSite) => void;
  readonly setDirty: (dirty: boolean) => void;
  readonly selectNode: (id?: string) => void;
  readonly selectRelationship: (id?: string) => void;
  readonly selectDashboard: (id?: string) => void;
}

const PlantWorkspaceContext = createContext<PlantWorkspaceState | null>(null);

export function PlantWorkspaceProvider({
  siteId,
  children,
}: {
  readonly siteId: string;
  readonly children: React.ReactNode;
}) {
  const [site, setSite] = useState<PlantSite>();
  const [dirty, setDirty] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [selectedRelationshipId, setSelectedRelationshipId] = useState<string>();
  const [selectedDashboardId, setSelectedDashboardId] = useState<string>();
  const refresh = useCallback(async () => {
    const value = await plantModel.get(siteId);
    setSite(value);
    setDirty(false);
  }, [siteId]);
  const selectNode = useCallback((id?: string) => {
    setSelectedNodeId(id);
    if (id) setSelectedRelationshipId(undefined);
  }, []);
  const selectRelationship = useCallback((id?: string) => {
    setSelectedRelationshipId(id);
    if (id) setSelectedNodeId(undefined);
  }, []);

  useEffect(() => {
    let active = true;
    void plantModel.get(siteId).then(
      (value) => {
        if (active) setSite(value);
      },
      () => {
        if (active) setSite(undefined);
      },
    );
    return () => {
      active = false;
    };
  }, [siteId]);

  const value = useMemo<PlantWorkspaceState>(
    () => ({
      site,
      dirty,
      refresh,
      selectedNodeId,
      selectedRelationshipId,
      selectedDashboardId,
      setSite,
      setDirty,
      selectNode,
      selectRelationship,
      selectDashboard: setSelectedDashboardId,
    }),
    [
      selectNode,
      selectRelationship,
      refresh,
      dirty,
      selectedDashboardId,
      selectedNodeId,
      selectedRelationshipId,
      site,
    ],
  );

  return <PlantWorkspaceContext.Provider value={value}>{children}</PlantWorkspaceContext.Provider>;
}

export function usePlantWorkspace(): PlantWorkspaceState {
  const value = useContext(PlantWorkspaceContext);
  if (!value) throw new Error('Plant workspace context is unavailable.');
  return value;
}
