import test from 'node:test';
import assert from 'node:assert/strict';
import { rosterForProjections } from './identities.js';
import { matchPlayers } from './engine.js';

test('known injured players can be requested when absent from a depth chart', () => {
  const projections=[{name:'Anthony Edwards',team:'MIN',position:'SG',stats:{pts:20}}];
  const roster=rosterForProjections(projections,[]);
  assert.equal(matchPlayers(projections,roster).players[0].currentPlayer.espnId,'4594268');
  assert.deepEqual(roster[0].stats,{});
  assert.equal(roster[0].team,'');
});
test('live roster identity takes precedence; unknown names are not guessed', () => {
  const projections=[{name:'Anthony Edwards'},{name:'Unknown Player'}];
  const roster=rosterForProjections(projections,[{id:'4594268',name:'Anthony Edwards',team:'MIN'}]);
  assert.equal(roster.length,1);
  assert.equal(roster[0].team,'MIN');
});
test('verified name variations match without merging arbitrary partial names', () => {
  const projections=[{name:'Nicolas Claxton'},{name:'Alexandre Sarr'},{name:'Alex Other'}];
  const roster=rosterForProjections(projections,[{id:'4278067',name:'Nic Claxton'},{id:'5160992',name:'Alex Sarr'}]);
  const matched=matchPlayers(projections,roster);
  assert.equal(matched.players.length,2);
  assert.equal(matched.unmatchedProjections[0].name,'Alex Other');
});
