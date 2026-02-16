import { TOKEN_EXPIRY_MS } from './constants.js';
import { createErrorResponse, createSuccessResponse } from './responses.js';

// Decode token from base64 JSON format
function decodeToken(token) {
  try {
    return JSON.parse(atob(token));
  } catch (error) {
    return null;
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
    // Try KV-based validation first (more secure, allows revocation)
    if (env.TRAIL_HISTORY) {
      const tokenData = await env.TRAIL_HISTORY.get(`token:${token}`);
      if (tokenData) {
        const { expires } = JSON.parse(tokenData);
        if (Date.now() < expires) {
          return true;
        } else {
          await env.TRAIL_HISTORY.delete(`token:${token}`);
          return false;
        }
      }
    }

    // Fallback: decode token to check expiry
    const decoded = decodeToken(token);
    if (!decoded || !decoded.expires) {
      return false;
    }

    return Date.now() < decoded.expires;
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

    if (password.toLowerCase() === CORRECT_PASSWORD) {
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

    return createErrorResponse(401, 'Invalid password', request, {
      'Cache-Control': 'no-cache'
    });
  } catch (error) {
    return createErrorResponse(400, 'Invalid request format', request);
  }
}
