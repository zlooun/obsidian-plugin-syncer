import { requestUrl } from 'obsidian';
import type { CloudProvider, ProviderActionResult, ProviderCheckResult } from './types';

const API_ROOT = 'https://cloud-api.yandex.net/v1/disk';
const VAULT_ROOT = 'app:/SyncerVault';
const SYNC_STATE_PATH = '.syncer/state.json';

export class YandexDiskProvider implements CloudProvider {
  id = 'yandex' as const;
  name = 'Yandex Disk';

  async checkConnection(token: string): Promise<ProviderCheckResult> {
    if (!token || token.trim().length === 0) {
      return { ok: false, message: 'Missing OAuth token' };
    }

    const url = new URL(API_ROOT + '/resources');
    url.searchParams.set('path', 'app:/');
    url.searchParams.set('fields', 'name');

    try {
      const response = await requestUrl({
        url: url.toString(),
        method: 'GET',
        headers: {
          Authorization: `OAuth ${token}`,
        },
      });

      if (response.status >= 200 && response.status < 300) {
        return { ok: true };
      }

      return { ok: false, message: `HTTP ${response.status}` };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request failed';

      return { ok: false, message };
    }
  }

  async hasSyncState(token: string): Promise<boolean> {
    try {
      const stateUrl = new URL(`${API_ROOT}/resources`);
      stateUrl.searchParams.set('path', this.buildRemoteFilePath(SYNC_STATE_PATH));
      stateUrl.searchParams.set('fields', 'name');

      const response = await requestUrl({
        url: stateUrl.toString(),
        method: 'GET',
        headers: {
          Authorization: `OAuth ${token}`,
        },
        throw: false,
      });

      return response.status >= 200 && response.status < 300;
    } catch {
      return false;
    }
  }

  async uploadSyncState(token: string, serializedState: string): Promise<ProviderActionResult> {
    const data = new TextEncoder().encode(serializedState);
    const body = data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    ) as ArrayBuffer;
    return this.uploadFile(token, SYNC_STATE_PATH, body);
  }

  async uploadFile(
    token: string,
    remotePath: string,
    body: ArrayBuffer,
  ): Promise<ProviderActionResult> {
    const fullPath = this.buildRemoteFilePath(remotePath);
    const parentPath = fullPath.split('/').slice(0, -1).join('/');
    const ensured = await this.ensureFolderPath(token, parentPath);

    if (!ensured.ok) {
      return ensured;
    }

    try {
      const uploadUrl = new URL(`${API_ROOT}/resources/upload`);
      uploadUrl.searchParams.set('path', fullPath);
      uploadUrl.searchParams.set('overwrite', 'true');

      const uploadMeta = await requestUrl({
        url: uploadUrl.toString(),
        method: 'GET',
        headers: {
          Authorization: `OAuth ${token}`,
        },
        throw: false,
      });

      if (uploadMeta.status < 200 || uploadMeta.status >= 300) {
        return { ok: false, message: `Upload URL error: HTTP ${uploadMeta.status}` };
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const href = uploadMeta.json?.href as string | undefined;

      if (!href) {
        return { ok: false, message: 'Upload URL missing in provider response' };
      }

      const uploadResult = await requestUrl({
        url: href,
        method: 'PUT',
        body,
        contentType: 'application/octet-stream',
        throw: false,
      });

      if (uploadResult.status >= 200 && uploadResult.status < 300) {
        return { ok: true };
      }

      return { ok: false, message: `Upload failed: HTTP ${uploadResult.status}` };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';

      return { ok: false, message };
    }
  }

  async deleteFile(token: string, remotePath: string): Promise<ProviderActionResult> {
    const fullPath = this.buildRemoteFilePath(remotePath);

    try {
      const deleteUrl = new URL(`${API_ROOT}/resources`);
      deleteUrl.searchParams.set('path', fullPath);
      deleteUrl.searchParams.set('permanently', 'true');

      const response = await requestUrl({
        url: deleteUrl.toString(),
        method: 'DELETE',
        headers: {
          Authorization: `OAuth ${token}`,
        },
        throw: false,
      });

      if (response.status === 404) {
        return { ok: true };
      }

      if (response.status >= 200 && response.status < 300) {
        return { ok: true };
      }

      return { ok: false, message: `Delete failed: HTTP ${response.status}` };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Delete failed';

      return { ok: false, message };
    }
  }

  private buildRemoteFilePath(pathInVault: string): string {
    return `${VAULT_ROOT}/${pathInVault}`;
  }

  private async ensureFolderPath(
    token: string,
    fullFolderPath: string,
  ): Promise<ProviderActionResult> {
    if (!fullFolderPath || fullFolderPath === 'app:') {
      return { ok: true };
    }

    const segments = fullFolderPath.split('/').filter(Boolean);
    let current = '';

    for (const segment of segments) {
      if (segment === 'app:') {
        current = 'app:';
        continue;
      }

      current = current ? `${current}/${segment}` : segment;
      const createFolderResult = await this.createFolder(token, current);

      if (!createFolderResult.ok) {
        return createFolderResult;
      }
    }

    return { ok: true };
  }

  private async createFolder(token: string, fullFolderPath: string): Promise<ProviderActionResult> {
    try {
      const mkdirUrl = new URL(`${API_ROOT}/resources`);
      mkdirUrl.searchParams.set('path', fullFolderPath);

      const response = await requestUrl({
        url: mkdirUrl.toString(),
        method: 'PUT',
        headers: {
          Authorization: `OAuth ${token}`,
        },
        throw: false,
      });

      if (response.status === 201 || response.status === 409) {
        return { ok: true };
      }

      return { ok: false, message: `Create folder failed: HTTP ${response.status}` };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Create folder failed';

      return { ok: false, message };
    }
  }
}
