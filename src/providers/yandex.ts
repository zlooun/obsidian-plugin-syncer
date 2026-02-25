import { requestUrl } from 'obsidian';
import type { CloudProvider, ProviderCheckResult } from './types';

const API_ROOT = 'https://cloud-api.yandex.net/v1/disk';

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
}
