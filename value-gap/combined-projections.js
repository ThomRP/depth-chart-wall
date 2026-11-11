import { STAT_DEFS, PERCENT_DEFS, matchPlayers, round, statValue } from './engine.js?v=combined-1';

export const COMBINED_RECIPE = 'hashtag-minutes-equal-rates-v1';
const validStat = value => Number.isFinite(value) && value >= 0;
const inputSummary = data => ({
  source: data.metadata.source,
  season: data.metadata.season,
  players: data.players.length,
  importedAt: data.metadata.importedAt || null,
  capturedAt: data.metadata.capturedAt || null
});

// A content revision for the stats cache, not a security hash. Identical source
// data keeps its revision when the browser recomputes the baseline on reload.
function revision(hashtag, darko) {
  const content = JSON.stringify([hashtag.metadata.season, hashtag.players, darko.players]);
  let hash = 2166136261;
  for (let i = 0; i < content.length; i++) hash = Math.imul(hash ^ content.charCodeAt(i), 16777619);
  return `combined-${COMBINED_RECIPE}-${(hash >>> 0).toString(16)}`;
}

export function buildCombinedProjection(hashtag, darko) {
  if (!hashtag?.players?.length || !darko?.players?.length) throw new Error('Import both Hashtag ROS projections and a DARKO CSV to build Combined ROS.');
  if (!hashtag.metadata?.season || !darko.metadata?.season || String(hashtag.metadata.season) !== String(darko.metadata.season)) {
    throw new Error('Hashtag and DARKO must use the same season before Combined ROS can be built.');
  }
  if (hashtag.metadata.horizon !== 'rest-of-season' || /blend|stream/i.test(JSON.stringify(hashtag.metadata))) {
    throw new Error('Combined ROS needs pure Hashtag rest-of-season projections.');
  }
  for (const data of [hashtag, darko]) {
    if (data.metadata.provider === 'combined') throw new Error('Combined ROS must use the original Hashtag and DARKO inputs.');
    if (data.metadata.basis !== 'per-game' || /current|actual/i.test(data.metadata.kind || '')) throw new Error('Both combined inputs must be per-game projections.');
  }

  const matched = matchPlayers(hashtag.players, darko.players), players = [], excluded = [];
  for (const p of matched.unmatchedProjections) excluded.push({ name: p.name, reason: 'No DARKO match' });
  for (const p of matched.ambiguous) excluded.push({ name: p.projection.name, reason: 'Ambiguous projection match' });
  const hashtagOnlyCounts = {};
  let invalidMinutes = 0;
  for (const pair of matched.players) {
    const h = pair.projectionPlayer, d = pair.currentPlayer, hm = h.stats.min, dm = d.stats.min;
    if (!validStat(hm) || !validStat(dm) || hm <= 0 || dm <= 0) {
      invalidMinutes++;
      excluded.push({ name: h.name, reason: 'Both sources need positive projected minutes' });
      continue;
    }
    const stats = { min: hm }, components = { hashtagMinutes: hm, darkoMinutes: dm, stats: {} };
    for (const { key } of STAT_DEFS) {
      if (key === 'min') continue;
      const hValue = validStat(h.stats[key]) ? h.stats[key] : null;
      const dValue = validStat(d.stats[key]) ? d.stats[key] : null;
      const perMinute = dValue === null ? null : dValue / dm;
      const adjusted = perMinute === null ? null : perMinute * hm;
      // DARKO's Fantasy Lab CSV omits shooting volume. Keep available Hashtag
      // values explicitly, without inventing volume from percentages or FP/G.
      const method = hValue === null ? 'missing' : adjusted === null ? 'hashtag-only' : 'average';
      stats[key] = method === 'missing' ? null : method === 'hashtag-only' ? hValue : round((hValue + adjusted) / 2, 6);
      components.stats[key] = { hashtag: hValue, darkoPerMinute: perMinute, darkoAdjusted: adjusted, method };
      if (method === 'hashtag-only') hashtagOnlyCounts[key] = (hashtagOnlyCounts[key] || 0) + 1;
    }
    // Percentages are not per-minute counting stats. Keep them consistent with
    // the resulting makes/attempts; with the supplied DARKO CSV those are Hashtag-only.
    for (const { key } of PERCENT_DEFS) stats[key] = statValue(stats, key) ?? statValue(h.stats, key) ?? null;
    const player = { ...h, stats, components };
    if (!player.espnId && d.espnId) player.espnId = d.espnId;
    delete player.sourceFpts;
    players.push(player);
  }
  if (!players.length) throw new Error('No players can be combined. Check player names and positive projected minutes in both files.');

  const warnings = [];
  const fallback = STAT_DEFS.filter(def => hashtagOnlyCounts[def.key]);
  if (fallback.length) warnings.push(`Hashtag-only categories: ${fallback.map(def => `${def.label} (${hashtagOnlyCounts[def.key]} players)`).join(', ')}. DARKO has no value for these categories; they are not averaged.`);
  if (excluded.length) warnings.push(`${excluded.length} Hashtag players were excluded from Combined ROS; review projection coverage below.`);
  if (matched.unmatchedCurrent.length) warnings.push(`${matched.unmatchedCurrent.length} DARKO rows are unused because they have no unique Hashtag match.`);
  return {
    players,
    metadata: {
      provider: 'combined', source: 'Combined ROS (50/50)', kind: 'projections', horizon: 'rest-of-season', basis: 'per-game',
      season: Number(hashtag.metadata.season), recipe: COMBINED_RECIPE, managedSnapshot: false,
      snapshotId: revision(hashtag, darko), generatedAt: new Date().toISOString(),
      inputs: { hashtag: inputSummary(hashtag), darko: inputSummary(darko) },
      coverage: { hashtag: hashtag.players.length, darko: darko.players.length, matched: matched.players.length, combined: players.length, invalidMinutes, excluded, unusedDarko: matched.unmatchedCurrent.map(p => p.name) },
      hashtagOnlyCounts
    },
    warnings
  };
}
