import { App, PluginSettingTab, Setting } from 'obsidian';
import type SyncerPlugin from './main';
import type { ProviderId } from './providers/types';

export interface ProviderSettings {
  token: string;
}

export interface SyncerSettings {
  activeProvider: ProviderId;
  providers: {
    yandex: ProviderSettings;
  };
}

export const DEFAULT_SETTINGS: SyncerSettings = {
  activeProvider: 'yandex',
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
