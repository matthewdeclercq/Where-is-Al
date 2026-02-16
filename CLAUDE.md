# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"Where Is Al" is a static website that tracks a thru-hiker's progress on the Appalachian Trail. It features password-protected access, real-time trail stats, weather, elevation profiles, and a captain's log. The site is deployed to GitHub Pages (whereisal.com) and integrates with a Cloudflare Worker backend for authentication and API aggregation.

## Architecture

### Frontend Structure

This is a **vanilla JavaScript application** with no build process. All JavaScript modules use IIFEs (Immediately Invoked Function Expressions) to create isolated scopes and export to the global window object. The architecture follows a modular pattern with shared utilities.

**Critical: Script Loading Order**

The scripts MUST be loaded in this specific order (see main.html lines 258-283):

1. `utils.js` - Shared utilities (DOM ready helper, config getter, VisibilityManager)
2. `config.js` - Centralized configuration
3. `api-client.js` - Shared API client with authentication
4. `date-utils.js` - Date formatting utilities
5. `chart-utils.js` - Chart.js configuration helpers
6. Auth check (inline script) - Protects the page
7. Feature modules (`log-loader.js`, `map.js`, `stats.js`, `weather.js`, `elevation.js`)

Breaking this order will cause runtime errors as modules depend on earlier scripts.

### Module Pattern

Each feature module (stats, weather, elevation, map) follows this pattern:

```javascript
(function() {
    'use strict';

    // 1. Configuration using Utils.getConfig()
    const Config = { /* ... */ };

    // 2. Module-specific state object (passed to ApiClient)
    const state = {
        refreshIntervalId: null,
        isLoading: false,
        errorCount: 0,
        backoffDelay: 0
    };

    // 3. Fetch function using window.ApiClient.fetch()
    async function fetchData() {
        await window.ApiClient.fetch(url, options, callbacks, state);
    }

    // 4. Visibility change handler using ApiClient.handleVisibilityChange()
    function handleVisibilityChange() {
        window.ApiClient.handleVisibilityChange(fetchData, setupAutoRefresh, state);
    }

    // 5. Initialize on DOM ready using Utils.ready()
    Utils.ready(initializeModule);

    // 6. Register visibility handler with Utils.VisibilityManager
    Utils.VisibilityManager.register(handleVisibilityChange);
})();
```

### Authentication & API Integration

**Authentication Flow:**
1. User enters password on `index.html`
2. Password sent to Cloudflare Worker's `/auth` endpoint
3. Worker validates and returns JWT token + expiry timestamp
4. Token stored in `sessionStorage` (NOT localStorage for security)
5. `main.html` has inline auth check (lines 264-277) that validates token before page loads
6. All API requests include `Authorization: Bearer ${token}` header via `ApiClient`

**Cloudflare Worker Integration:**
- Worker URL configured in `js/config.js` (`Config.workerUrl`)
- Worker aggregates data from multiple sources (Garmin inReach, weather APIs, etc.)
- Endpoints: `/auth`, `/` (stats), `/elevation`, `/elevation?day=YYYY-MM-DD`

### API Client Pattern

`js/api-client.js` provides centralized API access with:

**Request Deduplication:**
- Concurrent requests to the same URL are deduplicated
- First request creates a promise; subsequent requests attach callbacks to it
- This prevents redundant API calls when multiple components initialize simultaneously

**Exponential Backoff:**
- Failed requests trigger exponential backoff: 1s, 2s, 4s, 8s, ..., up to 5 min
- Backoff state tracked per module via the `state` object
- Successful requests reset `errorCount` and `backoffDelay`

**Visibility-Aware Polling:**
- Modules pause polling when page is hidden (`document.hidden`)
- Resume polling + immediate fetch when page becomes visible
- Coordinated through `Utils.VisibilityManager` (single event listener)

**Usage:**
```javascript
await ApiClient.fetch(
    url,
    { method: 'GET' },
    {
        onSuccess: (data) => { /* handle data */ },
        onError: (error) => { /* handle error */ }
    },
    state  // Module's state object
);
```

### Configuration Management

`js/config.js` exports `window.Config` with:
- `workerUrl` - Cloudflare Worker endpoint
- `refreshIntervals` - Refresh rates for stats, weather, map
- `backoff` - Exponential backoff parameters
- `auth` - Max attempts, lockout time
- `requestTimeout` - API timeout (30s default)

Modules use `Utils.getConfig(path, defaultValue)` to safely access nested config:
```javascript
const refreshInterval = Utils.getConfig('refreshIntervals.weather', 3600000);
```

### Chart.js Integration

Weather and elevation modules use Chart.js for visualizations:

**Shared Chart Utilities (`js/chart-utils.js`):**
- `createBaseChartOptions()` - Common chart configuration
- `createPointStyling()` - Highlight specific points (e.g., "Today")
- Handles responsive design (mobile vs desktop aspect ratios)

