import { getCorsHeaders } from './cors.js';

export function createErrorResponse(status, message, request, additionalHeaders = {}) {
  return new Response(JSON.stringify({
    success: false,
    error: message
  }), {
    status: status,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(request),
      ...additionalHeaders
    }
  });
}

export function createSuccessResponse(data, request, additionalHeaders = {}) {
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(request),
      ...additionalHeaders
    }
  });
}
