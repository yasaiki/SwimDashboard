# Swim Progress V2

This version separates swimmer data, goals, standards, presentation, and application logic so the project can grow without expanding one large HTML file.

## Run locally

Because browsers block `fetch()` from `file://` pages, serve this folder over HTTP.

### Windows
Double-click `serve.bat`, then open:

`http://localhost:8000`

### macOS / Linux
From this folder run:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Main structure

- `index.html` — swimmer directory / landing page
- `dashboard.html?swimmer=<id>` — selected swimmer dashboard
- `data/swimmers.json` — lightweight swimmer directory
- `data/swimmers/<id>.json` — one swimmer profile + results per file
- `data/goals/<id>.json` — swimmer-specific goals
- `data/standards/usa-2024-2028.json` — standards/reference data
- `js/data-service.js` — single data loading boundary; later this can call an API instead of JSON
- `js/dashboard.js` — dashboard controller and rendering
- `js/charts.js` — Chart.js rendering
- `js/standards.js` — standards lookup/evaluation
- `js/utils.js` — common data helpers
- `css/styles.css` — all visual styles

## Add a swimmer

1. Create `data/swimmers/<new-id>.json` using an existing swimmer file as the schema.
2. Create `data/goals/<new-id>.json`.
3. Add the swimmer to `data/swimmers.json` with their `dataFile` path.
4. Refresh the landing page. No dashboard HTML edits are required.

## Birth dates

The supplied source data contains ages but not birth dates, so the migrated profiles keep `currentAge` and set `birthDate` to `null`. If you add a real `birthDate` in `YYYY-MM-DD` format, the app automatically calculates current age and uses it ahead of `currentAge`.

## Normalized result schema

Each migrated swim result now includes:

- a stable `id`
- a `meetId`
- numeric `distance`
- explicit `course` (`SCY` or `SCM`)
- `legacyDistance` for traceability to the old `50Y` / `50M` representation

The old dashboard treated all yard results as SCY and all meter results as SCM; this migration preserves that behavior. Future data can explicitly identify another course if needed.

## Future API migration

Components do not fetch JSON directly. All loading goes through `js/data-service.js`. When you later add a backend/database, replace those loader functions with API requests while leaving the dashboard and chart modules largely unchanged.
