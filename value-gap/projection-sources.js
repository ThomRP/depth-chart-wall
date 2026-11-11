import { STAT_DEFS } from './engine.js?v=combined-1';
import { buildCombinedProjection } from './combined-projections.js?v=combined-1';

export function projectionKey(projections) {
  const meta = projections?.metadata || {};
  if (meta.provider === 'combined') return 'combined';
  if (meta.provider === 'darko' || /darko/i.test(meta.source || '')) return 'darko';
  if (meta.provider === 'hashtag' || /hashtag/i.test(meta.source || '')) return 'hashtag';
  return 'imported';
}

export function projectionLabel(projections) {
  if (projectionKey(projections) === 'combined') return 'Combined ROS';
  if (projectionKey(projections) === 'darko') return 'DARKO';
  return projections?.metadata.horizon === 'daily' ? 'Daily' : 'ROS';
}

// Saved Hashtag HTML/JSON and the DARKO CSV identify themselves. A plain copied
// table can be labeled explicitly by the user instead of guessing its provider.
export function identifyProjectionImport(imported, provider = 'auto') {
  if (provider === 'auto' || imported.metadata.provider === 'combined') return imported;
  if (!['hashtag','darko'].includes(provider)) throw new Error('Choose Hashtag ROS, DARKO, or automatic detection.');
  const detected = projectionKey(imported);
  if (detected !== 'imported' && detected !== provider) throw new Error('The selected projection provider conflicts with the file. Use automatic detection or select the matching provider.');
  return { ...imported, metadata: {
    ...imported.metadata, provider,
    source: provider === 'hashtag' ? 'Hashtag Basketball' : 'DARKO Fantasy Lab',
    horizon: imported.metadata.horizon || (provider === 'hashtag' ? 'rest-of-season' : 'daily')
  } };
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
  const selectedScoring = { ...(scoring || sourceScoring[key] || (key === 'combined' ? sourceScoring.hashtag : null) || state.scoring) };
  sourceScoring[key] = selectedScoring;
  return { ...state, projections, scoring: selectedScoring, projectionSources, sourceScoring };
}

// Raw imports remain manual. The local derived baseline is rebuilt whenever an
// input changes, and never survives a season mismatch as a stale calculation.
export function rebuildCombinedProjection(state, { selectWhenReady = false } = {}) {
  if (state.projections) state = rememberProjection(state, state.projections);
  const sources = { ...state.projectionSources };
  try {
    const combined = buildCombinedProjection(sources.hashtag, sources.darko);
    const select = selectWhenReady || projectionKey(state.projections) === 'combined';
    const next = { ...state, projectionSources: { ...sources, combined } };
    return { state: select ? rememberProjection(next, combined) : next, error: null };
  } catch (error) {
    let next = state;
    if (projectionKey(state.projections) === 'combined') {
      const fallback = sources.hashtag || sources.darko || sources.imported;
      next = fallback ? rememberProjection(state, fallback) : { ...state, projections: null };
    }
    const projectionSources = { ...next.projectionSources };
    delete projectionSources.combined;
    return { state: { ...next, projectionSources }, error: error.message };
  }
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
