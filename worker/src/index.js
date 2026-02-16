import { getCorsHeaders } from './cors.js';
import { createErrorResponse } from './responses.js';
import { requireAuth, handleAuth } from './auth.js';
import { handleStats, handleSync } from './handlers.js';
import { handleElevation } from './elevation.js';
import { handlePoints } from './points-handler.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: getCorsHeaders(request)
      });
    }

    // Handle authentication endpoint (public, no token required)
    if (url.pathname === '/auth' && request.method === 'POST') {
      return handleAuth(request, env);
    }

    // Handle sync endpoint (requires authentication)
    if (url.pathname === '/sync' && request.method === 'GET') {
      const authError = await requireAuth(request, env);
      if (authError) return authError;
      return handleSync(request, env);
    }

    // Handle points endpoint (requires authentication)
    if (url.pathname === '/points' && request.method === 'GET') {
      const authError = await requireAuth(request, env);
      if (authError) return authError;
      return handlePoints(request, env, ctx);
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
      return handleStats(request, env, ctx);
    }

    // 404 for unknown routes
    return createErrorResponse(404, 'Not Found', request);
  },
};
