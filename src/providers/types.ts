export type ProviderId = 'yandex';

export type ProviderCheckResult = { ok: true } | { ok: false; message: string };
export type ProviderActionResult = { ok: true } | { ok: false; message: string };

export interface CloudProvider {
  id: ProviderId;
  name: string;
  checkConnection(token: string): Promise<ProviderCheckResult>;
  hasSyncState(token: string): Promise<boolean>;
  uploadSyncState(token: string, serializedState: string): Promise<ProviderActionResult>;
  uploadFile(token: string, remotePath: string, body: ArrayBuffer): Promise<ProviderActionResult>;
  deleteFile(token: string, remotePath: string): Promise<ProviderActionResult>;
}
