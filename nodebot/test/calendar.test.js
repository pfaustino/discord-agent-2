import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as db from '../src/db.js';
import { buildEventBody } from '../src/googleCalendar/client.js';
import { canRead, canWrite } from '../src/calendarTools.js';
import { createBoundState, readBoundState } from '../src/web/auth.js';
import { guildIdFromState } from '../src/googleCalendar/oauth.js';

function withDb(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'nodebot-cal-'));
  db.initDb(path.join(dir, 'test.db'));
  try {
    return fn();
  } finally {
    db.closeDb();
    rmSync(dir, { recursive: true, force: true });
  }
}

const message = (guildId, userId) => ({
  guild: { id: guildId },
  author: { id: userId },
});

test('buildEventBody creates timed events', () => {
  const body = buildEventBody({
    summary: 'Standup',
    start: '2026-03-12T09:00:00-07:00',
    end: '2026-03-12T09:15:00-07:00',
  });
  assert.equal(body.summary, 'Standup');
  assert.equal(body.start.dateTime, '2026-03-12T09:00:00-07:00');
});

test('calendar access: owner can read and write when enabled', () => {
  withDb(() => {
    db.saveCalendarConnection('111', {
      email: 'pat@example.com',
      refreshToken: 'refresh',
    });
    db.setSetting('111', 'calendar_enabled', true);
    const msg = message('111', '42');
    assert.equal(canRead(msg, true), true);
    assert.equal(canWrite(msg, true), true);
    assert.equal(canRead(message('111', '99'), false), false);
    assert.equal(canWrite(message('111', '99'), false), false);
  });
});

test('calendar read opens to everyone when configured', () => {
  withDb(() => {
    db.saveCalendarConnection('111', { email: 'pat@example.com', refreshToken: 'refresh' });
    db.setSetting('111', 'calendar_enabled', true);
    db.setSetting('111', 'calendar_read_access', 'everyone');
    assert.equal(canRead(message('111', '99'), false), true);
    assert.equal(canWrite(message('111', '99'), false), false);
  });
});

test('OAuth state binds guild id', () => {
  const state = createBoundState('calendar:555');
  assert.equal(guildIdFromState(state), '555');
  assert.equal(readBoundState(state), 'calendar:555');
});
