# Where Is Al

A website for tracking Al's Appalachian Trail thru-hike adventure. Deployed at [whereisal.com](https://whereisal.com).

## Features

- Password-protected access (server-side authentication via Cloudflare Worker)
- Live map (Garmin inReach MapShare integration)
- Trail statistics dashboard (miles completed, daily distance, pace, estimated finish)
- Weather forecast at Al's current location
- Elevation profile by day
- Captain's Log with dispatches from the trail
- Responsive design

## Architecture

- **Frontend:** Vanilla JavaScript (no build step), deployed to GitHub Pages
- **Backend:** Cloudflare Worker that handles authentication and aggregates data from Garmin inReach, weather APIs, and KV storage

## File Structure

```
Where-is-Al/
├── index.html              # Password gate entry point
├── main.html               # Main content page (protected)
├── css/
│   └── style.css           # Main stylesheet
├── js/
│   ├── utils.js            # Shared utilities (DOM ready, config, VisibilityManager)
│   ├── config.js           # Centralized configuration
│   ├── api-client.js       # API client with auth, dedup, backoff
│   ├── date-utils.js       # Date formatting utilities
│   ├── chart-utils.js      # Chart.js configuration helpers
│   ├── password.js          # Login page password validation
│   ├── stats.js            # Trail statistics module
│   ├── weather.js          # Weather display module
│   ├── elevation.js        # Elevation profile module
│   ├── map.js              # Garmin MapShare integration
│   └── log-loader.js       # Loads log entries from manifest
├── log-entries/
│   ├── manifest.json       # List of log entry filenames
│   └── *.html              # Individual log entry files
├── assets/                 # Images and media
├── scripts/
│   └── build-trail-data.js # Generates at-trail-with-miles.js (fetches DEM elevation from Open-Meteo)
├── worker/                 # Cloudflare Worker backend
│   ├── src/                # Worker ES modules
│   ├── wrangler.toml       # Worker configuration
│   └── package.json        # Worker dependencies
├── .nojekyll               # GitHub Pages configuration
├── CNAME                   # Custom domain (whereisal.com)
└── CLAUDE.md               # AI assistant instructions
```

## Development

### Local Setup

```bash
npm install
cd worker && npm install
cp worker/.dev.vars.example worker/.dev.vars  # Fill in values
npm run dev                                    # Frontend on :3000, worker on :8788
```

### Commands

```bash
npm run dev              # Run both frontend and worker locally
npm run dev:frontend     # Frontend only (lite-server on :3000)
npm run dev:worker       # Worker only (wrangler dev on :8788)
npm run deploy:worker    # Deploy worker to Cloudflare
node scripts/build-trail-data.js  # Regenerate AT trail data with DEM elevation
```

`js/config.js` auto-detects `localhost` and points API calls to the local worker.

### Add Log Entries

1. Create an HTML file in `log-entries/` (e.g., `2024-05-01.html`)
2. Use the log entry structure:
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
3. Add the filename to `log-entries/manifest.json` (newest first)

### Change Password

Password validation is server-side in the Cloudflare Worker:
```bash
cd worker && npx wrangler secret put SITE_PASSWORD
```

### Configure Garmin MapShare

Edit `js/map.js` and set `mapShareUrl`:
```javascript
mapShareUrl: "https://share.garmin.com/YourMapShareName"
```

## Deployment

- **Frontend:** Auto-deploys to GitHub Pages from the `main` branch. No build step.
- **Worker:** Deploy with `npm run deploy:worker` (requires `npx wrangler login`).
