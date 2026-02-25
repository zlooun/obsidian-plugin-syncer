import type { CloudProvider, ProviderId } from './types';

export class ProviderRegistry {
  private providers = new Map<ProviderId, CloudProvider>();

  register(provider: CloudProvider) {
    this.providers.set(provider.id, provider);
  }

  get(id: ProviderId): CloudProvider | undefined {
    return this.providers.get(id);
  }

  list(): CloudProvider[] {
    return Array.from(this.providers.values());
  }
}
