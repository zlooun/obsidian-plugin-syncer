import { App, PluginSettingTab, Setting } from 'obsidian';
import type SyncerPlugin from './main';
import type { ProviderId } from './providers/types';

export interface ProviderSettings {
  token: string;
}

export interface SyncerSettings {
  activeProvider: ProviderId;
  maxConcurrentUploads: number;
  maxRetries: number;
  providers: {
    yandex: ProviderSettings;
  };
}

export const DEFAULT_SETTINGS: SyncerSettings = {
  activeProvider: 'yandex',
  maxConcurrentUploads: 4,
  maxRetries: 3,
  providers: {
    yandex: {
      token: '',
    },
  },
};

export class SyncerSettingTab extends PluginSettingTab {
  private plugin: SyncerPlugin;

  constructor(app: App, plugin: SyncerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    const providerOptions = this.plugin.getProviderOptions();

    new Setting(containerEl)
      .setName('Active provider')
      .setDesc('Select which cloud provider is used for sync.')
      .addDropdown((dropdown) => {
        Object.entries(providerOptions).forEach(([id, name]) => {
          dropdown.addOption(id, name);
        });

        dropdown.setValue(this.plugin.settings.activeProvider);
        dropdown.onChange(async (value) => {
          this.plugin.settings.activeProvider = value as ProviderId;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Max concurrent uploads')
      .setDesc('How many files can be uploaded in parallel.')
      .addText((text) => {
        text.setPlaceholder('4');
        text.setValue(String(this.plugin.settings.maxConcurrentUploads));
        text.onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          this.plugin.settings.maxConcurrentUploads = Number.isFinite(parsed)
            ? Math.min(8, Math.max(1, parsed))
            : DEFAULT_SETTINGS.maxConcurrentUploads;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Max retries')
      .setDesc('Retries for rate limits and temporary network/server errors.')
      .addText((text) => {
        text.setPlaceholder('3');
        text.setValue(String(this.plugin.settings.maxRetries));
        text.onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          this.plugin.settings.maxRetries = Number.isFinite(parsed)
            ? Math.min(10, Math.max(0, parsed))
            : DEFAULT_SETTINGS.maxRetries;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Yandex Disk OAuth token')
      .setDesc('Personal token used to access Yandex Disk API.')
      .addText((text) => {
        text.setPlaceholder('OAuth token');
        text.setValue(this.plugin.settings.providers.yandex.token);
        text.onChange(async (value) => {
          this.plugin.settings.providers.yandex.token = value.trim();
          await this.plugin.saveSettings();
        });
      });
  }
}
