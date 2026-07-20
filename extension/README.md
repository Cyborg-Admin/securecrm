# KINETIC Chrome Extension (v1.5.5)

## Install (recommended)

1. In the CRM, open **Extension** in the sidebar  
2. Click **Add to Chrome** (Chrome Web Store)  
3. Open the side panel → paste your API key from **Settings → Extension**

Chrome only allows normal one-click install + auto-updates via the Web Store.  
Admins publish the zip from `/api/extension/download` once (unlisted is fine), then paste the listing URL on the Extension page.

## Detect install

The CRM page listens for the extension bridge (`content/crm-bridge.js`) and can also `chrome.runtime.sendMessage` the extension ID.

Stable pre-store ID (from manifest `key`): `dlaplkgneaeodolklfiinmebncnpaagk`  
After Web Store publish, Google may assign a new ID — save it in org settings / env.

## Developer / local

1. `chrome://extensions` → Developer mode → **Load unpacked** → this folder  
2. Optional: Settings → Enable auto-updates (folder link) for silent local sync

## Features

- Side panel, FAB, CRM badges, enrich, deep scrape, train mode  
- Photo / logo / bio scrape into lead metadata  
- Automatic Web Store updates once published  
