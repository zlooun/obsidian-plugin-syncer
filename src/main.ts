import { Plugin, setIcon } from 'obsidian';
import { DEFAULT_SETTINGS, SyncerSettingTab } from './settings';
import type { SyncerSettings } from './settings';
import { ProviderRegistry } from './providers/registry';
import type { CloudProvider, ProviderId } from './providers/types';
import { YandexDiskProvider } from './providers/yandex';

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
  private providers = new ProviderRegistry();

  async onload() {
    await this.loadSettings();

    this.providers.register(new YandexDiskProvider());

    this.statusEl = this.addStatusBarItem();
    this.statusEl.addClass('syncer-status');

    this.installStyles();

    this.addSettingTab(new SyncerSettingTab(this.app, this));

    this.renderStatus();

    this.addRibbonIcon('refresh-cw', 'Syncer: sync now', () => {
      this.onSyncClick();
    });

    void this.checkConnectionOnStart();
  }

  private setState(next: SyncState) {
    this.state = next;
    this.renderStatus();
  }

  private renderStatus() {
    this.statusEl.empty();

    const icon = this.statusEl.createSpan({ cls: 'syncer-icon' });

    switch (this.state.kind) {
      case 'idle':
        setIcon(icon, 'cloud');
        this.statusEl.title = 'Syncer: idle';
        break;
      case 'dirty':
        setIcon(icon, 'cloud-alert');
        this.statusEl.title = `Syncer: ${this.state.changed} changed (not synced)`;
        break;
      case 'scanning':
        setIcon(icon, 'search');
        this.statusEl.title = 'Syncer: scanning vault';
        break;
      case 'connecting':
        setIcon(icon, 'loader');
        icon.addClass('syncer-spin');
        this.statusEl.title = `Syncer: connecting to ${this.state.provider}`;
        break;
      case 'syncing':
        setIcon(icon, 'cloud-upload');

        if (!this.state.total && !this.state.done) {
          text.setText(`Syncer: ${this.state.done}/${this.state.total}`);
          this.statusEl.title = `Syncer: uploading ${this.state.done}/${this.state.total}`;
        } else {
          this.statusEl.title = 'Syncer: syncing';
        }

        break;
      case 'connected':
        setIcon(icon, 'cloud-check');
        this.statusEl.title = `Syncer: connected to ${this.state.provider}`;
        break;
      case 'ok':
        setIcon(icon, 'cloud-check');
        this.statusEl.title = `Syncer: last sync ${new Date(this.state.lastSyncAt).toLocaleString()}`;
        break;
      case 'error':
        setIcon(icon, 'cloud-off');
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

  private onSyncClick() {
    // Intentionally empty for now.
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
      this.setState({ kind: 'connected', provider: provider.name });
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

  async loadSettings() {
    const stored = (await this.loadData()) as SyncerSettings;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...stored,
      providers: {
        ...DEFAULT_SETTINGS.providers,
        ...(stored?.providers ?? {}),
      },
    };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
