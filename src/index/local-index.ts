import { FileSystemAdapter, TFile, type Vault } from 'obsidian';
import { LOCAL_INDEX_SCHEMA_VERSION, type IndexEntry, type LocalIndex } from './types';

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';

  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }

  return hex;
}

async function sha256Bytes(data: Uint8Array | ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);

  return bufferToHex(digest);
}

async function readFileBytes(vault: Vault, file: TFile): Promise<Uint8Array> {
  if (file.extension === 'md') {
    const text = await vault.cachedRead(file);

    return new TextEncoder().encode(text);
  }

  const binary = await vault.readBinary(file);

  return new Uint8Array(binary);
}

function getVaultIdentity(vault: Vault): string {
  const adapter = vault.adapter;

  if (adapter instanceof FileSystemAdapter) {
    return `${vault.getName()}::${adapter.getBasePath()}`;
  }

  return vault.getName();
}

export async function getVaultId(vault: Vault): Promise<string> {
  const identity = getVaultIdentity(vault);

  return sha256Bytes(new TextEncoder().encode(identity));
}

export async function buildLocalIndex(vault: Vault): Promise<LocalIndex> {
  const indexFiles: Record<string, IndexEntry> = {};
  const adapter = vault.adapter;

  if (adapter instanceof FileSystemAdapter) {
    const pendingFolders = [''];

    while (pendingFolders.length > 0) {
      const folder = pendingFolders.pop() ?? '';
      const listed = await adapter.list(folder);

      for (const childFolder of listed.folders) {
        pendingFolders.push(childFolder);
      }

      for (const filePath of listed.files) {
        try {
          const [rawData, stat] = await Promise.all([
            adapter.readBinary(filePath),
            adapter.stat(filePath),
          ]);

          if (!stat) {
            continue;
          }

          indexFiles[filePath] = {
            path: filePath,
            hash: await sha256Bytes(new Uint8Array(rawData)),
            size: stat.size,
            mtime: stat.mtime,
          };
        } catch {
          // Some files can be transient/unreadable during scan, skip and continue.
          continue;
        }
      }
    }
  } else {
    const files = vault.getFiles();

    for (const file of files) {
      const bytes = await readFileBytes(vault, file);
      indexFiles[file.path] = {
        path: file.path,
        hash: await sha256Bytes(bytes),
        size: file.stat.size,
        mtime: file.stat.mtime,
      };
    }
  }

  const timestamp = Date.now();

  return {
    schemaVersion: LOCAL_INDEX_SCHEMA_VERSION,
    vaultId: await getVaultId(vault),
    createdAt: timestamp,
    updatedAt: timestamp,
    files: indexFiles,
  };
}
