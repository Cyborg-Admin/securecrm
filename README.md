# SecureCRM

Minimal black-and-white CRM focused on **security**, **accountability**, **RBAC**, and **automation**, with a Chrome extension for LinkedIn, Sales Navigator, Cognism, and Gmail lead capture.

## Stack

- Next.js (App Router) + TypeScript
- Local SQLite by default (`database/schema.sql` → `data/securecrm.sqlite`)
- Optional PostgreSQL (`database/postgres/setup.sql`)
- Chrome Extension (Manifest V3) in `/extension`

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

Bootstrap admin (first run):

- Email: `admin@example.com`
- Password: `ChangeMeNow!23`

## Core product model

| Concept | Behavior |
|---|---|
| LinkedIn UID | Normalized LinkedIn URL uniquely identifies a lead per org |
| Companies | Shared objects; dedupe by normalized name + domain |
| Ownership | Assigned on capture; transfers are audited |
| RBAC | Admin / Manager / Rep / Viewer permission sets |
| Automation | Triggered on `lead.captured` (assign owner, set status, tag) |
| Audit log | Auth, create/update, ownership, API keys |
| Contact stage | Email/phone deferred — capture stage stores profile factors only |

Lead capture fields: name, job title, company, industry, website, location, headline, source.

## Chrome extension

1. Run the CRM (`npm run dev`)
2. Sign in → **Settings** → generate an API key
3. Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → select `/extension`
4. Open the extension popup → paste API base URL + key
5. Use floating bars on:
   - LinkedIn people search / profiles
   - Sales Navigator search / lead pages
   - Cognism search results
   - Gmail open messages (match CRM; offer add-to-leads)

### Capture modes

- **Profile-by-profile** — capture the open profile
- **Page capture** — scrape all visible results on the current page
- **Bulk + next pages** — capture page, auto-click Next, repeat (default up to 10 pages)

Gmail: matches open email sender to contacts/leads. If no close match, offers **Add to lead list** (LinkedIn URL required as UID when available in the thread).

## PostgreSQL setup

```bash
createdb securecrm
psql -d securecrm -f database/postgres/setup.sql
```

In `.env.local`:

```env
DB_DRIVER=postgres
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/securecrm
```

> Local MVP is SQLite-first. The Postgres schema is ready; wire the async `pg` driver into production deploy when you cut over.

## Security notes

- Session cookies are httpOnly; CSRF required on browser mutations
- Extension uses hashed API keys (`scrm_…`) with scoped permissions
- Every query is organization-scoped (tenant isolation)
- Passwords hashed with bcrypt
- Audit trail for accountability

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start local CRM |
| `npm run build` | Production build |
| `npm run db:init` | Ensure SQLite schema exists |
| `npm run lint` | ESLint |
