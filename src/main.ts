import { Notice, Plugin, setIcon } from 'obsidian';
import { buildLocalIndex, getVaultId } from './index/local-index';
import { LOCAL_INDEX_SCHEMA_VERSION, type LocalIndex } from './index/types';
import { ProviderRegistry } from './providers/registry';
import type { CloudProvider, ProviderId } from './providers/types';
import { YandexDiskProvider } from './providers/yandex';
import { DEFAULT_SETTINGS, SyncerSettingTab } from './settings';
import type { SyncerSettings } from './settings';
import { buildPushPlan, countDoneOperations, createPendingSync } from './sync/engine';
import { SYNC_DATA_SCHEMA_VERSION, type PendingSync, type SyncPluginData } from './sync/types';

type SyncState =
  | { kind: 'idle' }
  | { kind: 'dirty'; changed: number }
  | { kind: 'scanning' }
  | { kind: 'connecting'; provider: string }
  | { kind: 'syncing'; done?: number; total?: number }
  | { kind: 'connected'; provider: string }
  | { kind: 'ok'; lastSyncAt: number }
  | { kind: 'error'; message: string };

export default class SyncerPlugin extends Plugin {
  private statusEl!: HTMLElement;
  private state: SyncState = { kind: 'idle' };
  settings: SyncerSettings = DEFAULT_SETTINGS;
  localIndex: LocalIndex | null = null;
  pendingSync: PendingSync | null = null;
  private lastSuccessfulSyncAt: number | null = null;
  private syncInProgress = false;
  private providers = new ProviderRegistry();

  async onload() {
    await this.loadPluginData();

    this.providers.register(new YandexDiskProvider());

    this.statusEl = this.addStatusBarItem();
    this.statusEl.addClass('syncer-status');

    this.installStyles();
    this.addSettingTab(new SyncerSettingTab(this.app, this));

    this.renderStatus();
    this.addRibbonIcon('refresh-cw', 'Syncer: sync now', () => {
      void this.onSyncClick();
    });

    await this.ensureLocalIndexOnStart();
    void this.checkConnectionOnStart();
  }

  private setState(next: SyncState) {
    this.state = next;
    this.renderStatus();
  }

  private renderStatus() {
    this.statusEl.empty();

    const icon = this.statusEl.createSpan({ cls: 'syncer-icon' });
    const text = this.statusEl.createSpan({ cls: 'syncer-text' });

    switch (this.state.kind) {
      case 'idle':
        setIcon(icon, 'cloud');
        text.setText('Syncer');
        this.statusEl.title = 'Syncer: idle';
        break;
      case 'dirty':
        setIcon(icon, 'cloud-alert');
        text.setText(`Syncer: ${this.state.changed}`);
        this.statusEl.title = `Syncer: ${this.state.changed} changed (not synced)`;
        break;
      case 'scanning':
        setIcon(icon, 'search');
        text.setText('Syncer: scan');
        this.statusEl.title = 'Syncer: scanning vault';
        break;
      case 'connecting':
        setIcon(icon, 'loader');
        icon.addClass('syncer-spin');
        text.setText('Syncer: connect');
        this.statusEl.title = `Syncer: connecting to ${this.state.provider}`;
        break;
      case 'syncing':
        setIcon(icon, 'cloud-upload');

        // eslint-disable-next-line eqeqeq
        if (this.state.total != null && this.state.done != null) {
          text.setText(`Syncer: ${this.state.done}/${this.state.total}`);
          this.statusEl.title = `Syncer: uploading ${this.state.done}/${this.state.total}`;
        } else {
          text.setText('Syncer: sync');
          this.statusEl.title = 'Syncer: syncing';
        }

        break;
      case 'connected':
        setIcon(icon, 'cloud-check');
        text.setText('Syncer: ready');
        this.statusEl.title = `Syncer: connected to ${this.state.provider}`;
        break;
      case 'ok':
        setIcon(icon, 'cloud-check');
        text.setText('Syncer: ok');
        this.statusEl.title = `Syncer: last sync ${new Date(this.state.lastSyncAt).toLocaleString()}`;
        break;
      case 'error':
        setIcon(icon, 'cloud-off');
        text.setText('Syncer: error');
        this.statusEl.title = `Syncer error: ${this.state.message}`;
        break;
    }
  }

  private installStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .syncer-status .syncer-spin svg {
        animation: syncer-spin 1s linear infinite;
      }

