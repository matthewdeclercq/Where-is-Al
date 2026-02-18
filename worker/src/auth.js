import { TOKEN_EXPIRY_MS } from './constants.js';
import { createErrorResponse, createSuccessResponse } from './responses.js';

const AUTH_RATE_LIMIT = {
  maxAttempts: 10,
  windowMs: 15 * 60 * 1000, // 15 minutes
};

async function checkRateLimit(ip, env) {
  if (!env.TRAIL_HISTORY || !ip) return { limited: false };
  try {
    const data = await env.TRAIL_HISTORY.get(`ratelimit:auth:${ip}`);
    if (!data) return { limited: false };
    const { count, resetAt } = JSON.parse(data);
    if (Date.now() >= resetAt) return { limited: false };
    if (count >= AUTH_RATE_LIMIT.maxAttempts) {
      return { limited: true, retryAfter: Math.ceil((resetAt - Date.now()) / 1000) };
    }
  } catch (error) {
    console.error('[Auth] Failed to check rate limit:', error);
  }
  return { limited: false };
}

async function recordFailedAttempt(ip, env) {
  if (!env.TRAIL_HISTORY || !ip) return;
  const key = `ratelimit:auth:${ip}`;
  try {
    const now = Date.now();
    let count = 1;
    let resetAt = now + AUTH_RATE_LIMIT.windowMs;
    const existing = await env.TRAIL_HISTORY.get(key);
    if (existing) {
      const d = JSON.parse(existing);
      if (now < d.resetAt) { count = d.count + 1; resetAt = d.resetAt; }
    }
    await env.TRAIL_HISTORY.put(key, JSON.stringify({ count, resetAt }), {
      expirationTtl: Math.ceil((resetAt - now) / 1000)
    });
  } catch (error) {
    console.error('[Auth] Failed to record failed attempt:', error);
  }
}

async function clearRateLimit(ip, env) {
  if (!env.TRAIL_HISTORY || !ip) return;
  try {
    await env.TRAIL_HISTORY.delete(`ratelimit:auth:${ip}`);
  } catch (error) {
    console.error('[Auth] Failed to clear rate limit:', error);
  }
}

/**
 * Validate authentication token
 */
export async function validateToken(token, env) {
  if (!token) {
    return false;
  }

  try {
    if (!env.TRAIL_HISTORY) return false;
    const tokenData = await env.TRAIL_HISTORY.get(`token:${token}`);
    if (!tokenData) return false;
    const { expires } = JSON.parse(tokenData);
    if (Date.now() < expires) return true;
    await env.TRAIL_HISTORY.delete(`token:${token}`);
    return false;
  } catch (error) {
    console.error('[Worker] Token validation error:', error);
    return false;
  }
}

/**
 * Authentication middleware - extracts and validates token from request
 */
export async function requireAuth(request, env) {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader ? authHeader.replace('Bearer ', '') : null;

  if (!token || !(await validateToken(token, env))) {
    return createErrorResponse(401, 'Unauthorized - Invalid or missing token', request);
  }

  return null;
}

// Store authentication token
export async function storeToken(token, expires, env) {
  if (env.TRAIL_HISTORY) {
    try {
      await env.TRAIL_HISTORY.put(
        `token:${token}`,
        JSON.stringify({ expires }),
        { expirationTtl: Math.floor((expires - Date.now()) / 1000) }
      );
    } catch (error) {
      console.error('[Worker] Failed to store token in KV:', error);
    }
  }
}

// Authentication handler
export async function handleAuth(request, env) {
  try {
    const body = await request.json();
    if (!body || typeof body.password !== 'string') {
      return createErrorResponse(400, 'Invalid request: password field is required and must be a string', request);
    }

    const { password } = body;
    const CORRECT_PASSWORD = env.SITE_PASSWORD;

    if (!CORRECT_PASSWORD) {
      return createErrorResponse(500, 'Authentication not configured', request);
    }

    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || null;
    const rateLimit = await checkRateLimit(ip, env);
    if (rateLimit.limited) {
      return createErrorResponse(429, 'Too many attempts. Please try again later.', request, {
        'Retry-After': rateLimit.retryAfter.toString(),
        'Cache-Control': 'no-cache'
      });
    }

    // to lower case is intentional and not a security risk
    if (password.toLowerCase() === CORRECT_PASSWORD) {
      await clearRateLimit(ip, env);

      const tokenId = crypto.randomUUID();
      const expiry = Date.now() + TOKEN_EXPIRY_MS;
      const tokenData = { id: tokenId, expires: expiry };
      const token = btoa(JSON.stringify(tokenData));

      await storeToken(token, expiry, env);

      return createSuccessResponse({
        success: true,
        token: token,
        expires: expiry
      }, request, {
        'Cache-Control': 'no-cache'
      });
    }

    await recordFailedAttempt(ip, env);
    return createErrorResponse(401, 'Invalid password', request, {
      'Cache-Control': 'no-cache'
    });
  } catch (error) {
    return createErrorResponse(400, 'Invalid request format', request);
  }
}
