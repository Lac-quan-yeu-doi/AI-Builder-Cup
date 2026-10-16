interface LiveMonitor {
  close(): void;
}

export function releaseMonitor(monitor: LiveMonitor | null | undefined): null {
  monitor?.close();
  return null;
}
