import { AuthError } from './auth-service.mjs';

export const SESSION_COOKIE = 'sana_session';

export function sessionToken(request) {
  const cookies = String(request.headers.cookie || '').split(';');
  for (const cookie of cookies) {
    const separator = cookie.indexOf('=');
    if (separator < 0 || cookie.slice(0, separator).trim() !== SESSION_COOKIE) continue;
    try { return decodeURIComponent(cookie.slice(separator + 1).trim()); } catch { return ''; }
  }
  return '';
}

function sessionCookie(token, { secure, maxAgeSeconds }) {
  const parts = [`${SESSION_COOKIE}=${encodeURIComponent(token)}`, 'HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export async function handleAuthRequest({ request, response, pathname, service, readJson, sendJson, production = false }) {
  if (!pathname.startsWith('/api/auth/')) return false;
  const token = sessionToken(request);
  if (pathname === '/api/auth/register' && request.method === 'POST') {
    const result = await service.register(await readJson(request));
    response.setHeader('Set-Cookie', sessionCookie(result.token, { secure: production, maxAgeSeconds: (result.expiresAt - Date.now()) / 1000 }));
    sendJson(response, 201, { user: result.user });
    return true;
  }
  if (pathname === '/api/auth/login' && request.method === 'POST') {
    const result = await service.login(await readJson(request));
    response.setHeader('Set-Cookie', sessionCookie(result.token, { secure: production, maxAgeSeconds: (result.expiresAt - Date.now()) / 1000 }));
    sendJson(response, 200, { user: result.user });
    return true;
  }
  if (pathname === '/api/auth/logout' && request.method === 'POST') {
    if (!service.logout(token)) throw new AuthError(401, 'Требуется вход в аккаунт.');
    response.setHeader('Set-Cookie', sessionCookie('', { secure: production, maxAgeSeconds: 0 }));
    sendJson(response, 200, { user: null });
    return true;
  }
  if (pathname === '/api/auth/me' && request.method === 'GET') {
    const user = service.userForToken(token);
    if (!user && token) response.setHeader('Set-Cookie', sessionCookie('', { secure: production, maxAgeSeconds: 0 }));
    sendJson(response, 200, { user });
    return true;
  }
  if (pathname === '/api/auth/profile' && request.method === 'PUT') {
    sendJson(response, 200, { user: service.updateProfile(token, await readJson(request)) });
    return true;
  }
  const knownPath = ['/api/auth/register', '/api/auth/login', '/api/auth/logout', '/api/auth/me', '/api/auth/profile'].includes(pathname);
  throw new AuthError(knownPath ? 405 : 404, knownPath ? 'Method not allowed' : 'Not found');
}
