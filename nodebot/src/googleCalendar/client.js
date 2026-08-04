// Google Calendar API — list/create/update/delete via the owner's connected account.
import * as db from '../db.js';
import { refreshAccessToken, GoogleOAuthError } from './oauth.js';

export class CalendarError extends Error {}

const API = 'https://www.googleapis.com/calendar/v3';

function now() {
  return Math.floor(Date.now() / 1000);
}

export function connected(guildId) {
  return Boolean(db.getCalendarConnection(guildId));
}

async function accessToken(guildId) {
  const conn = db.getCalendarConnection(guildId);
  if (!conn) throw new CalendarError('Google Calendar is not connected for this server');
  if (conn.access_token && conn.access_expires_at > now() + 60) return conn.access_token;
  const data = await refreshAccessToken(conn.refresh_token);
  const expiresAt = now() + (parseInt(data.expires_in, 10) || 3600);
  db.updateCalendarAccessToken(guildId, data.access_token, expiresAt);
  return data.access_token;
}

async function api(guildId, path, { method = 'GET', body } = {}) {
  const token = await accessToken(guildId);
  const resp = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not json */ }
  if (!resp.ok) {
    const msg = data?.error?.message || text.slice(0, 200) || resp.statusText;
    throw new CalendarError(`Google Calendar API ${resp.status}: ${msg}`);
  }
  return data;
}

function calendarId(guildId) {
  return db.getSetting(guildId, 'calendar_id') || 'primary';
}

export async function listCalendars(guildId) {
  const data = await api(guildId, '/users/me/calendarList');
  return (data?.items || []).map((c) => ({
    id: c.id,
    summary: c.summary || c.id,
    primary: Boolean(c.primary),
  }));
}

export async function listEvents(guildId, {
  timeMin, timeMax, maxResults = 10, query,
} = {}) {
  const params = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: String(Math.min(Math.max(maxResults, 1), 25)),
  });
  if (timeMin) params.set('timeMin', timeMin);
  if (timeMax) params.set('timeMax', timeMax);
  if (query) params.set('q', query);
  const data = await api(guildId, `/calendars/${encodeURIComponent(calendarId(guildId))}/events?${params}`);
  return (data?.items || []).map(formatEvent);
}

export async function createEvent(guildId, event) {
  const data = await api(
    guildId,
    `/calendars/${encodeURIComponent(calendarId(guildId))}/events`,
    { method: 'POST', body: event },
  );
  return formatEvent(data);
}

export async function updateEvent(guildId, eventId, patch) {
  const data = await api(
    guildId,
    `/calendars/${encodeURIComponent(calendarId(guildId))}/events/${encodeURIComponent(eventId)}`,
    { method: 'PATCH', body: patch },
  );
  return formatEvent(data);
}

export async function deleteEvent(guildId, eventId) {
  await api(
    guildId,
    `/calendars/${encodeURIComponent(calendarId(guildId))}/events/${encodeURIComponent(eventId)}`,
    { method: 'DELETE' },
  );
}

export function formatEvent(raw) {
  if (!raw) return null;
  const start = raw.start?.dateTime || raw.start?.date || '';
  const end = raw.end?.dateTime || raw.end?.date || '';
  return {
    id: raw.id,
    summary: raw.summary || '(no title)',
    description: raw.description || '',
    location: raw.location || '',
    start,
    end,
    htmlLink: raw.htmlLink || '',
  };
}

/** Build a Google event body from tool args. */
export function buildEventBody({
  summary, start, end, description, location, all_day: allDay,
}) {
  const body = { summary: String(summary || '').trim() };
  if (!body.summary) throw new CalendarError('Event title (summary) is required');
  if (!start) throw new CalendarError('Start time is required');
  if (allDay) {
    body.start = { date: start.slice(0, 10) };
    body.end = { date: (end || start).slice(0, 10) };
  } else {
    body.start = { dateTime: start };
    body.end = { dateTime: end || start };
  }
  if (description) body.description = description;
  if (location) body.location = location;
  return body;
}

export { GoogleOAuthError };
