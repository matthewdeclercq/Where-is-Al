# Cloudflare Worker Setup Guide

This guide walks you through setting up a Cloudflare Worker to calculate and serve trail statistics based on Garmin MapShare KML data.

## Prerequisites

- A Cloudflare account (sign up at [dash.cloudflare.com](https://dash.cloudflare.com) - free tier includes 100,000 requests/day)
- Your Garmin MapShare ID (from your Garmin Explore MapShare page)
- Trail start date and location coordinates

## Step 1: Create a Cloudflare Worker

1. Log in to your Cloudflare dashboard at [dash.cloudflare.com](https://dash.cloudflare.com)
2. Navigate to **Workers & Pages** > **Overview**
3. Click **Create application** > **Workers**
4. Name your worker (e.g., `at-trail-stats`)
5. Click **Deploy** (we'll add the code in the next step)

## Step 2: Add the Worker Code

1. In your Worker dashboard, click **Edit code** or **Quick edit**
2. Open the `worker.js` file from this repository
3. Copy the entire contents of `worker.js`
4. Paste it into the Cloudflare Workers editor, replacing the default code
5. Click **Save and deploy**

## Step 3: Create KV Namespace (Optional but Recommended)

To preserve historical trail data even if Garmin's feed has limited retention:

1. In your Cloudflare dashboard, navigate to **Workers & Pages** > **KV**
2. Click **Create a namespace**
3. Name it `trail-history` (or your preferred name)
4. Click **Add**
5. Note the namespace ID - you'll need it in the next step

## Step 4: Bind KV Namespace to Worker

1. In your Worker dashboard, go to **Settings** > **Variables**
2. Scroll down to **KV Namespace Bindings**
3. Click **Add binding**
4. Set:
   - **Variable name**: `TRAIL_HISTORY`
   - **KV namespace**: Select `trail-history` (or the namespace you created)
5. Click **Save**

**Note**: If you don't configure KV, the worker will still function but won't store historical data. Stats will be calculated only from the current Garmin feed.

## Step 5: Configure Environment Variables

1. In your Worker dashboard, go to **Settings** > **Variables**
2. Add the following environment variables:

### Required Variables (Plaintext)

| Variable Name | Example Value | Description |
|--------------|---------------|-------------|
| `MAPSHARE_ID` | `AlHiker` | Your Garmin MapShare ID (from the MapShare URL) |
| `START_DATE` | `2025-03-01` | Trail start date in YYYY-MM-DD format |
| `START_LAT` | `34.6269` | Starting latitude (Springer Mountain TH) |
| `START_LON` | `-84.1939` | Starting longitude (Springer Mountain TH) |
| `SITE_PASSWORD` | `your-password` | Password for accessing the site (stored securely on server) |

### Optional Variables (Plaintext)

| Variable Name | Example Value | Description |
|--------------|---------------|-------------|
| `USE_MOCK_DATA` | `true` | Set to `'true'` to enable mock data mode for demos (no Garmin data required) |

### Optional Variables (Secrets)

| Variable Name | Example Value | Description |
|--------------|---------------|-------------|
| `MAPSHARE_PASSWORD` | `your-password` | MapShare password if you've set one (click "Encrypt" when adding) |
| `SITE_PASSWORD` | `your-password` | **Recommended**: Store site password as encrypted secret for better security (click "Encrypt" when adding) |

### How to Add Variables

1. Under **Environment Variables**, click **Add variable**
2. Enter the variable name (e.g., `MAPSHARE_ID`)
3. Enter the value
4. For passwords, click **Encrypt** to store as a secret
5. Click **Save**

## Step 6: Get Your Worker URL

1. After deploying, your Worker will have a URL like:
   ```
   https://at-trail-stats.your-subdomain.workers.dev/
   ```
2. Copy this URL - you'll need it for the frontend configuration

## Step 7: Update Frontend Configuration

1. Open `js/stats.js` in your project
2. Find the `StatsConfig` object at the top
3. Update the `workerUrl` property with your Worker URL:
   ```javascript
   workerUrl: 'https://at-trail-stats.your-subdomain.workers.dev/',
   ```
4. The password authentication is already configured to use the same worker URL
5. Save the file

### Password Authentication

The site uses server-side password validation for security:
- Password is stored in Cloudflare Worker environment variables (never in client code)
- Authentication tokens are generated server-side and stored in sessionStorage
- Tokens expire after 24 hours
- Rate limiting: 5 attempts max, then 15-minute lockout
- Main page is protected and redirects to password page if not authenticated

## Step 8: Test the Worker

1. Visit your Worker URL directly in a browser
2. You should see JSON output with trail statistics, for example:
   ```json
   {
     "startDate": "3/1/2025",
     "totalMilesCompleted": "125.3",
     "milesRemaining": "2072.6",
     "dailyDistance": "8.5",
     "averageSpeed": "2.1",
     "currentDayOnTrail": 15,
     "estimatedFinishDate": "9/15/2025"
   }
   ```
3. If you see an error, check:
   - Environment variables are set correctly
   - MapShare ID is correct
   - MapShare is publicly accessible (or password is correct)

## Step 9: Test Frontend Integration

1. Open your website (`main.html`)
2. Check the browser console for any errors
3. The stats should automatically load and update the stat cards
4. Stats will refresh every hour automatically

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

You can manually trigger a sync by visiting:
```
https://your-worker.workers.dev/sync
```

This will:
- Fetch latest KML from Garmin
- Store all points in KV
- Return sync status and point counts

### Storage Limits

- KV free tier: 100GB total storage, 25MB per value
- Daily point arrays typically stay well under 25MB
- Points are stored indefinitely (no automatic expiration)

## Troubleshooting

### Worker Returns 500 Error

- **Check environment variables**: Ensure all required variables are set
- **Verify MapShare ID**: Make sure the ID matches your Garmin MapShare URL
- **Check MapShare access**: Ensure the MapShare is accessible (try the KML URL directly)
- **Check KV namespace**: If using historical storage, verify KV namespace is bound correctly

### Stats Not Updating on Frontend

- **Check Worker URL**: Verify `workerUrl` in `js/stats.js` matches your Worker URL
- **Check browser console**: Look for CORS or fetch errors
- **Verify CORS headers**: The Worker should include `Access-Control-Allow-Origin: *`

### No Data Showing

- **Check KML feed**: Visit `https://share.garmin.com/Feed/Share/YOUR_MAPSHARE_ID` to verify data exists
- **Verify start date**: Points before the start date are filtered out
- **Check date format**: Start date must be YYYY-MM-DD format

### KV Storage Issues

- **KV namespace not bound**: Check that `TRAIL_HISTORY` is bound in Worker settings
- **Storage errors**: Check Worker logs for KV write errors (non-critical, won't block stats)
- **No historical data**: First run will only have current KML data; historical data accumulates over time

## Using Mock Data for Demos

If you want to demo the site before you have access to Garmin MapShare data, you can enable mock data mode:

1. In your Worker dashboard, go to **Settings** > **Variables**
2. Add a new environment variable:
   - **Variable Name**: `USE_MOCK_DATA`
   - **Value**: `true`
   - Click **Save**
3. The worker will now return realistic mock trail statistics and weather data
4. Mock data includes:
   - Trail progress (~15% complete, ~330 miles)
   - Weather data for a location in Virginia on the AT
   - 5-day weather forecast
   - All stats calculated based on your `START_DATE`

**Note**: When `USE_MOCK_DATA` is set to `'true'`, the worker will skip fetching Garmin KML data entirely and return mock data immediately. This is perfect for demos and development.

## Optional Enhancements

### Custom Domain

1. In Worker settings, go to **Triggers** > **Custom Domains**
2. Add your custom domain
3. Update DNS records as instructed

### Caching

To reduce load on Garmin's servers, you can add caching:

1. In Cloudflare dashboard, go to **Rules** > **Cache Rules**
2. Create a rule to cache Worker responses for 5-10 minutes
3. This reduces API calls while keeping stats reasonably fresh

### Monitoring

1. Use **Workers & Pages** > **Analytics** to monitor:
   - Request count
   - Error rate
   - Response times
2. Set up alerts for high error rates

## Security Notes

- **CORS**: The Worker currently allows all origins (`*`). For production, consider restricting to your domain:
  ```javascript
  'Access-Control-Allow-Origin': 'https://yourdomain.com'
  ```
- **Secrets**: Always store passwords as encrypted secrets, not plaintext variables
- **Rate Limiting**: Cloudflare Workers free tier includes rate limiting automatically

## Support

If you encounter issues:
1. Check Cloudflare Workers logs in the dashboard
2. Verify your Garmin MapShare is accessible
3. Test the Worker URL directly to see error messages
4. Review browser console for frontend errors
