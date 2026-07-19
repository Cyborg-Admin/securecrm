# KINETIC Chrome Extension (v1.5.0)

## Install / update

1. Open `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this `extension/` folder  
   Or download: `/api/extension/download`
3. After updates: **Reload** the extension card

## Features

- **Side panel** — connection, CRM search, history, deep scrape, train mode
- **FAB** — capture / bulk / deep scrape / train on LinkedIn
- **In-CRM badges** on LinkedIn search results
- **Train mode** — click page elements to map scrape fields (saved as CRM recipes)
- **Deep scrape** — opens profiles one-by-one in a `KINETIC` tab group, scrapes experience history, saves, closes
- **Enrich** — `KineticEnrichment` class compares page vs CRM, fills missing fields, overwrites mismatches (`run({ dryRun: true })` for future automation)
- **Role history** — previous appointments stored on the lead in the CRM

## Settings

- API base + key
- Badges / Gmail auto-scan / FAB
- Bulk page limit
- Deep scrape delay + max profiles
- Train mode toggle
