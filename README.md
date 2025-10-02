# Projects Board (RTL Dashboard)

A lightweight, static, single‑page dashboard (RTL/Hebrew UI) for viewing and managing a list of projects. Data is loaded from a JSON file on first run and then persisted in `localStorage`. Users can add, edit, delete projects, export the current data as JSON, switch dark mode, and view an activity history.

- Pure HTML/CSS/JavaScript — no build, no dependencies
- UI is right‑to‑left (Hebrew), but this README is in English

---

## Features

- Project cards grid with truncated labels/values to keep layout tidy
- Add/Edit/Delete projects via modals; change field labels and values
- Download updated JSON reflecting current state (`projects.json` schema)
- Hot items ticker showing project names
- History log (create/edit/delete/import/export) with timestamps in `localStorage`
- Dark mode toggle persisted in `localStorage`
- Connectivity banner (best-effort) and per-card link status indicator (see details below)
- Always-on synthetic monitoring UI: configure login/tests, run manual checks, and view per-card health lights

---

## File Structure

```
.
├─ index.html     # Main HTML (modals, ticker, connectivity banner, footer controls)
├─ script.js      # App logic: load/store/render, modals, history, status checks
├─ styles.css     # Theme (light/dark), layout, responsive grid, RTL support
├─ projects.json  # Sample data loaded on first run
├─ SECURITY.md    # Security notes and hardening guidelines
└─ CHANGES.md     # Changelog and manual test notes
```

---

## Status Indicators (Lights)

Small circle on each card reflects link status (best‑effort):

- White (`#ffffff`) — No URL / Not checked
- Green (`#8DC71E`) — Reachable (opaque success in browser)
- Red (`#ff0033`) — Failed to reach (network error or rejected request)

Notes:
- Browser `no-cors` requests are opaque: a successful fetch does not guarantee HTTP 2xx.
- For production accuracy, use a server‑side proxy (see “Connectivity & Status Limitations”).

---
## Getting Started

Because the app fetches `projects.json`, run it behind a static HTTP server.

- Python (quickest):
  - `python -m http.server 5500`
  - Open `http://localhost:5500/`

Opening `index.html` directly via `file://` may block `fetch` on first load; a local server avoids that.

---

## Usage

- Upload JSON: Click “Upload”, pick a `projects.json`. Data is parsed and saved to `localStorage`.
- Add project: "Add Project" → set Name (required), optional URL, and up to 4 label/value pairs.
- Edit/Delete: Use the buttons on each card. A confirmation is shown for delete.
- Download JSON: Exports the current `projectsData` (pretty‑printed, 4‑space indent).
- Dark mode: Toggle via the footer button; preference persists across reloads.
- History: Open “History” to see timestamped actions stored in `localStorage`.

Input limits (to preserve layout):
- Name up to 20 chars; field label up to 15; field value up to 20.

Buttons & actions summary:
- `Upload` — import `projects.json` and persist to `localStorage`
- `Download JSON` — export current data
- `Toggle Theme` — switch light/dark (persisted)
- `Add Project` — open add modal
- `History` — open activity log

---

## Connectivity Banner

Best‑effort local connectivity check pings public DNS endpoints:

- `https://dns.google`
- `https://8.8.8.8`
- `https://8.8.4.4`

If all checks fail, a banner appears and `connection-lost` is added to `<body>`.

---

## Data Format (projects.json)

Each project:

```json
[
  {
    "name": "Project A",
    "url": "https://example.com",
    "fieldNames": {
      "1": "Owner",
      "2": "Status",
      "3": "Date",
      "4": "Phone"
    },
    "fields": {
      "1": "John Doe",
      "2": "In Progress",
      "3": "2025-05-23",
      "4": "050-67867868"
    }
  }
]
```

Notes:
- Keys inside `fieldNames` and `fields` are the strings "1"–"4".
- `url` is optional; leave empty if not applicable.

---

