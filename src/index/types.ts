export const LOCAL_INDEX_SCHEMA_VERSION = 2;

export interface IndexEntry {
  path: string;
  hash: string;
  size: number;
  mtime: number;
}

export interface LocalIndex {
  schemaVersion: number;
  vaultId: string;
  createdAt: number;
  updatedAt: number;
  files: Record<string, IndexEntry>;
}
