# IOT Techs — Proposal App (local)

A local version of the IOT Techs proposal calculator with a customer database
and search. No internet, no cloud, no npm install required.

## Requirements
- Node.js 22.5+ (you have v24) — uses the built-in `node:sqlite` and `node:http`,
  so there are **no dependencies to install**.

## Run it
**Easiest:** double-click **`Start IOT App.bat`** — it launches the server and
opens your browser automatically. Keep that window open while you work; close it
to stop.

Or from a terminal in this folder (`IOT APP`):

```
node server.js
```

Then open **http://localhost:3000** in your browser.

To auto-restart while editing code:

```
npm run dev
```

## Auto-save → live dashboard
Once a record has a name (or business), the app quietly saves **every change** to
the database (~1.2s after you stop typing) — you'll see a small "✓ Auto-saved"
badge in the bottom-left. It tracks the lead's id, so editing the same proposal
keeps updating **one** record (no duplicates while you type).

The **Pipeline Dashboard** auto-refreshes (every few seconds + when you switch
back to its tab), so anything you change in the calculator shows up there live —
no manual refresh. It won't interrupt an edit you're making in the dashboard.

The **Save** button still works for an explicit save (and still downloads the
HTML draft). **Clear All** starts a fresh lead.

## What gets stored
A SQLite database file is created at `data/iot.db` the first time you save.

- **customers / leads** — name, business, phone, email, address, plus CRM lead
  fields: pipeline **status**, **temperature**, **source**, **closed reason**, and **notes**
- **proposals** — the full proposal (line items, totals, discounts, payments,
  addendums, dates, notes) saved as JSON, linked to a customer

The `data/` folder is git-ignored so your customer data never gets committed.
The schema auto-migrates: new columns are added to an existing `iot.db` on start.

## Pipeline Dashboard (CRM)
Open **http://localhost:3000/dashboard.html** (or the **Pipeline Dashboard**
button on the calculator). It's the lead-to-cash cockpit from the workflow map:

- **Stat cards** — total leads, open pipeline value, won value, conversion %
- **Pipeline chips** — live counts per stage (New → Contacted → Quoted →
  Follow-Up → Approved → Scheduled → In Progress → Completed → Closed); click to filter
- **Lead cards** — set status, temperature (Urgent/Hot/Warm/Cold), source, closed
  reason, and notes inline; **Open** loads that lead's proposal back into the
  calculator; **×** deletes the lead

Every saved proposal automatically creates/updates a lead (status starts at *New*).

## Dispatch & Work Orders
Open **http://localhost:3000/dispatch.html** (or the **Dispatch** nav link). This
is Phase 2 of the workflow — turning approved leads into scheduled jobs:

- **Technician roster** — add your field team (name, phone, skills, active toggle)
- **Work orders** — created from a lead via the **→ WO** button on the Pipeline
  page. Each carries the customer, proposal #, and amount.
- **Assign + schedule** — pick a technician and a date on each work order. Status
  auto-advances: assigning a tech → *Assigned*, setting a date → *Scheduled*.
  Statuses: Unassigned → Assigned → Scheduled → In Progress → Completed (or Cancelled).
- **Details** (per work order) opens execution & QC:
  - **Build-out checklist** — mounting, cabling, NVR config, programming, testing,
    walkthrough, etc. Tick items off; a progress bar tracks completion.
  - **On-site addendums** — extra scope found during the job (description, qty,
    price). Added on top of the base amount; the work-order total updates.
  - **Quality control** — Pending / Passed / Failed plus a punch-list notes field.
- Filter by status, add dispatch notes, and it **auto-refreshes** live like the
  dashboard.

Calculator ⇄ Pipeline ⇄ Dispatch are all linked in the top nav.

## How it works in the app
- **Search bar** (top of the form): type a name, business, phone, email, or
  address. Matching saved customers appear in a dropdown.
- **Pick a result**: loads that customer's most recent proposal back into the
  form (or just their contact info if no proposal was saved).
- **Empty search bar**: click it while empty to see your most recent customers.
- **Saved Proposals button** (next to the search bar): opens a browser of every
  customer in the database. Filter, expand a customer to see all their
  proposals, Open or Delete any of them, and **Export CSV** of the whole
  customer list (opens cleanly in Excel).
- **Save button**: stores the current customer + proposal into the database.
  (It still also downloads the HTML draft, like before.)

## Fully offline
The browser libraries (jsPDF, QRious) and Google Fonts are vendored into
`public/vendor/`, so PDFs, QR codes, and fonts all work with no internet.
The only feature that still needs a connection is the **address autocomplete**
(OpenStreetMap's Nominatim API) — without internet you just type the address
manually; everything else works.

## API (if you want to script against it)
- `GET  /api/customers/search?q=...` — search customers
- `GET  /api/customers` — all customers (with their latest proposal #/total)
- `GET  /api/customers/:id` — one customer + their proposals + latest state
- `GET  /api/proposals/:id` — full saved proposal state
- `POST /api/save` — `{ customer, proposal }` upsert
- `PATCH /api/customers/:id` — update lead fields (status, temperature, source, closed_reason, notes)
- `GET  /api/stats` — dashboard aggregates (counts by stage, pipeline value, etc.)
- `DELETE /api/proposals/:id` — delete a proposal
- `DELETE /api/customers/:id` — delete a customer + their proposals + work orders
- `GET/POST/DELETE /api/technicians[/:id]` — technician roster
- `GET /api/workorders` · `POST /api/workorders/from-lead` · `PATCH/DELETE /api/workorders/:id`
- `GET /api/config` · `GET /api/address/autocomplete` · `GET /api/address/details` (Google Places proxy)

## Backups
Just copy the `data/iot.db` file somewhere safe. That single file is your
entire customer + proposal history.

## Files
```
server.js            Node HTTP server + SQLite (no deps) — CRM + proposal API
public/index.html    The proposal calculator UI
public/dashboard.html The CRM pipeline dashboard
public/dispatch.html  Dispatch board — technicians + work orders
public/iot-db.js     Front-end wiring: search, save, library, dashboard/dispatch links
public/vendor/       Vendored jsPDF, QRious, and Google Fonts (offline)
config.json          Google Maps API key (git-ignored)
data/iot.db          Your database (created on first save)
```
