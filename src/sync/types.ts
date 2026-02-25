import type { LocalIndex } from '../index/types';

export const SYNC_DATA_SCHEMA_VERSION = 1;

export type SyncOperationType = 'upload' | 'delete';
export type SyncOperationStatus = 'pending' | 'done' | 'failed';

export interface SyncOperation {
  id: string;
  type: SyncOperationType;
  path: string;
  hash?: string;
  status: SyncOperationStatus;
  error?: string;
}

export interface PendingSync {
  syncId: string;
  startedAt: number;
  operations: SyncOperation[];
  done: number;
  total: number;
}

export interface SyncPluginData {
  schemaVersion: number;
  settings: unknown;
  localIndex: LocalIndex | null;
  pendingSync: PendingSync | null;
  lastSuccessfulSyncAt: number | null;
}
