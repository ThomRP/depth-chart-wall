import test from 'node:test';
import assert from 'node:assert/strict';
import { applyHostedSnapshot, isHostedProjection } from './snapshots.js';
import { DEFAULT_SCORING } from './engine.js';

const player = { name: 'Example Player', team: 'BOS', games: 10, stats: { pts: 20 } };
const snapshot = {
  metadata: { kind: 'projections', horizon: 'rest-of-season', basis: 'per-game', season: 2027, snapshotId: 'new', managedSnapshot: true, scoring: { ...DEFAULT_SCORING, pts: 2 } },
  players: [player, { ...player, name: 'Another Player' }], warnings: ['Top source limit']
};
const state = () => ({ projections: null, current: null, scoring: { ...DEFAULT_SCORING }, season: 2027 });

test('fresh session receives the saved source and its league defaults', () => {
  const result = applyHostedSnapshot(state(), snapshot);
  assert.equal(result.changed, true);
  assert.equal(result.state.projections.players.length, 2);
  assert.equal(result.state.scoring.pts, 2);
  assert.deepEqual(result.state.projections.warnings, snapshot.warnings);
});
test('legacy app-supplied snapshot upgrades without clearing custom scoring or current stats', () => {
  const old = state();
  old.projections = { players: [player], metadata: { snapshotLabel: 'User-supplied Hashtag ROS page' } };
  old.scoring.pts = 9; old.current = { players: [player], metadata: { source: 'ESPN' } };
  const result = applyHostedSnapshot(old, snapshot);
  assert.equal(result.changed, true);
  assert.equal(result.state.projections.players.length, 2);
  assert.equal(result.state.scoring.pts, 9);
  assert.equal(result.state.current, old.current);
  assert.equal(old.projections.players.length, 1, 'original state is not mutated');
});
test('reopening an unchanged snapshot leaves existing records intact', () => {
  const first = applyHostedSnapshot(state(), snapshot).state;
  const second = applyHostedSnapshot(first, snapshot);
  assert.equal(second.changed, false);
  assert.equal(second.state, first);
});
test('manual imports and persistent clearing remain under user control', () => {
  const manual = state();
  manual.projections = { players: [player], metadata: { ...snapshot.metadata, snapshotLabel: 'User-supplied Hashtag ROS page', managedSnapshot: false } };
  assert.equal(isHostedProjection(manual.projections), false);
  assert.equal(applyHostedSnapshot(manual, snapshot).state, manual);
  const cleared = { ...state(), initialDataCleared: true };
  assert.equal(applyHostedSnapshot(cleared, snapshot).state, cleared);
});
test('wrong-source or malformed saved data never replaces the previous valid baseline', () => {
  const old = state();
  for (const metadata of [{ ...snapshot.metadata, kind: 'current' }, { ...snapshot.metadata, basis: 'totals' }, { ...snapshot.metadata, horizon: 'full-season' }]) {
    assert.throws(() => applyHostedSnapshot(old, { ...snapshot, metadata }));
    assert.equal(old.projections, null);
  }
});
