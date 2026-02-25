export type ProviderId = 'yandex';

export type ProviderCheckResult = { ok: true } | { ok: false; message: string };

export interface CloudProvider {
  id: ProviderId;
  name: string;
  checkConnection(token: string): Promise<ProviderCheckResult>;
}
