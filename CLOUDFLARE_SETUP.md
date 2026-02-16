# Cloudflare Worker Setup Guide

This guide walks you through setting up the Cloudflare Worker that powers the trail statistics backend.

## Prerequisites

- A Cloudflare account (sign up at [dash.cloudflare.com](https://dash.cloudflare.com) - free tier includes 100,000 requests/day)
- Node.js installed locally
- Your Garmin MapShare ID (from your Garmin Explore MapShare page)
- Trail start date and location coordinates

## Step 1: Install Dependencies

```bash
cd worker
npm install
```

This installs [Wrangler](https://developers.cloudflare.com/workers/wrangler/), the Cloudflare Workers CLI.

## Step 2: Authenticate with Cloudflare

```bash
npx wrangler login
```

This opens a browser window to authenticate with your Cloudflare account.

## Step 3: Create KV Namespace (Optional but Recommended)

To preserve historical trail data even if Garmin's feed has limited retention:

```bash
npx wrangler kv namespace create "TRAIL_HISTORY"
```

This will output a namespace ID. Add it to `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "TRAIL_HISTORY"
id = "your-kv-namespace-id-here"
```

**Note**: If you don't configure KV, the worker will still function but won't store historical data.

## Step 4: Configure Secrets

Set secrets that should not be in source control:

```bash
npx wrangler secret put SITE_PASSWORD
npx wrangler secret put MAPSHARE_PASSWORD  # Optional, if your MapShare is password-protected
```

## Step 5: Configure Environment Variables

Non-secret environment variables can be set in the Cloudflare dashboard under **Workers & Pages** > your worker > **Settings** > **Variables**, or via `wrangler.toml` `[vars]` section.

### Required Variables

| Variable Name | Example Value | Description |
|--------------|---------------|-------------|
| `MAPSHARE_ID` | `AlHiker` | Your Garmin MapShare ID (from the MapShare URL) |
| `START_DATE` | `2025-03-01` | Trail start date in YYYY-MM-DD format |
| `START_LAT` | `34.6269` | Starting latitude (Springer Mountain TH) |
| `START_LON` | `-84.1939` | Starting longitude (Springer Mountain TH) |

### Optional Variables

| Variable Name | Example Value | Description |
|--------------|---------------|-------------|
| `USE_MOCK_DATA` | `true` | Set to `'true'` to enable mock data mode for demos |

## Step 6: Deploy

```bash
npx wrangler deploy
```

Or from the repo root:

```bash
npm run deploy:worker
```

Your Worker will be available at:
```
https://where-is-al.your-subdomain.workers.dev/
```

## Step 7: Update Frontend Configuration

Edit `js/config.js` and update the `workerUrl` to match your deployed worker URL. The config auto-detects localhost for local development, so you only need to set the production URL.

### Password Authentication

The site uses server-side password validation for security:
- Password is stored in Cloudflare Worker secrets (never in client code)
- Authentication tokens are generated server-side and stored in sessionStorage
- Tokens expire after 24 hours
- Rate limiting: 5 attempts max, then 15-minute lockout
- Main page is protected and redirects to password page if not authenticated

## Local Development

1. Copy `.dev.vars.example` to `.dev.vars` and fill in your values:
   ```bash
   cp .dev.vars.example .dev.vars
   ```

2. Start the local worker:
   ```bash
   npx wrangler dev
   ```

   Or from the repo root (starts both frontend and worker):
   ```bash
   npm run dev
   ```

The local worker runs on `http://localhost:8787`. The frontend auto-detects localhost and points API calls there.

## Historical Data Storage

The worker automatically stores all GPS points from the Garmin feed in Cloudflare KV, organized by day. This provides several benefits:

- **Data Preservation**: Historical trail data is preserved even if Garmin's feed loses old points
- **Personal Records**: Enables calculation of records like longest day, average daily mileage, etc.
- **Complete History**: Full trail history available for analysis and visualization

### How It Works

- Points are stored daily: `points:YYYY-MM-DD` → JSON array of points for that day
- Points are automatically merged and deduplicated when new data arrives
- Stats are calculated from the complete historical dataset (KV + current KML feed)
- Storage happens asynchronously and doesn't block stats responses

### Manual Sync Endpoint

You can manually trigger a sync by calling the `/sync` endpoint (requires authentication).

### Storage Limits

- KV free tier: 100GB total storage, 25MB per value
- Daily point arrays typically stay well under 25MB
- Points are stored indefinitely (no automatic expiration)

## Worker File Structure

The worker is split into focused ES modules under `worker/src/`:

```
worker/
├── wrangler.toml         # Wrangler configuration
├── package.json          # Worker dependencies
├── .dev.vars.example     # Template for local dev secrets
└── src/
    ├── index.js          # Route dispatcher (entry point)
    ├── constants.js      # Shared constants
    ├── cors.js           # CORS origin handling
    ├── responses.js      # Response helpers
    ├── utils.js          # Date helpers, env validation
    ├── auth.js           # Authentication & token management
    ├── kml.js            # Garmin KML parser
    ├── geo.js            # Haversine distance calculation
    ├── stats.js          # Trail statistics calculator
    ├── storage.js        # KV storage (read/write/merge)
    ├── weather.js        # Open-Meteo weather API
    ├── elevation.js      # Elevation endpoint handlers
    ├── handlers.js       # Stats & sync endpoint handlers
    └── mock.js           # Mock data for demos
```

## Troubleshooting

### Worker Returns 500 Error

- **Check environment variables**: Ensure all required variables are set
- **Verify MapShare ID**: Make sure the ID matches your Garmin MapShare URL
- **Check MapShare access**: Ensure the MapShare is accessible (try the KML URL directly)
- **Check KV namespace**: If using historical storage, verify KV namespace is bound correctly

### Stats Not Updating on Frontend

- **Check Worker URL**: Verify `workerUrl` in `js/config.js` matches your Worker URL
- **Check browser console**: Look for CORS or fetch errors

### No Data Showing

- **Check KML feed**: Visit `https://share.garmin.com/Feed/Share/YOUR_MAPSHARE_ID` to verify data exists
- **Verify start date**: Points before the start date are filtered out
- **Check date format**: Start date must be YYYY-MM-DD format

### KV Storage Issues

- **KV namespace not bound**: Check that `TRAIL_HISTORY` is bound in `wrangler.toml`
- **Storage errors**: Check Worker logs for KV write errors (non-critical, won't block stats)
- **No historical data**: First run will only have current KML data; historical data accumulates over time

## Using Mock Data for Demos

For local development or demos without Garmin data, add `USE_MOCK_DATA=true` to your `.dev.vars` file, or set it as an environment variable in the Cloudflare dashboard.

Mock data includes:
- Trail progress (~15% complete, ~330 miles)
- Weather data for a location in Virginia on the AT
- 5-day weather forecast
- Elevation profiles
- All stats calculated based on your `START_DATE`

## Optional Enhancements

### Custom Domain

1. In Worker settings, go to **Triggers** > **Custom Domains**
2. Add your custom domain
3. Update DNS records as instructed

### Monitoring

1. Use **Workers & Pages** > **Analytics** to monitor:
   - Request count
   - Error rate
   - Response times
2. Set up alerts for high error rates

## Security Notes

- **CORS**: The Worker allows specific origins listed in `worker/src/cors.js`, plus any localhost origin for development
- **Secrets**: Always store passwords as wrangler secrets (`npx wrangler secret put`), not plaintext variables
- **Rate Limiting**: Cloudflare Workers free tier includes rate limiting automatically

## Support

If you encounter issues:
1. Check Worker logs: `npx wrangler tail`
2. Verify your Garmin MapShare is accessible
3. Test the Worker URL directly to see error messages
4. Review browser console for frontend errors
