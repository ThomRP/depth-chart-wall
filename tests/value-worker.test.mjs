import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../value-gap/value-worker.js', import.meta.url), 'utf8');
const { averageGamelog, currentSeason, default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const labels = ['MIN', 'FG', 'FG%', '3PT', '3P%', 'FT', 'FT%', 'REB', 'AST', 'BLK', 'STL', 'PF', 'TO', 'PTS'];
const statRow = (points = 20, min = '30') => [min, '7-14', '50', '2-5', '40', '4-5', '80', '8', '6', '1', '2', '3', '4', String(points)];
function fixture(rows, year = 2027) {
  return {
    labels, season: { year },
    events: Object.fromEntries(rows.map((row, i) => [String(i + 1), { date: row.date ?? `2026-11-${String(i + 1).padStart(2, '0')}T00:00:00Z` }])),
    seasonTypes: [{ displayName: '2026-27 Regular Season', categories: [{ totals: statRow(999), events: rows.map((row, i) => ({ eventId: String(i + 1), stats: row.stats })) }] }],
  };
}

test('averages made-attempt columns and counts appearances, not DNPs or totals', () => {
  const result = averageGamelog(fixture([{ stats: statRow(20) }, { stats: statRow(30, '30:30') }, { stats: statRow(0, 'DNP') }, { stats: statRow(0, '0') }]), 2027);
  assert.equal(result.games, 2);
  assert.equal(result.stats.pts, 25);
  assert.equal(result.stats.min, 30.25);
  assert.equal(result.stats.fgm, 7);
  assert.equal(result.stats.fga, 14);
  assert.equal(result.stats.ftm, 4);
  assert.equal(result.stats.fta, 5);
  assert.equal(result.stats.fg3m, 2);
  assert.equal(result.stats.tov, 4);
});

test('missing and malformed columns remain null, true zero remains zero', () => {
  const data = fixture([{ stats: statRow() }]);
  data.labels[10] = 'UNKNOWN';
  data.seasonTypes[0].categories[0].events[0].stats[9] = '0';
  data.seasonTypes[0].categories[0].events[0].stats[1] = '14-7';
  const result = averageGamelog(data, 2027);
  assert.equal(result.stats.stl, null);
  assert.equal(result.stats.blk, 0);
  assert.equal(result.stats.fgm, null);
  assert.equal(result.stats.fga, null);
});

test('rejects a different ESPN season and missing season evidence', () => {
  assert.equal(averageGamelog(fixture([{ stats: statRow() }], 2026), 2027).error, 'season_mismatch');
  const data = fixture([{ stats: statRow() }]);
  delete data.season;
  data.seasonTypes[0].displayName = 'Regular Season';
  delete data.events;
  assert.equal(averageGamelog(data, 2027).error, 'season_unverified');
});

test('uses exact most-recent appearances even when categories arrive oldest first', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ stats: statRow(i + 1) }));
  const result = averageGamelog(fixture(rows), 2027, '8');
  assert.equal(result.games, 8);
  assert.equal(result.stats.pts, 6.5);
});

test('does not claim a recent period without event dates', () => {
  const data = fixture([{ stats: statRow() }]);
  delete data.events;
  assert.equal(averageGamelog(data, 2027, '8').error, 'missing_event_dates');
});

test('deduplicates repeated event IDs and ignores postseason', () => {
  const data = fixture([{ stats: statRow(20) }]);
  data.seasonTypes[0].categories.push(data.seasonTypes[0].categories[0]);
  data.seasonTypes.push({ displayName: '2027 Postseason', categories: [{ events: [{ eventId: '99', stats: statRow(100) }] }] });
  assert.equal(averageGamelog(data, 2027).games, 1);
  assert.equal(averageGamelog(data, 2027).stats.pts, 20);
});

test('ending season derives correctly across the offseason', () => {
  assert.equal(currentSeason(new Date('2026-11-07T23:00:00Z')), 2027);
  assert.equal(currentSeason(new Date('2027-04-07T23:00:00Z')), 2027);
});

test('validates bounded IDs and periods before any upstream work', async () => {
  for (const query of ['ids=abc', 'ids=1&period=2', `ids=${Array(21).fill('1').join(',')}`, 'ids=1&season=1999']) {
    const response = await worker.fetch(new Request(`https://test.invalid/stats?${query}`), {}, {});
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal((await worker.fetch(new Request('https://test.invalid/stats', { method: 'OPTIONS' }), {}, {})).status, 204);
});
