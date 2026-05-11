import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import exportService from "../services/exportService.js";

function normalizeInitial(initialHistory) {
  if (!Array.isArray(initialHistory)) return [];
  return initialHistory.filter(
    (record) => record && typeof record === "object" && record.packageId,
  );
}

function resolveProjectIdFromSheet(sheet) {
  if (!sheet) return null;
  try {
    const payload = exportService.buildArtifactPackagePayload(sheet);
    return payload?.projectId || null;
  } catch (_err) {
    return null;
  }
}

export function useArtifactPackageHistory({
  projectId,
  userId,
  sheet,
  initialHistory,
  refreshSignal = 0,
} = {}) {
  const initialSeed = useMemo(
    () => normalizeInitial(initialHistory),
    [initialHistory],
  );
  const [history, setHistory] = useState(initialSeed);
  const [storageProvider, setStorageProvider] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const resolvedProjectId =
    projectId || resolveProjectIdFromSheet(sheet) || null;

  const load = useCallback(async () => {
    if (!resolvedProjectId) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    if (mountedRef.current) {
      setIsLoading(true);
      setError(null);
    }
    try {
      const response = await exportService.listDeliverablesPackageHistory({
        projectId: resolvedProjectId,
        userId,
        sheet,
      });
      if (!mountedRef.current) return;
      const records = Array.isArray(response?.history) ? response.history : [];
      setHistory(records);
      setStorageProvider(response?.storageProvider || null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setIsLoading(false);
    }
  }, [resolvedProjectId, userId, sheet]);

  useEffect(() => {
    if (!resolvedProjectId) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedProjectId, refreshSignal]);

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  return {
    history,
    storageProvider,
    isLoading,
    error,
    refresh,
    resolvedProjectId,
  };
}

export default useArtifactPackageHistory;
