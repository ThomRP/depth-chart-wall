import { STAT_DEFS } from './engine.js?v=darko-1';

export function projectionKey(projections) {
  const meta = projections?.metadata || {};
  if (meta.provider === 'darko' || /darko/i.test(meta.source || '')) return 'darko';
  if (/hashtag/i.test(meta.source || '')) return 'hashtag';
  return 'imported';
}

export function projectionLabel(projections) {
  if (projectionKey(projections) === 'darko') return 'DARKO';
  return projections?.metadata.horizon === 'daily' ? 'Daily' : 'ROS';
}

// Keep the existing active baseline and scoring when upgrading older browsers.
// Each provider retains its own weights, including any explicit reduced scoring.
export function rememberProjection(state, projections, scoring) {
  const projectionSources = { ...state.projectionSources };
  const sourceScoring = { ...state.sourceScoring };
  if (state.projections) {
    const previous = projectionKey(state.projections);
    projectionSources[previous] = state.projections;
    sourceScoring[previous] = { ...state.scoring };
  }
  const key = projectionKey(projections);
  projectionSources[key] = projections;
  const selectedScoring = { ...(scoring || sourceScoring[key] || state.scoring) };
  sourceScoring[key] = selectedScoring;
  return { ...state, projections, scoring: selectedScoring, projectionSources, sourceScoring };
}

export function unavailableScoredCategories(projections, scoring) {
  if (!projections?.players.length) return [];
  return STAT_DEFS.filter(def => Number(scoring[def.key] ?? 0) !== 0 && projections.players.every(p => p.stats[def.key] == null));
}

// DARKO reports G/F/C, without precise PG/SG or SF/PF eligibility. Broad filters
// include either convention; specific filters require a specific source position.
export function matchesPosition(playerPosition, filter) {
  if (!filter) return true;
  const positions = String(playerPosition || '').toUpperCase().split(/[^A-Z]+/);
  if (filter === 'G') return positions.some(p => ['G','PG','SG'].includes(p));
  if (filter === 'F') return positions.some(p => ['F','SF','PF'].includes(p));
  return positions.includes(filter);
}

export function positionFilters(projections) {
  const broad = projections?.players.some(p => /(?:^|[^A-Z])[GF](?:$|[^A-Z])/.test(p.position || ''));
  return broad ? ['G','F','C'] : ['PG','SG','SF','PF','C'];
}
