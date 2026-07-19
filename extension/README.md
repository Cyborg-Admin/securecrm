# SecureCRM Chrome Extension (v1.2.0)

## Install / update

1. Open `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this `extension/` folder  
   Or download a zip from your CRM: `/api/extension/download`
3. After pulling updates: click **Reload** on the extension card

The extension checks `/api/extension/version` every few hours and shows an **UP** badge + side-panel banner when a newer build is available. Unpacked extensions do not auto-overwrite — reload/reinstall the folder or unzipped download.

## Use

1. Click the toolbar icon → **pinned side panel** opens (settings, history, compact lead search)
2. Create an API key in CRM → **Settings**, paste it in the side panel
3. On LinkedIn / Sales Nav / Cognism / Gmail, use the bottom-right **FAB (S)** menu
4. On LinkedIn people search, **Lead** / **CRM ✓** badges mark profiles already in SecureCRM

## Settings (side panel)

- CRM base URL + API key
- In-CRM badges on LinkedIn
- Auto-scan Gmail
- Show/hide FAB
- Bulk page limit
- Compact CRM list size
- Capture history (local)

## Pin the side panel

Open the side panel once, then pin it from Chrome’s side-panel UI so it stays available while you browse.
