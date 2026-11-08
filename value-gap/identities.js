import { normalizeName } from './engine.js';
import playerDirectory from './player-directory.js';

const directoryByName = new Map();
for (const player of playerDirectory) {
  const name = normalizeName(player.name);
  const existing = directoryByName.get(name);
  directoryByName.set(name, directoryByName.has(name) && existing !== player.espnId ? null : player.espnId);
}

// Injured players can disappear from the existing depth-chart feed. Stable IDs
// verified against official ESPN profiles allow requesting their game logs too.
// These records contain identity only, never guessed current stats or teams.
const ESPN_PROFILES = Object.freeze({
  anthonyedwards: { id: '4594268', source: 'https://www.espn.co.uk/nba/player/_/id/4594268/anthony-edwards' },
  paolobanchero: { id: '4432573', source: 'https://www.espn.co.uk/nba/player/gamelog/_/id/4432573/paolo-banchero' },
  kawhileonard: { id: '6450', source: 'https://www.espn.com.pe/nba/player/gamelog/_/id/6450/kawhi-leonard' },
  chetholmgren: { id: '4433255', source: 'https://africa.espn.com/nba/player/splits?id=4433255' },
  brandoningram: { id: '3913176', source: 'https://africa.espn.com/nba/player/advancedstats/_/id/3913176/brandon-ingram' },
  jalenwilliams: { id: '4593803', source: 'https://www.espn.com/nba/player/_/id/4593803/jalen-williams' },
  jimmybutler: { id: '6430', source: 'https://www.espn.co.uk/nba/player/advancedstats/_/id/6430/jimmy-butler-iii' },
  jusufnurkic: { id: '3102530', source: 'https://www.espn.com/nba/player/advancedstats/_/id/3102530/jusuf-nurkic' },
  jamorant: { id: '4279888', source: 'https://africa.espn.com/nba/player/hollinger/_/id/4279888/ja-morant' },
  casonwallace: { id: '4683692', source: 'https://africa.espn.com/nba/player/gamelog/_/id/4683692/cason' },
  shaedonsharpe: { id: '4914336', source: 'https://espndeportes.espn.com/basquetbol/nba/jugador/_/id/4914336/shaedon-sharpe' },
  derecklively: { id: '4683688', source: 'https://espndeportes.espn.com/basquetbol/nba/jugador/_/id/4683688/dereck-lively-ii' },
  markwilliams: { id: '4701232', source: 'https://www.espn.co.uk/nba/player/_/id/4701232/mark-williams' },
  kevinporter: { id: '4397140', source: 'https://espndeportes.espn.com/nba/player/gamelog/_/id/4397140/kevin-porter-jr' },
  mosesmoody: { id: '4432171', source: 'https://www.espn.com/nba/player/_/id/4432171/moses-moody' },
  jordanmiller: { id: '4396818', source: 'https://africa.espn.com/nba/player/gamelog/_/id/4396818/jordan-miller' }
});

export function rosterForProjections(projections, roster = []) {
  const players = roster.map(player => ({ ...player, espnId: String(player.id), stats: {} }));
  const ids = new Set(players.map(player => player.espnId));
  for (const projection of projections) {
    const profile = ESPN_PROFILES[normalizeName(projection.name)];
    const id = String(projection.espnId || profile?.id || directoryByName.get(normalizeName(projection.name)) || '');
    if (!/^\d+$/.test(id) || ids.has(id)) continue;
    // A unique name already supplied by the live roster takes precedence.
    if (players.some(player => normalizeName(player.name) === normalizeName(projection.name))) continue;
    players.push({ id, espnId: id, name: projection.name, team: '', position: projection.position || '', stats: {}, identitySource: profile?.source || 'projection ESPN ID' });
    ids.add(id);
  }
  return players;
}
