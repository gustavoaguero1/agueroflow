import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import {
  enqueueOfflineMutation,
  reconcileServerSyncResult,
  type OfflineMutationItem,
} from '../services/offlineSyncQueue';

const STORAGE_PREFIX = 'agueroflow_offline_queue_v1_';

interface OfflineSyncContextValue {
  isOnline: boolean;
  syncing: boolean;
  items: OfflineMutationItem[];
  pendingCount: number;
  conflictCount: number;
  enqueue: (incoming: Omit<OfflineMutationItem, 'status' | 'attempts' | 'orgId' | 'createdAt' | 'id'> & { id?: string }) => void;
  dismissItem: (id: string) => void;
  clearSynced: () => void;
  markServerResult: (id: string, serverStatus: number, serverVersion?: string, errorMessage?: string) => void;
}

const OfflineSyncContext = createContext<OfflineSyncContextValue>({
  isOnline: true,
  syncing: false,
  items: [],
  pendingCount: 0,
  conflictCount: 0,
  enqueue: () => {},
  dismissItem: () => {},
  clearSynced: () => {},
  markServerResult: () => {},
});

function readQueue(orgId: string): OfflineMutationItem[] {
  if (!orgId || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${orgId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OfflineMutationItem[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(orgId: string, items: OfflineMutationItem[]) {
  if (!orgId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${orgId}`, JSON.stringify(items));
  } catch {
    // ignore quota errors
  }
}

export const OfflineSyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { organization } = useAuth();
  const orgId = organization?.id || '';
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine !== false : true,
  );
  const [syncing] = useState(false);
  const [items, setItems] = useState<OfflineMutationItem[]>([]);

  useEffect(() => {
    setItems(readQueue(orgId));
  }, [orgId]);

  useEffect(() => {
    if (orgId) writeQueue(orgId, items);
  }, [orgId, items]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const enqueue: OfflineSyncContextValue['enqueue'] = useCallback(
    (incoming) => {
      if (!orgId) return;
      const now = new Date().toISOString();
      setItems((prev) =>
        enqueueOfflineMutation(prev, {
          ...incoming,
          id: incoming.id || `off_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          orgId,
          createdAt: now,
        }),
      );
    },
    [orgId],
  );

  const dismissItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearSynced = useCallback(() => {
    setItems((prev) => prev.filter((item) => item.status !== 'sincronizado'));
  }, []);

  const markServerResult = useCallback(
    (id: string, serverStatus: number, serverVersion?: string, errorMessage?: string) => {
      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? reconcileServerSyncResult({ item, serverStatus, serverVersion, errorMessage })
            : item,
        ),
      );
    },
    [],
  );

  const value = useMemo<OfflineSyncContextValue>(() => {
    const pendingCount = items.filter((i) => i.status === 'pendente').length;
    const conflictCount = items.filter((i) => i.status === 'conflito').length;
    return {
      isOnline,
      syncing,
      items,
      pendingCount,
      conflictCount,
      enqueue,
      dismissItem,
      clearSynced,
      markServerResult,
    };
  }, [isOnline, syncing, items, enqueue, dismissItem, clearSynced, markServerResult]);

  return <OfflineSyncContext.Provider value={value}>{children}</OfflineSyncContext.Provider>;
};

export const useOfflineSync = () => useContext(OfflineSyncContext);