## Synthetic Monitoring (Always On)

Every project ships with a `monitor` object and the dashboard now exposes it by default. The edit modal provides Login / Tests / Schedule tabs, cards render URL and test status lights, and the `Run Now` action executes the configured flow on demand. Results are stored in `project.monitor.state` (overall verdict, per-test code/error, timestamps) and persisted to `localStorage`/exports. No network traffic occurs unless you trigger Run Now (or, in future slices, enable the scheduler).

Default structure:

```json
"monitor": {
  "baseUrl": "",
  "login": {
    "enabled": false,
    "path": "/auth/login",
    "method": "POST",
    "username": "",
    "password": "",
    "bodyTemplate": "{\"user\":\"${username}\",\"password\":\"${password}\"}",
    "tokenLocation": "json:token",
    "tokenHeaderName": "Authorization",
    "tokenPrefix": "Bearer ",
    "persistPassword": true
  },
  "tests": [],
  "schedule": {
    "enabled": false,
    "intervalSec": 300
  },
  "state": {
    "lastRunAt": null,
    "overall": "unknown",
    "tests": {},
    "failures": [],
    "tokenStoredAt": null,
    "lastCreatedId": null
  }
}
```

Notes:
- Login placeholders allow `${username}`, `${password}`, `${token}`, `${timestamp}`, `${random}`, `${lastCreatedId}`.
- Tests can chain requests (e.g. POST -> DELETE) and assert expected status codes.
- Credentials/live responses stay in the browser only; avoid production secrets.
- Scheduler remains opt-in per project (default disabled) and will be delivered in Slice 7.

---
## Security & Hardening

The app treats all dynamic content as untrusted and escapes it before injecting into the DOM.

- `escapeHTML(str)` sanitizes `& < > " '` before `innerHTML`/attribute injection
- `truncateText` returns escaped text to minimize missed call‑sites
- Edit modal inputs (`value=…`) are sanitized before templating
- History modal uses escaped `date`, `type`, `description`
- Card title (`title`) is set via DOM API post‑render to avoid broken HTML

See `SECURITY.md` for detailed guidance and manual XSS test ideas.

---

## Connectivity & Status Limitations

- Project link status and the connectivity banner use `fetch(..., { method: "HEAD", mode: "no-cors" })`.
- In browsers, a `no-cors` response is opaque; you cannot read the real status code.
- Current behavior may mark an opaque response as “up”. For production‑grade checks, consider:
  - A small server-side proxy that performs the request and returns a real status code
  - Or marking opaque results as "unknown" rather than "up"

---

## Theming & Customization

- Colors are controlled via CSS Custom Properties in `styles.css`.
- Dark mode is applied by adding `.dark` to `<body>`.
- You can adjust card borders, button colors, and animations without changing JS.

---

## Manual Test Checklist

- Initial load: Cards load from `projects.json` and persist to `localStorage`
- XSS hardening: Add/Edit fields with `<script>…</script>`, `<img onerror=…>` and quotes — should render as plain text
- Edit/Save: Changes reflect on cards and in `localStorage`; history logs the action
- Delete: Removes the card and appends a history entry
- Download JSON: File contents match the current data
- Dark mode: Preference persists after reload

---

## Development Notes

- No external dependencies, just static files
- RTL and Hebrew UI text; CSS custom properties with a `.dark` theme override
- Keep DOM updates safe (prefer `textContent`/`setAttribute`, or escape before templating)

---

## Recent Progress

- Slice 3: introduced the monitor tabs skeleton (initially gated for testing) with ARIA-safe navigation.
- Slice 4: delivered read-only bindings for API/Auth, Tests, Schedule; responsive helpers and WeakMap-based tab management.
- Slice 5: wired the edit-mode toggle, validation, and tests CRUD; persist changes into each project's `monitor`.
- Slice 6: enabled manual Run Now execution, toast feedback, and removed the `enableMonitorUI` flag so the monitor is always on by default.
