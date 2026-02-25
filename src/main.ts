import { Plugin, Notice, setIcon } from 'obsidian';

type SyncState =
  | { kind: 'idle' }
  | { kind: 'dirty'; changed: number }
  | { kind: 'scanning' }
  | { kind: 'syncing'; done?: number; total?: number }
  | { kind: 'ok'; lastSyncAt: number }
  | { kind: 'error'; message: string };

function* stateGenerator(states: SyncState[]) {
  let i = 0;

  while (true) {
    yield states[i++ % states.length];
  }
}

export default class SyncerPlugin extends Plugin {
  private statusEl!: HTMLElement;
  private state: SyncState = { kind: 'idle' };

  async onload() {
    this.statusEl = this.addStatusBarItem();
    this.statusEl.addClass('syncer-status');

    const states = stateGenerator([
      { kind: 'idle' },
      { kind: 'dirty', changed: 25 },
      { kind: 'scanning' },
      { kind: 'syncing', done: 25, total: 100 },
      { kind: 'syncing', done: 43, total: 100 },
      { kind: 'syncing', done: 69, total: 100 },
      { kind: 'syncing', done: 100, total: 100 },
      { kind: 'ok', lastSyncAt: +new Date() },
      { kind: 'error', message: 'Вот так вота' },
    ]);

    this.statusEl.onclick = () => {
      // например: если ошибка — показать, если dirty — запустить sync, иначе показать diff
      new Notice('Syncer: clicked');

      this.setState(states.next().value!);
    };

    this.renderStatus();

    this.addRibbonIcon('refresh-cw', 'Syncer', () => {
      new Notice('Hello, world!');
    });
  }

  private setState(next: SyncState) {
    this.state = next;
    this.renderStatus();
  }

  private renderStatus() {
    // очищаем
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
      case 'syncing':
        setIcon(icon, 'cloud-upload');

        if (this.state.total !== null && this.state.done !== null) {
          text.setText(`Syncer: ${this.state.done}/${this.state.total}`);
          this.statusEl.title = `Syncer: uploading ${this.state.done}/${this.state.total}`;
        } else {
          text.setText('Syncer: sync');
          this.statusEl.title = 'Syncer: syncing';
        }

        break;
      case 'ok':
        setIcon(icon, 'cloud-check');
        text.setText('Syncer: ok');
        this.statusEl.title = `Syncer: last sync ${new Date(this.state.lastSyncAt).toLocaleString()}`;
        break;
      case 'error':
        setIcon(icon, 'cloud-off');
        text.setText('Syncer: !');
        this.statusEl.title = `Syncer error: ${this.state.message}`;
        break;
    }
  }
}
