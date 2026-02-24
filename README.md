# Syncer

**Syncer** is an Obsidian plugin that syncs your vault to cloud storage — **manual, one-click**, with clear status and change detection.

> Current provider: **Yandex Disk**

---

## ✨ What it does

- One-button sync: upload vault changes to cloud storage
- Detects changes since last sync (added / modified / deleted)
- Shows sync status in the status bar
- Stores sync state locally inside your vault (`.obsidian/plugins/syncer/`)

---

## ✅ Supported cloud storages

- **Yandex Disk** (currently supported)

Planned (idea): other providers can be added later with the same core logic.

---

## 📦 Installation

### Option A — Obsidian Community Plugins (when published)
1. Open **Settings → Community plugins**
2. Turn off **Safe mode** (if needed)
3. Search for **Syncer**
4. Install and enable it

### Option B — BRAT (for testing / beta)
1. Install **BRAT** plugin
2. Open **BRAT settings**
3. Add beta plugin by repository URL:  
   `https://github.com/<OWNER>/<REPO>`
4. Enable **Syncer**

### Option C — Manual install
1. Download the latest release from GitHub **Releases**
2. Extract into:
   - `YourVault/.obsidian/plugins/syncer/`
3. Make sure these files exist:
   - `main.js`
   - `manifest.json`
   - `styles.css` (optional)
4. Enable the plugin in **Settings → Community plugins**

---

## ⚙️ Setup (Yandex Disk)

1. Open **Settings → Syncer**
2. Choose provider: **Yandex Disk**
3. Provide authentication (token / OAuth — depends on implementation)
4. Choose a destination folder on Yandex Disk
5. Save settings

> Syncer keeps a local state file to detect changes and avoid hashing everything on every run.

---

## ▶️ Usage

- Click **Sync** button (command palette or ribbon if enabled)
- Watch status bar:
  - `Idle` → `Syncing…` → `Done` / `Failed`

### Commands
- `Syncer: Sync now`
- `Syncer: Show sync status`
- (optional) `Syncer: Reset state` — forces full re-scan on next sync

---

## 🗂️ How it works (short)

Syncer maintains a local state file with metadata about synced files (hash / size / modified time depending on strategy).  
On sync it compares current vault state to stored state and uploads only what changed.

State location (inside your vault):
- `.obsidian/plugins/syncer/state.json`

---

## ⚠️ Notes & limitations

- **Empty folders are not synced** (cloud storage usually doesn’t keep empty directories)
- Large vaults: first sync may take time (initial indexing)
- If you delete `state.json`, next sync will behave like first sync

---

## 🧩 Roadmap (optional)

- Two-way sync (download + merge)
- Conflict handling
- Scheduled sync / background sync
- More providers (S3, WebDAV, Google Drive, etc.)

---

## 🐞 Bug reports / feature requests

Create an issue on GitHub:
- what you expected
- what happened
- Obsidian version
- plugin version
- logs (if available)

---

## 📄 License

MIT (or your license here)