**Chart Lifecycle:**
- Charts created on first data load
- Subsequent updates call `chart.update()` instead of recreating
- Charts destroyed in cleanup functions (`window.addEventListener('beforeunload', cleanup)`)

**Weather Chart Plugin:**
- Custom Chart.js plugin renders weather icons below x-axis
- Icons positioned using absolute positioning relative to chart container
- Plugin re-renders icons on chart update

### Garmin MapShare Integration

`js/map.js` embeds Garmin inReach MapShare as an iframe:
- `MapConfig.mapShareUrl` - Set to Garmin MapShare URL or null for placeholder
- Map refreshes every 30 minutes (configurable)
- Shows placeholder if MapShareUrl not configured

## Common Development Tasks

### Adding a Log Entry

1. Create `log-entries/YYYY-MM-DD.html` with this structure:
```html
<div class="log-entry">
    <div class="log-entry-header">
        <h3 class="log-entry-title">Title</h3>
        <div class="log-entry-meta">
            <span class="log-entry-date">May 1, 2024</span>
            <span class="log-entry-location">Location</span>
        </div>
    </div>
    <div class="log-entry-content">
        <p>Content here...</p>
    </div>
</div>
```

2. Add filename to `log-entries/manifest.json` (newest first)

### Configuring Garmin MapShare

Edit `js/map.js` line 10:
```javascript
mapShareUrl: "https://share.garmin.com/YourMapShareName"
```

### Changing the Password

Password validation happens server-side in the Cloudflare Worker. Update via `npx wrangler secret put SITE_PASSWORD` in the `worker/` directory.

### Development Commands

```bash
npm run dev              # Run both frontend and worker locally
npm run dev:frontend     # Frontend only (lite-server on :3000)
npm run dev:worker       # Worker only (wrangler dev on :8788)
npm run deploy:worker    # Deploy worker to Cloudflare
```

**Local dev setup:**
1. `npm install` (root)
2. `cd worker && npm install`
3. Copy `worker/.dev.vars.example` to `worker/.dev.vars` and fill in values
4. `npm run dev` — frontend on `:3000`, worker on `:8788`

`js/config.js` auto-detects `localhost` and points API calls to the local worker (`http://localhost:8788/`). Production behavior is unchanged.

### Worker Structure

The Cloudflare Worker lives in `worker/` and is split into ES modules under `worker/src/`:

| File | Purpose |
|------|---------|
| `index.js` | Route dispatcher |
| `constants.js` | Shared constants |
| `cors.js` | CORS origin handling |
| `responses.js` | Response helpers |
| `utils.js` | Date helpers, KML URL builder, env validation, `groupPointsByDate`, `calculateCurrentDay` |
| `auth.js` | Token management and `/auth` handler |
| `kml.js` | KML parser |
| `geo.js` | Haversine distance |
| `stats.js` | Trail statistics calculator |
| `storage.js` | KV read/write, point merging |
| `weather.js` | Open-Meteo weather API |
| `elevation.js` | `/elevation` endpoint handlers |
| `handlers.js` | `/` and `/sync` endpoint handlers |
| `mock.js` | Mock data for demos |

Deployed via `npm run deploy:worker` (uses `wrangler deploy`).

## Important Patterns & Conventions

**Dependency Safety:**
- Script loading order in `main.html` guarantees `Utils`, `ChartUtils`, `DateUtils`, and `ApiClient` are available — call them directly without guards
- Only use `typeof` guards in modules that may load outside `main.html` (e.g., `password.js` on the login page)

**Visibility Management:**
- Use `Utils.VisibilityManager.register(handler)` for visibility changes
- Always unregister in cleanup: `Utils.VisibilityManager.unregister(handler)`
- Never add direct `visibilitychange` listeners (use VisibilityManager)

**Error Handling:**
- Log errors with module prefix: `console.error('[ModuleName] Error:', message)`
- Show user-friendly error messages in UI
- Don't throw errors in module initialization (fail gracefully)

**DOM Ready:**
- Use `Utils.ready(callback)` for DOM-dependent code

**Chart Responsiveness:**
- Use `Utils.debounce(handler, 200)` for resize handlers
- Update chart options for mobile (check `Utils.isMobile()`)
- Charts use different aspect ratios for mobile vs desktop

## Deployment

**Frontend:** Auto-deploys to GitHub Pages from the main branch. Key files:
- `.nojekyll` - Prevents Jekyll processing
- `CNAME` - Custom domain (whereisal.com)

No build step required - push and deploy is instant.

**Worker:** Deploy with `npm run deploy:worker` (or `cd worker && npx wrangler deploy`). Requires wrangler authentication (`npx wrangler login`).