      @keyframes syncer-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
    this.register(() => style.remove());
  }

  private async onSyncClick() {
    if (this.syncInProgress) {
      new Notice('Syncer: sync already in progress');

      return;
    }

    const provider = this.getActiveProvider();

    if (!provider) {
      this.setState({ kind: 'error', message: 'No provider selected' });

      return;
    }

    const token = this.getActiveProviderToken();

    if (!token) {
      this.setState({ kind: 'error', message: 'OAuth token is empty' });

      return;
    }

    this.syncInProgress = true;
    this.setState({ kind: 'syncing', done: 0, total: 0 });

    try {
      let currentSnapshot: LocalIndex;
      let remoteInitialized = true;

      if (this.pendingSync) {
        await this.executePendingSync(provider, token);
        currentSnapshot = await this.reconcileLocalSnapshot();
        this.localIndex = currentSnapshot;
        this.pendingSync = null;
        this.lastSuccessfulSyncAt = Date.now();
        await this.uploadRemoteSyncState(provider, token, currentSnapshot);
        await this.savePluginData();
      } else {
        currentSnapshot = await this.reconcileLocalSnapshot();
        remoteInitialized = await provider.hasSyncState(token);
      }

      const baseline = remoteInitialized ? this.localIndex : null;
      const operations = buildPushPlan(baseline, currentSnapshot);

      if (operations.length === 0) {
        this.localIndex = currentSnapshot;
        this.lastSuccessfulSyncAt = Date.now();
        await this.uploadRemoteSyncState(provider, token, currentSnapshot);
        await this.savePluginData();
        this.setState({ kind: 'ok', lastSyncAt: this.lastSuccessfulSyncAt });

        return;
      }

      this.pendingSync = createPendingSync(operations);
      await this.savePluginData();
      await this.executePendingSync(provider, token);

      this.localIndex = currentSnapshot;
      this.pendingSync = null;
      this.lastSuccessfulSyncAt = Date.now();
      await this.uploadRemoteSyncState(provider, token, currentSnapshot);
      await this.savePluginData();
      this.setState({ kind: 'ok', lastSyncAt: this.lastSuccessfulSyncAt });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed';
      this.setState({ kind: 'error', message });
      new Notice(`Syncer: ${message}`);
    } finally {
      this.syncInProgress = false;
    }
  }

  private async executePendingSync(provider: CloudProvider, token: string) {
    if (!this.pendingSync) {
      return;
    }

    const pendingOperations = this.pendingSync.operations.filter(
      (operation) => operation.status !== 'done',
    );
    const total = this.pendingSync.total;
    const concurrency = Math.min(8, Math.max(1, this.settings.maxConcurrentUploads));
    let nextIndex = 0;
    let firstError: Error | null = null;

    const runWorker = async () => {
      while (true) {
        if (firstError) {
          return;
        }

        const current = pendingOperations[nextIndex];
        nextIndex += 1;

        if (!current) {
          return;
        }

        this.setState({
          kind: 'syncing',
          done: countDoneOperations(this.pendingSync?.operations ?? []),
          total,
        });

        try {
          await this.performOperationWithRetry(provider, token, current);
          current.status = 'done';
          current.error = undefined;

          if (this.pendingSync) {
            this.pendingSync.done = countDoneOperations(this.pendingSync.operations);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Operation failed';
          current.status = 'failed';
          current.error = message;

          if (this.pendingSync) {
            this.pendingSync.done = countDoneOperations(this.pendingSync.operations);
          }

          firstError = new Error(`Failed ${current.type} ${current.path}: ${message}`);
        }

        await this.savePluginData();
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, pendingOperations.length) }, () =>
      runWorker(),
    );
    await Promise.all(workers);

    if (firstError) {
      throw firstError;
    }

    this.setState({ kind: 'syncing', done: total, total });
  }

  private async performOperationWithRetry(
    provider: CloudProvider,
    token: string,
    operation: PendingSync['operations'][number],
  ) {
    const maxRetries = Math.max(0, this.settings.maxRetries);
    let attempt = 0;

    while (true) {
      try {
        await this.performOperation(provider, token, operation);

        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Operation failed';

        if (attempt >= maxRetries || !this.isRetriableError(message)) {
          throw err;
        }

        const backoffMs = this.retryBackoffMs(attempt);
        await this.delay(backoffMs);
        attempt += 1;
      }
    }
  }

  private async performOperation(
    provider: CloudProvider,
    token: string,
    operation: PendingSync['operations'][number],
  ) {
    const adapter = this.app.vault.adapter;

    if (operation.type === 'upload') {
      const fileBytes = await adapter.readBinary(operation.path);
      const result = await provider.uploadFile(token, operation.path, fileBytes);

      if (!result.ok) {
        throw new Error(result.message);
      }

      return;
    }

    if (operation.type === 'delete') {
      const result = await provider.deleteFile(token, operation.path);

      if (!result.ok) {
        throw new Error(result.message);
      }
    }
  }

  private isRetriableError(message: string): boolean {
    const retriableHttpCodes = ['HTTP 429', 'HTTP 502', 'HTTP 503', 'HTTP 504'];

    if (retriableHttpCodes.some((code) => message.includes(code))) {
      return true;
    }

    const retriableNetworkHints = [
      'timeout',
      'network',
      'temporarily unavailable',
      'connection reset',
      'socket hang up',
    ];
    const lowerMessage = message.toLowerCase();

    return retriableNetworkHints.some((hint) => lowerMessage.includes(hint));
  }

  private retryBackoffMs(attempt: number): number {
    const base = 400;
    const max = 5000;
    const jitter = Math.floor(Math.random() * 200);

    return Math.min(max, base * 2 ** attempt + jitter);
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  private async reconcileLocalSnapshot(): Promise<LocalIndex> {
    this.setState({ kind: 'scanning' });

    return buildLocalIndex(this.app.vault);
  }

  private async uploadRemoteSyncState(
    provider: CloudProvider,
    token: string,
    snapshot: LocalIndex,
  ) {
    const payload = JSON.stringify({
      schemaVersion: SYNC_DATA_SCHEMA_VERSION,
      vaultId: snapshot.vaultId,
      fileCount: Object.keys(snapshot.files).length,
      updatedAt: Date.now(),
    });
    const result = await provider.uploadSyncState(token, payload);

    if (!result.ok) {
      throw new Error(`Failed to upload remote sync state: ${result.message}`);
    }
  }

  private async checkConnectionOnStart() {
    const provider = this.getActiveProvider();

    if (!provider) {
      this.setState({ kind: 'error', message: 'No provider selected' });

      return;
    }

    this.setState({ kind: 'connecting', provider: provider.name });
    const result = await provider.checkConnection(this.getActiveProviderToken());

    if (result.ok) {
      if (this.pendingSync) {
        const remaining = this.pendingSync.operations.filter(
          (operation) => operation.status !== 'done',
        ).length;
        this.setState({ kind: 'dirty', changed: remaining });
      } else {
        this.setState({ kind: 'connected', provider: provider.name });
      }
    } else {
      this.setState({ kind: 'error', message: result.message });
    }
  }

  private getActiveProviderToken(): string {
    switch (this.settings.activeProvider) {
      case 'yandex':
        return this.settings.providers.yandex.token;
      default:
        return '';
    }
  }

  private getActiveProvider(): CloudProvider | undefined {
    return this.providers.get(this.settings.activeProvider);
  }

  getProviderOptions(): Record<ProviderId, string> {
    const options: Partial<Record<ProviderId, string>> = {};
    this.providers.list().forEach((provider) => {
      options[provider.id] = provider.name;
    });

    return options as Record<ProviderId, string>;
  }

  async saveSettings() {
    await this.savePluginData();
  }

  private async ensureLocalIndexOnStart() {
    const vaultId = await getVaultId(this.app.vault);

    if (
      this.localIndex &&
      this.localIndex.vaultId === vaultId &&
      this.localIndex.schemaVersion === LOCAL_INDEX_SCHEMA_VERSION
    ) {
      return;
    }

    this.setState({ kind: 'scanning' });
    this.localIndex = await buildLocalIndex(this.app.vault);
    await this.savePluginData();
  }

  private async loadPluginData() {
    const raw = ((await this.loadData()) ?? {}) as Partial<SyncPluginData>;
    const legacySettings = raw as Partial<SyncerSettings>;
    const storedSettings = (raw.settings as Partial<SyncerSettings> | undefined) ?? {
      activeProvider: legacySettings.activeProvider,
      providers: legacySettings.providers,
    };

    this.settings = {
      ...DEFAULT_SETTINGS,
      ...storedSettings,
      providers: {
        ...DEFAULT_SETTINGS.providers,
        ...(storedSettings.providers ?? {}),
      },
    };
    this.localIndex = raw.localIndex ?? null;
    this.pendingSync = raw.pendingSync ?? null;
    this.lastSuccessfulSyncAt = raw.lastSuccessfulSyncAt ?? null;
  }

  private async savePluginData() {
    const data: SyncPluginData = {
      schemaVersion: SYNC_DATA_SCHEMA_VERSION,
      settings: this.settings,
      localIndex: this.localIndex,
      pendingSync: this.pendingSync,
      lastSuccessfulSyncAt: this.lastSuccessfulSyncAt,
    };

    await this.saveData(data);
  }
}
