import test from 'node:test';
import assert from 'node:assert/strict';
import { rosterForProjections } from './identities.js';
import { normalizeName, matchPlayers } from './engine.js';

const verified = [
  ['Anthony Edwards', '4594268'], ['Paolo Banchero', '4432573'], ['Kawhi Leonard', '6450'],
  ['Chet Holmgren', '4433255'], ['Brandon Ingram', '3913176'], ['Jalen Williams', '4593803'], ['Jimmy Butler III', '6430'],
  ['Jusuf Nurkić', '3102530'], ['Ja Morant', '4279888'], ['Cason Wallace', '4683692'],
  ['Shaedon Sharpe', '4914336'], ['Dereck Lively II', '4683688'], ['Mark Williams', '4701232'],
  ['Kevin Porter Jr.', '4397140'], ['Moses Moody', '4432171'], ['Jordan Miller', '4396818']
];

test('absent players receive verified ESPN identity without guessed stats or teams', () => {
  const projections = verified.map(([name]) => ({ name, position: 'PG', stats: { pts: 99 } }));
  const roster = rosterForProjections(projections, []);
  assert.equal(roster.length, verified.length);
  for (const [name, id] of verified) {
    const actual = roster.find(player => player.name === name);
    assert.equal(actual.id, id); assert.equal(actual.espnId, id);
    assert.equal(actual.team, ''); assert.deepEqual(actual.stats, {});
    assert.ok(new URL(actual.identitySource).hostname.includes('espn.'));
  }
  assert.equal(matchPlayers(projections, roster).players.length, verified.length);
});

test('live roster identities retain their names, teams and IDs without duplicate supplements', () => {
  const roster = [{ id: '4433255', name: 'Chet Holmgren', team: 'OKC', position: 'C', stats: { pts: 22 } }];
  const result = rosterForProjections([{ name: 'Chet Holmgren', position: 'C' }], roster);
  assert.equal(result.length, 1); assert.equal(result[0].team, 'OKC');
  assert.deepEqual(result[0].stats, {}); assert.equal(result[0].identitySource, undefined);
});

test('Ron and Ronald Holland share a documented alias while Jalen and Jaylin remain distinct', () => {
  assert.equal(normalizeName('Ron Holland II'), normalizeName('Ronald Holland II'));
  assert.notEqual(normalizeName('Jalen Williams'), normalizeName('Jaylin Williams'));
  const projections = [{ name: 'Ron Holland II', stats: { pts: 1 } }];
  const live = [{ id: '4683771', name: 'Ronald Holland II', team: 'DET', position: 'SF' }];
  const roster = rosterForProjections(projections, live);
  assert.equal(roster.length, 1);
  const matched = matchPlayers(projections, roster);
  assert.equal(matched.players.length, 1);
  assert.equal(matched.players[0].currentPlayer.espnId, '4683771');
});

test('unknown names and invalid explicit IDs never produce inferred identities', () => {
  const roster = rosterForProjections([{ name: 'Unverified Example' }, { name: 'Invalid Identifier', espnId: 'not-an-id' }], []);
  assert.deepEqual(roster, []);
});
