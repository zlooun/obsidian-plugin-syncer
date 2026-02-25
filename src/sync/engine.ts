import type { LocalIndex } from '../index/types';
import type { PendingSync, SyncOperation } from './types';

function nextOperationId(index: number): string {
  return `op-${index + 1}`;
}

export function buildPushPlan(baseline: LocalIndex | null, current: LocalIndex): SyncOperation[] {
  const operations: SyncOperation[] = [];
  const baselineFiles = baseline?.files ?? {};
  const currentFiles = current.files;

  Object.values(currentFiles).forEach((entry) => {
    const prev = baselineFiles[entry.path];

    if (!prev || prev.hash !== entry.hash) {
      operations.push({
        id: nextOperationId(operations.length),
        type: 'upload',
        path: entry.path,
        hash: entry.hash,
        status: 'pending',
      });
    }
  });

  Object.values(baselineFiles).forEach((entry) => {
    if (!currentFiles[entry.path]) {
      operations.push({
        id: nextOperationId(operations.length),
        type: 'delete',
        path: entry.path,
        status: 'pending',
      });
    }
  });

  return operations;
}

export function createPendingSync(operations: SyncOperation[]): PendingSync {
  const timestamp = Date.now();

  return {
    syncId: `sync-${timestamp}`,
    startedAt: timestamp,
    operations,
    done: 0,
    total: operations.length,
  };
}

export function countDoneOperations(operations: SyncOperation[]): number {
  return operations.filter((operation) => operation.status === 'done').length;
}
