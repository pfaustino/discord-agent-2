// Google Calendar tools — read (optional for server) and write (owner only).
import * as db from './db.js';
import { googleCalendarConfigured } from './googleCalendar/oauth.js';
import * as calendar from './googleCalendar/client.js';
import { isOwner } from './utils.js';

export class ToolError extends Error {}

function str(description) {
  return { type: 'string', description };
}

function int(description) {
  return { type: 'integer', description };
}

function schema(name, description, properties = {}, required = []) {
  return {
    type: 'function',
    function: { name, description, parameters: { type: 'object', properties, required } },
  };
}

export function connected(guildId) {
  return calendar.connected(guildId);
}

export function enabled(guildId) {
  return connected(guildId) && Boolean(db.getSetting(guildId, 'calendar_enabled'));
}

/** May this speaker read calendar events? */
export function canRead(message, isOwnerSpeaker = isOwner(message.author.id)) {
  if (!enabled(message.guild.id)) return false;
  if (isOwnerSpeaker) return true;
  return db.getSetting(message.guild.id, 'calendar_read_access') === 'everyone';
}

/** May this speaker create/update/delete events? Owner only. */
export function canWrite(message, isOwnerSpeaker = isOwner(message.author.id)) {
  return enabled(message.guild.id) && isOwnerSpeaker;
}

function defaultTimeRange(daysAhead = 7) {
  const start = new Date();
  const end = new Date(start.getTime() + daysAhead * 86400_000);
  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}

async function listCalendarEvents(_client, message, args) {
  const days = Math.min(Math.max(parseInt(args.days_ahead, 10) || 7, 1), 30);
  const range = defaultTimeRange(days);
  const events = await calendar.listEvents(message.guild.id, {
    timeMin: args.time_min || range.timeMin,
    timeMax: args.time_max || range.timeMax,
    maxResults: args.max_results || 10,
    query: args.query,
  });
  if (!events.length) return 'No upcoming events in that range.';
  return events.map((e) => (
    `- ${e.summary} (${e.start}${e.end ? ` → ${e.end}` : ''})`
    + `${e.location ? ` @ ${e.location}` : ''}`
    + ` [id: ${e.id}]`
  )).join('\n');
}

async function createCalendarEvent(_client, message, args) {
  const body = calendar.buildEventBody(args);
  const created = await calendar.createEvent(message.guild.id, body);
  return `Created "${created.summary}" (${created.start} → ${created.end}) [id: ${created.id}]`;
}

async function updateCalendarEvent(_client, message, args) {
  const { event_id: eventId, ...rest } = args;
  if (!eventId) throw new ToolError('event_id is required');
  const patch = {};
  if (rest.summary) patch.summary = rest.summary;
  if (rest.description !== undefined) patch.description = rest.description;
  if (rest.location !== undefined) patch.location = rest.location;
  if (rest.start || rest.end) {
    const built = calendar.buildEventBody({
      summary: rest.summary || 'event',
      start: rest.start,
      end: rest.end,
      all_day: rest.all_day,
    });
    if (rest.start) patch.start = built.start;
    if (rest.end) patch.end = built.end;
  }
  if (!Object.keys(patch).length) throw new ToolError('Nothing to update — pass fields to change');
  const updated = await calendar.updateEvent(message.guild.id, eventId, patch);
  return `Updated "${updated.summary}" (${updated.start} → ${updated.end}) [id: ${updated.id}]`;
}

async function deleteCalendarEvent(_client, message, args) {
  const eventId = args.event_id;
  if (!eventId) throw new ToolError('event_id is required');
  await calendar.deleteEvent(message.guild.id, eventId);
  return `Deleted event ${eventId}.`;
}

const READ_TOOLS = {
  list_calendar_events: [schema(
    'list_calendar_events',
    'List upcoming events on the connected Google Calendar. Use when someone asks what is on the schedule, what is happening today/tomorrow/this week, or whether they are free.',
    {
      days_ahead: int('How many days ahead to search (default 7, max 30)'),
      time_min: str('ISO start time (optional — overrides days_ahead)'),
      time_max: str('ISO end time (optional)'),
      max_results: int('Max events to return (default 10)'),
      query: str('Search text to filter events (optional)'),
    },
  ), listCalendarEvents],
};

const WRITE_TOOLS = {
  create_calendar_event: [schema(
    'create_calendar_event',
    'Create a new event on the connected Google Calendar. Only the bot owner may use this.',
    {
      summary: str('Event title'),
      start: str('Start time — ISO datetime (2026-03-12T15:00:00-07:00) or date for all-day (2026-03-12)'),
      end: str('End time (optional — defaults to start)'),
      description: str('Event description (optional)'),
      location: str('Location (optional)'),
      all_day: { type: 'boolean', description: 'True for all-day events (use YYYY-MM-DD for start/end)' },
    },
    ['summary', 'start'],
  ), createCalendarEvent],
  update_calendar_event: [schema(
    'update_calendar_event',
    'Update an existing calendar event by id. Only the bot owner may use this.',
    {
      event_id: str('Event id from list_calendar_events'),
      summary: str('New title (optional)'),
      start: str('New start (optional)'),
      end: str('New end (optional)'),
      description: str('New description (optional)'),
      location: str('New location (optional)'),
      all_day: { type: 'boolean', description: 'True when start/end are dates only' },
    },
    ['event_id'],
  ), updateCalendarEvent],
  delete_calendar_event: [schema(
    'delete_calendar_event',
    'Delete a calendar event by id. Only the bot owner may use this.',
    { event_id: str('Event id from list_calendar_events') },
    ['event_id'],
  ), deleteCalendarEvent],
};

export const TOOLS = { ...READ_TOOLS, ...WRITE_TOOLS };

export const READ_TOOL_SCHEMAS = Object.values(READ_TOOLS).map(([s]) => s);
export const WRITE_TOOL_SCHEMAS = Object.values(WRITE_TOOLS).map(([s]) => s);

export function schemasFor(message, isOwnerSpeaker) {
  const read = canRead(message, isOwnerSpeaker);
  const write = canWrite(message, isOwnerSpeaker);
  return [
    ...(read ? READ_TOOL_SCHEMAS : []),
    ...(write ? WRITE_TOOL_SCHEMAS : []),
  ];
}

export async function execute(client, message, name, args, isOwnerSpeaker) {
  if (!(name in TOOLS)) return `Error: unknown tool '${name}'.`;
  if (READ_TOOLS[name] && !canRead(message, isOwnerSpeaker)) {
    return 'Error: calendar read access is not enabled for you on this server.';
  }
  if (WRITE_TOOLS[name] && !canWrite(message, isOwnerSpeaker)) {
    return 'Error: only the bot owner can add, change, or delete calendar events.';
  }
  const [, handler] = TOOLS[name];
  try {
    return await handler(client, message, args || {});
  } catch (err) {
    if (err instanceof ToolError || err instanceof calendar.CalendarError) {
      return `Error: ${err.message}`;
    }
    return `Error: calendar tool failed (${err.message}).`;
  }
}

/** Dashboard status fields for settings GET. */
export function statusMeta(guildId) {
  const conn = db.getCalendarConnection(guildId);
  return {
    calendar_api_configured: googleCalendarConfigured(),
    calendar_connected: Boolean(conn),
    calendar_email: conn?.email || null,
    calendar_connected_at: conn?.connected_at || null,
  };
}
