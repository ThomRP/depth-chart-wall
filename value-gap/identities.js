import { normalizeName } from './engine.js';

// Injured players can disappear from the existing depth-chart feed. Stable IDs
// verified against official ESPN profiles allow requesting their game logs too.
// These records contain identity only, never guessed current stats or teams.
const ESPN_PROFILES = Object.freeze({
  anthonyedwards: { id: '4594268', source: 'https://www.espn.co.uk/nba/player/_/id/4594268/anthony-edwards' },
  paolobanchero: { id: '4432573', source: 'https://www.espn.co.uk/nba/player/gamelog/_/id/4432573/paolo-banchero' },
  kawhileonard: { id: '6450', source: 'https://www.espn.com.pe/nba/player/gamelog/_/id/6450/kawhi-leonard' }
});

export function rosterForProjections(projections, roster) {
  const players = roster.map(player => ({ ...player, espnId: String(player.id), stats: {} }));
  const ids = new Set(players.map(player => player.espnId));
  for (const projection of projections) {
    const profile = ESPN_PROFILES[normalizeName(projection.name)];
    const id = String(projection.espnId || profile?.id || '');
    if (!/^\d+$/.test(id) || ids.has(id)) continue;
    // A unique name already supplied by the live roster takes precedence.
    if (players.some(player => normalizeName(player.name) === normalizeName(projection.name))) continue;
    players.push({ id, espnId: id, name: projection.name, team: '', position: projection.position || '', stats: {}, identitySource: profile?.source || 'projection ESPN ID' });
    ids.add(id);
  }
  return players;
}
