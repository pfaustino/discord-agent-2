// Google Calendar OAuth for the dashboard "Connect" button.
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, PUBLIC_URL } from '../config.js';
import { createBoundState, readBoundState } from '../web/auth.js';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

// Full calendar access — the connected account is the bot owner's calendar.
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';

export class GoogleOAuthError extends Error {}

export function googleCalendarConfigured() {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

export function redirectUri(req) {
  if (PUBLIC_URL) return `${PUBLIC_URL.replace(/\/$/, '')}/api/calendar/callback`;
  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host || 'localhost';
  const proto = req?.headers?.['x-forwarded-proto'] || (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}/api/calendar/callback`;
}

export function authorizeUrl(req, guildId) {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(req),
    response_type: 'code',
    scope: CALENDAR_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state: createBoundState(`calendar:${guildId}`),
  });
  return `${AUTHORIZE_URL}?${params}`;
}

export function guildIdFromState(state) {
  const binding = readBoundState(state);
  if (!binding?.startsWith('calendar:')) return null;
  return binding.slice('calendar:'.length) || null;
}

export async function exchangeCode(code, req) {
  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(req),
    }),
  });
  if (!resp.ok) {
    throw new GoogleOAuthError(`token exchange failed (${resp.status}): ${(await resp.text()).slice(0, 200)}`);
  }
  const data = await resp.json();
  if (!data?.refresh_token) {
    throw new GoogleOAuthError('Google did not return a refresh token — revoke app access at myaccount.google.com/permissions and try Connect again');
  }
  return data;
}

export async function refreshAccessToken(refreshToken) {
  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  if (!resp.ok) {
    throw new GoogleOAuthError(`token refresh failed (${resp.status}): ${(await resp.text()).slice(0, 200)}`);
  }
  const data = await resp.json();
  if (!data?.access_token) throw new GoogleOAuthError('token refresh returned no access token');
  return data;
}

export async function fetchGoogleEmail(accessToken) {
  const resp = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    throw new GoogleOAuthError(`userinfo lookup failed (${resp.status})`);
  }
  const user = await resp.json();
  return user?.email || 'unknown';
}
