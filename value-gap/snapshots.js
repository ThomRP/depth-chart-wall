import { DEFAULT_SCORING, parseImport } from './engine.js';

export function isHostedProjection(projections) {
  if (!projections) return false;
  const metadata = projections.metadata || {};
  if (metadata.managedSnapshot === false) return false;
  return metadata.managedSnapshot === true || metadata.snapshotLabel === 'User-supplied Hashtag ROS page';
}

// Upgrade the app-supplied baseline without replacing explicit user imports,
// clearing their scoring, or throwing away a previously valid stats response.
export function applyHostedSnapshot(state, snapshot) {
  if (state.initialDataCleared || (state.projections && !isHostedProjection(state.projections))) return { state, changed: false };
  const imported = parseImport(JSON.stringify(snapshot));
  const metadata = imported.metadata;
  if (metadata.kind !== 'projections' || metadata.horizon !== 'rest-of-season' || metadata.basis !== 'per-game' || !metadata.season || !metadata.snapshotId) {
    throw new Error('The saved baseline must identify a pure ROS per-game projection snapshot and its season.');
  }
  if (state.projections?.metadata.snapshotId === metadata.snapshotId) return { state, changed: false };
  const next = {
    ...state,
    projections: { ...imported, metadata: { ...metadata, managedSnapshot: true }, warnings: snapshot.warnings || imported.warnings },
    season: Number(metadata.season)
  };
  if (Object.keys(DEFAULT_SCORING).every(key => state.scoring[key] === DEFAULT_SCORING[key]) && metadata.scoring && !metadata.unsupportedScoring?.length) {
    next.scoring = { ...DEFAULT_SCORING, ...metadata.scoring };
  }
  return { state: next, changed: true };
}
