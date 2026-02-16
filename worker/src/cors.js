export const ALLOWED_ORIGINS = [
  'https://where-is-al.matthew-declercq.pages.dev',
  'https://whereisal.com',
  'http://localhost:3000',
  'http://localhost:8000',
  'http://127.0.0.1:3000',
];

export function getCorsOrigin(request) {
  const origin = request.headers.get('Origin');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return origin;
  }
  // For development: allow any localhost origin
  if (origin && (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'))) {
    return origin;
  }
  return ALLOWED_ORIGINS[0];
}

export function getCorsHeaders(request) {
  return {
    'Access-Control-Allow-Origin': getCorsOrigin(request),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
}
