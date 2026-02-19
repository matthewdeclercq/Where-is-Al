import { getCorsHeaders } from './cors.js';
import { createErrorResponse } from './responses.js';
import { requireAuth, handleAuth } from './auth.js';
import { handleStats, handleSync } from './handlers.js';
import { handleElevation } from './elevation.js';
import { handlePoints } from './points-handler.js';
import { buildKmlUrl, buildKmlFetchOptions } from './utils.js';
import { parseKmlPoints } from './kml.js';
import { storePointsByDay } from './storage.js';

export default {
  async scheduled(event, env, ctx) {
    const MAPSHARE_ID = env.MAPSHARE_ID;
    const MAPSHARE_PASSWORD = env.MAPSHARE_PASSWORD || '';
    const START_DATE_STR = env.START_DATE;

    if (!MAPSHARE_ID || !START_DATE_STR || !env.TRAIL_HISTORY) {
      console.error('[Cron] Missing required env vars (MAPSHARE_ID, START_DATE, or TRAIL_HISTORY KV)');
      return;
    }

    try {
      const kmlUrl = buildKmlUrl(MAPSHARE_ID);
      const kmlFetchOptions = buildKmlFetchOptions(MAPSHARE_PASSWORD);

      const kmlResponse = await fetch(kmlUrl, kmlFetchOptions);
      if (!kmlResponse.ok) {
        console.error(`[Cron] KML fetch failed with status ${kmlResponse.status}`);
        return;
      }

      const kmlText = await kmlResponse.text();
      const kmlPoints = parseKmlPoints(kmlText, new Date(START_DATE_STR));

      if (kmlPoints.length === 0) {
        console.log('[Cron] No new points from KML feed');
        return;
      }

      await storePointsByDay(kmlPoints, env);
      console.log(`[Cron] Stored ${kmlPoints.length} points from KML feed`);
    } catch (error) {
      console.error('[Cron] Error:', error.message);
    }
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: getCorsHeaders(request)
      });
    }

    // Geo-restrict to US and Canada
    const country = request.cf?.country;
    if (country && country !== 'US' && country !== 'CA') {
      return createErrorResponse(403, 'Access restricted', request);
    }

    // Handle authentication endpoint (public, no token required)
    if (url.pathname === '/auth' && request.method === 'POST') {
      return handleAuth(request, env);
    }

    // Handle sync endpoint (requires authentication)
    if (url.pathname === '/sync' && request.method === 'POST') {
      const authError = await requireAuth(request, env);
      if (authError) return authError;
      return handleSync(request, env);
    }

    // Handle points endpoint (requires authentication)
    if (url.pathname === '/points' && request.method === 'GET') {
      const authError = await requireAuth(request, env);
      if (authError) return authError;
      return handlePoints(request, env);
    }

    // Handle elevation endpoint (requires authentication)
    if (url.pathname === '/elevation' && request.method === 'GET') {
      const authError = await requireAuth(request, env);
      if (authError) return authError;
      return handleElevation(request, env);
    }

    // Handle stats endpoint (requires authentication)
    if (url.pathname === '/' && request.method === 'GET') {
      const authError = await requireAuth(request, env);
      if (authError) return authError;
      return handleStats(request, env);
    }

    // 404 for unknown routes
    return createErrorResponse(404, 'Not Found', request);
  },
};
