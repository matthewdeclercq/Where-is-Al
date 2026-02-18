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

    // 5. Cleanup: clear interval, unregister visibility, destroy charts
    function cleanup() {
        window.ApiClient.cleanup(state);
        Utils.VisibilityManager.unregister(handleVisibilityChange);
    }

    // 6. Initialize on DOM ready using Utils.ready()
    Utils.ready(initializeModule);

    // 7. Register visibility handler and cleanup
    Utils.VisibilityManager.register(handleVisibilityChange);
    window.addEventListener('beforeunload', cleanup);
})();
```

### Authentication & API Integration

**Authentication Flow:**
1. User enters password on `index.html`
2. Password sent to Cloudflare Worker's `/auth` endpoint
3. Worker validates password (case-insensitive), enforces IP-based rate limiting (10 attempts per 15-min window tracked in KV as `ratelimit:auth:{ip}`)
4. On success, worker generates an opaque token (`btoa(JSON.stringify({id: uuid, expires: timestamp}))`), stores it in KV as `token:{token}` with a 24-hour TTL, and returns `{token, expires}`
5. Token stored in `sessionStorage` (NOT localStorage for security)
6. `main.html` has inline auth check (lines 264-277) that validates token before page loads
7. All API requests include `Authorization: Bearer ${token}` header via `ApiClient`
8. Worker validates token by looking it up in KV (not a JWT — server-side validation only)

**Cloudflare Worker Integration:**
- Worker URL configured in `js/config.js` (`Config.workerUrl`)
- Worker aggregates data from multiple sources (Garmin inReach, weather APIs, etc.)
- Endpoints: `/auth`, `/` (stats), `/points`, `/elevation`, `/elevation?day=YYYY-MM-DD`

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
- `refreshIntervals` - Refresh rates for stats, weather, map, elevation
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

### Leaflet Map Integration

`js/map.js` renders an interactive Leaflet map using OpenTopoMap tiles:
- Fetches GPS points from the `/points` endpoint and plots them on the AT trail
- Points are color-coded: on-trail (cyan `#06b6d4`), off-trail (orange `#f97316`)
- Current position shown as a yellow marker (`#facc15`)
- Full AT route drawn as a blue polyline from `at-trail-simplified.js` data
- Milestone markers loaded from the `/points` response
- Custom controls: fullscreen toggle and "fly to current location"
- Map refreshes every 30 minutes (configurable via `refreshIntervals.map`)

### Trail Distance & Elevation System

GPS pings are snapped to the known AT trail to get accurate distance and elevation:

**Pipeline (runs in `handlers.js` and `points-handler.js`):**
- `tagAndSnapPoints()` — Single-pass function in `trail-distance.js` that tags each point as on/off-trail AND snaps on-trail points to get `trailMile` + `trailElevation` in one loop over trail segments. Replaces the old two-pass `tagPointsOnOffTrail()` + `snapPointsToTrail()` calls, halving `projectToSegment()` invocations. Uses `DEFAULT_OFF_TRAIL_THRESHOLD_MILES` (0.25mi) from `constants.js` and includes an early-exit when `bestDist < 0.001` miles.

**Distance calculation (`stats.js`):**
- Total miles = highest `trailMile` among on-trail points (furthest progress)
- Daily miles = `max(trailMile) - min(trailMile)` per day
- Falls back to haversine sum if no trail mile data available

**Elevation (`stats.js`, `elevation.js`):**
- Prefers `trailElevation` (DEM-based, smooth) over GPS `elevation` (noisy)
- Falls back to GPS elevation for points without trail data
- `getElevation(point)` in `worker/src/utils.js` is the shared helper that implements this preference — use it instead of reading `.trailElevation` or `.elevation` directly

**Data generation:**
- `at-trail-with-miles.js` is generated by `scripts/build-trail-data.js`
- Format: `[[lon, lat, cumulativeMiles, elevationFt], ...]` (4,822 points)
- Cumulative miles scaled so endpoint = 2197.9 (official AT length)
- DEM elevation fetched from Open-Meteo Elevation API

**Stored fields per point in KV:** `lat`, `lon`, `time`, `velocity`, `elevation`, `onTrail`, `trailMile`, `trailElevation`

**KV key schema:**
| Key pattern | Contents |
|-------------|----------|
| `points:YYYY-MM-DD` | JSON array of serialized GPS points for that day |
| `meta:latest_timestamp` | ISO timestamp of the most recent stored ping |
| `cache:weather` | `{weather, timestamp}` — cached Open-Meteo response (12-hour TTL) |
| `cache:stats` | `{data, timestamp}` — cached stats response (60-second TTL) |
| `token:{token}` | `{expires}` — valid auth tokens (24-hour TTL) |
| `ratelimit:auth:{ip}` | `{count, resetAt}` — failed auth attempt counters (15-min window) |

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

### Changing the Password

Password validation happens server-side in the Cloudflare Worker. Update via `npx wrangler secret put SITE_PASSWORD` in the `worker/` directory.

### Development Commands

```bash
npm run dev              # Run both frontend and worker locally
npm run dev:frontend     # Frontend only (lite-server on :3000)
npm run dev:worker       # Worker only (wrangler dev on :8788)
npm run deploy:worker    # Deploy worker to Cloudflare
node scripts/build-trail-data.js   # Regenerate at-trail-with-miles.js (fetches elevation from Open-Meteo)
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
| `utils.js` | Date helpers, KML URL builder, env validation, `groupPointsByDate`, `calculateCurrentDay`, `getElevation` |
| `auth.js` | Token management and `/auth` handler |
| `kml.js` | KML parser |
| `geo.js` | Haversine distance, segment projection (`projectToSegment`) |
| `stats.js` | Trail statistics calculator (uses trail-mile deltas) |
| `storage.js` | KV read/write, point serialization (`serializePoint`); `deduplicateStationary()` collapses consecutive pings within 100ft into one annotated point (`stationaryPings`, `lastPingTime`) |
| `weather.js` | Open-Meteo weather API; `fetchWeatherCached()` wraps `fetchWeather()` with 12-hour KV cache; serves stale cache on error to prevent rate-limit spirals |
| `elevation.js` | `/elevation` endpoint handlers (prefers DEM elevation) |
| `handlers.js` | `/` and `/sync` endpoint handlers; stats response is KV-cached for 60s to avoid redundant trail computation |
| `points-handler.js` | `/points` endpoint handler |
| `mock.js` | Mock data for demos |
| `at-trail-simplified.js` | Simplified AT coordinates (4,822 pts) for on/off-trail detection |
| `at-trail-with-miles.js` | Generated: AT coordinates with cumulative miles + DEM elevation |
| `trail-proximity.js` | `distanceToTrail()`, `tagPointsOnOffTrail()` for on/off-trail tagging |
| `trail-distance.js` | `snapToTrail()`, `snapPointsToTrail()` for trail-mile snapping; `tagAndSnapPoints()` for combined single-pass tag+snap |

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
