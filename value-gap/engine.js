// All comparison inputs are per-game averages. Missing data stays missing.
export const STAT_DEFS = Object.freeze([
  { key: 'min', label: 'MIN', name: 'Minutes' },
  { key: 'pts', label: 'PTS', name: 'Points' },
  { key: 'reb', label: 'REB', name: 'Rebounds' },
  { key: 'ast', label: 'AST', name: 'Assists' },
  { key: 'stl', label: 'STL', name: 'Steals' },
  { key: 'blk', label: 'BLK', name: 'Blocks' },
  { key: 'fg3m', label: '3PM', name: 'Three-pointers made' },
  { key: 'tov', label: 'TO', name: 'Turnovers' },
  { key: 'fgm', label: 'FGM', name: 'Field goals made' },
  { key: 'fga', label: 'FGA', name: 'Field goals attempted' },
  { key: 'ftm', label: 'FTM', name: 'Free throws made' },
  { key: 'fta', label: 'FTA', name: 'Free throws attempted' }
]);
export const DEFAULT_SCORING = Object.freeze({ pts: 1, reb: 1.2, ast: 1.5, stl: 3, blk: 3, tov: -1, fg3m: 0, fgm: 0, fga: 0, ftm: 0, fta: 0, min: 0 });
export const PERCENT_DEFS = Object.freeze([
  { key: 'fgPct', label: 'FG%', name: 'Field goal percentage', percentage: true },
  { key: 'ftPct', label: 'FT%', name: 'Free throw percentage', percentage: true }
]);
const statKeys = STAT_DEFS.map(({ key }) => key);
const numberPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const missing = value => value == null || /^(?:|[-–—]|n\/a|null|undefined)$/i.test(String(value).trim());
const teamAbbreviations = new Map([
  ['Atlanta Hawks','ATL'],['Boston Celtics','BOS'],['Brooklyn Nets','BKN'],['Charlotte Hornets','CHA'],['Chicago Bulls','CHI'],['Cleveland Cavaliers','CLE'],
  ['Dallas Mavericks','DAL'],['Denver Nuggets','DEN'],['Detroit Pistons','DET'],['Golden State Warriors','GSW'],['Houston Rockets','HOU'],['Indiana Pacers','IND'],
  ['Los Angeles Clippers','LAC'],['Los Angeles Lakers','LAL'],['Memphis Grizzlies','MEM'],['Miami Heat','MIA'],['Milwaukee Bucks','MIL'],['Minnesota Timberwolves','MIN'],
  ['New Orleans Pelicans','NOP'],['New York Knicks','NYK'],['Oklahoma City Thunder','OKC'],['Orlando Magic','ORL'],['Philadelphia 76ers','PHI'],['Phoenix Suns','PHX'],
  ['Portland Trail Blazers','POR'],['Sacramento Kings','SAC'],['San Antonio Spurs','SAS'],['Toronto Raptors','TOR'],['Utah Jazz','UTA'],['Washington Wizards','WAS']
]);
// ESPN uses Ronald Holland II; official Pistons game notes use Ron Holland II.
// https://www.espn.com/nba/team/roster/_/name/det/sort/weight
// https://cdn.nba.com/teams/uploads/sites/1610612739/2025/01/250127-detcle-notes.pdf
// DARKO uses Nah'Shon Hyland and Carlton Carrington; documented nicknames:
// https://www.basketball-reference.com/players/h/hylanbo01.html
// https://www.nba.com/draft/2024/prospects/carlton-carrington
const playerNameAliases = new Map([['nicolasclaxton','nicclaxton'],['alexandresarr','alexsarr'],['ronholland','ronaldholland'],['nahshonhyland','boneshyland'],['carltoncarrington','bubcarrington']]);

export function normalizeName(name) {
  const normalized = String(name || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/\b(?:jr|sr|ii|iii|iv|v)\.?\s*$/i, '').replace(/[^a-z0-9]/g, '');
  // Explicit full-name variations observed across Hashtag and ESPN. Do not use
  // fuzzy or partial names: those can join different players.
  return playerNameAliases.get(normalized) || normalized;
}
const cleanHeader = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9%]/g, '');
const aliases = {
  min: ['min', 'mpg', 'minutes'], pts: ['pts', 'points', 'ppg'], reb: ['reb', 'treb', 'rebounds', 'rpg', 'trb'],
  ast: ['ast', 'assists', 'apg'], stl: ['stl', 'steals', 'spg'], blk: ['blk', 'blocks', 'bpg'],
  tov: ['to', 'tov', 'turnovers', 'topg'], fg3m: ['3pm', '3ptm', 'fg3m', '3p', 'threes', 'threepointersmade'],
  fgm: ['fgm', 'fieldgoalsmade'], fga: ['fga', 'fieldgoalsattempted'],
  ftm: ['ftm', 'freethrowsmade'], fta: ['fta', 'freethrowsattempted'],
  fgPct: ['fg%', 'fgpct', 'fieldgoalpercentage'], ftPct: ['ft%', 'ftpct', 'freethrowpercentage']
};
const aliasLookup = new Map(Object.entries(aliases).flatMap(([key, values]) => values.map(value => [value, key])));
function numeric(value, context, percentage = false) {
  if (missing(value)) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) throw new Error(`${context} must be a non-negative number.`);
    const result = percentage && value > 1 ? value / 100 : value;
    if (percentage && result > 1) throw new Error(`${context} must be between 0 and 100%.`);
    return result;
  }
  const str = String(value).trim().replace(/,/g, '');
  const candidate = percentage ? str.replace(/%$/, '') : str;
  if (!numberPattern.test(candidate)) throw new Error(`${context}: “${String(value).slice(0, 48)}” is not a valid number.`);
  let result = Number(candidate);
  if (!Number.isFinite(result) || result < 0) throw new Error(`${context} must be a non-negative number.`);
  if (percentage && (str.endsWith('%') || result > 1)) result /= 100;
  if (percentage && result > 1) throw new Error(`${context} must be between 0 and 100%.`);
  return result;
}
function parsePercentageCell(value, context) {
  if (missing(value)) return { percent: null, made: null, attempted: null };
  const str = String(value).trim();
  const match = str.match(/^([^()]*)\s*\(\s*([\d.]+)\s*[\/-]\s*([\d.]+)\s*\)\s*$/);
  if (!match) return { percent: numeric(value, context, true), made: null, attempted: null };
  const made = numeric(match[2], context), attempted = numeric(match[3], context);
  if (made > attempted) throw new Error(`${context}: made shots exceed attempts.`);
  return { percent: numeric(match[1], context, true), made, attempted };
}
function rowToPlayer(row, rowNumber, metadata) {
  const normalized = new Map(Object.entries(row).map(([key, value]) => [cleanHeader(key), value]));
  const field = (...names) => names.map(name => normalized.get(cleanHeader(name))).find(value => !missing(value));
  const name = String(field('name', 'player', 'playername', 'fullname', 'displayname') || '').trim();
  if (!name || !normalizeName(name)) throw new Error(`Row ${rowNumber}: a player name is required.`);
  const sourceTeam = String(field('team', 'tm') || '').trim();
  const team = teamAbbreviations.get(sourceTeam) || sourceTeam;
  const position = String(field('position', 'pos') || '').trim();
  const stats = Object.fromEntries(statKeys.map(key => [key, null]));
  const inputStats = row.stats && typeof row.stats === 'object' ? row.stats : row;
  for (const [column, value] of Object.entries(inputStats)) {
    const key = aliasLookup.get(cleanHeader(column));
    if (!key) continue;
    if (key === 'fgPct' || key === 'ftPct') {
      const result = parsePercentageCell(value, `${name} ${column}`);
      stats[key] = result.percent;
      const made = key === 'fgPct' ? 'fgm' : 'ftm', attempted = key === 'fgPct' ? 'fga' : 'fta';
      if (result.made !== null && stats[made] === null) stats[made] = result.made;
      if (result.attempted !== null && stats[attempted] === null) stats[attempted] = result.attempted;
    } else stats[key] = numeric(value, `${name} ${column}`);
  }
  for (const [made, attempted] of [['fgm', 'fga'], ['ftm', 'fta']]) {
    if (stats[made] !== null && stats[attempted] !== null && stats[made] > stats[attempted]) {
      throw new Error(`${name}: ${made.toUpperCase()} exceeds ${attempted.toUpperCase()}.`);
    }
  }
  if (!statKeys.some(key => stats[key] !== null)) throw new Error(`${name}: no recognized stat columns were found.`);
  const player = { name, team, position, games: numeric(field('games', 'gp', 'g'), `${name} GP`), stats };
  if (metadata.provider === 'darko') {
    // Source FP/G has no scoring coefficients in the CSV. Preserve it for
    // reference/export only; computeFpts always uses the selected league weights.
    const sourceFpts = field('sourceFpts', 'FP/G');
    if (!missing(sourceFpts)) {
      if (!numberPattern.test(String(sourceFpts).trim()) || !Number.isFinite(Number(sourceFpts))) throw new Error(`${name} FP/G is not a valid number.`);
      player.sourceFpts = Number(sourceFpts);
    }
  }
  for (const key of ['id', 'hashtagId', 'espnId', 'idNamespace']) {
    const value = field(key);
    if (!missing(value)) player[key] = String(value).trim();
  }
  if (player.id && !player.idNamespace && metadata.idNamespace) player.idNamespace = String(metadata.idNamespace);
  return player;
}

// RFC-style quoted delimited text, including commas and newlines inside quotes.
function parseDelimited(text) {
  const firstLine = text.split(/\r?\n/).find(line => line.trim()) || '';
  const delimiter = firstLine.includes('\t') ? '\t' : ',';
  const rows = []; let row = [], cell = '', quoted = false, closedQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') { quoted = false; closedQuote = true; }
      else cell += ch;
    } else if (ch === '"' && cell === '' && !closedQuote) quoted = true;
    else if (ch === delimiter) { row.push(cell.trim()); cell = ''; closedQuote = false; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim()); if (row.some(value => value !== '')) rows.push(row);
      row = []; cell = ''; closedQuote = false;
    } else {
      if (closedQuote && ch.trim()) throw new Error('Unexpected text after a closing CSV quote.');
      if (!closedQuote) cell += ch;
    }
  }
  if (quoted) throw new Error('An imported CSV value has an unclosed quote.');
  row.push(cell.trim()); if (row.some(value => value !== '')) rows.push(row);
  const headerIndex = rows.findIndex(cells => cells.some(cell => ['name', 'player', 'playername', 'fullname'].includes(cleanHeader(cell))));
  if (headerIndex < 0) throw new Error('Include a header row with a PLAYER or NAME column. Paste a tab-separated table or import CSV/JSON.');
  const headers = rows[headerIndex];
  const recognized = headers.map(cleanHeader).filter(key => key && (aliasLookup.has(key) || ['name', 'player', 'playername', 'fullname', 'team', 'tm', 'gp', 'games', 'position', 'pos'].includes(key)));
  if (new Set(recognized).size !== recognized.length) throw new Error('The table has duplicate column headers.');
  return rows.slice(headerIndex + 1).filter(cells => !cells.every((cell, index) => cleanHeader(cell) === cleanHeader(headers[index]))).map((cells, index) => {
    if (cells.length !== headers.length) throw new Error(`Table row ${headerIndex + index + 2} has ${cells.length} cells; expected ${headers.length}.`);
    return Object.fromEntries(headers.map((header, i) => [header, cells[i]]));
  });
}
export function parseImport(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Paste or choose a projection or current-stats file first.');
  const input = text.trim().replace(/^\uFEFF/, '');
  let rows, metadata = {};
  if (input.startsWith('{') || input.startsWith('[')) {
    let json;
    try { json = JSON.parse(input); } catch { throw new Error('The import is not valid JSON.'); }
    rows = Array.isArray(json) ? json : json.players;
    if (!Array.isArray(rows)) throw new Error('JSON must contain a players array.');
    if (!Array.isArray(json) && json.metadata && typeof json.metadata === 'object') metadata = { ...json.metadata };
    for (const key of ['source', 'season', 'period', 'basis', 'updatedAt', 'idNamespace']) {
      if (!Array.isArray(json) && json[key] != null && metadata[key] == null) metadata[key] = json[key];
    }
  } else {
    rows = parseDelimited(input);
    const headers = new Set(Object.keys(rows[0] || {}).map(cleanHeader));
    // The Fantasy Lab export includes this distinctive complete header set.
    if (['rank','player','team','pos','min','pts','reb','ast','stl','blk','3pm','fg%','ft%','tov','fpg'].every(key => headers.has(key))) {
      metadata = { source: 'DARKO Fantasy Lab', provider: 'darko', kind: 'projections', basis: 'per-game', horizon: 'daily', sourceUrl: 'https://www.darko.app/projections' };
    }
  }
  if (metadata.basis && /total/i.test(String(metadata.basis))) throw new Error('Import per-game averages instead of totals.');
  if (!rows.length) throw new Error('The import contains no player rows.');
  if (rows.length > 3000) throw new Error('Import at most 3,000 player rows at a time.');
  const players = rows.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`Row ${index + 1} must be a player object.`);
    return rowToPlayer(row, index + 1, metadata);
  });
  const duplicates = new Set();
  for (const player of players) {
    const key = `${normalizeName(player.name)}|${cleanHeader(player.team)}`;
    if (duplicates.has(key)) throw new Error(`Duplicate player row: ${player.name}${player.team ? ` (${player.team})` : ''}. Remove duplicate or aggregate/team-split rows before importing.`);
    duplicates.add(key);
  }
  const warnings = [];
  if (!metadata.basis || !/^(?:per[- _]?game(?: averages)?|averages)$/i.test(String(metadata.basis))) warnings.push('Confirm these stats are per-game averages before comparing.');
  const withoutGames = players.filter(player => player.games === null).length;
  if (withoutGames && metadata.kind !== 'projections') warnings.push(`${withoutGames} player${withoutGames === 1 ? ' has' : 's have'} no games-played value; a minimum-games filter cannot include them.`);
  if (metadata.provider === 'darko') warnings.push('DARKO uses daily projected minutes and pace, not a rest-of-season forecast. CSV FP/G is reference only; both comparison rows use your Value Lab scoring.');
  if (metadata.provider === 'darko') {
    const omitted = ['fgm','fga','ftm','fta'].filter(key => players.every(p => p.stats[key] == null));
    if (omitted.length) warnings.push(`DARKO FPTS excludes ${omitted.map(key => key.toUpperCase()).join(', ')} when using available-category scoring; this CSV does not supply these stats.`);
  }
  return { players, metadata, warnings };
}

function identityKeys(player) {
  const keys = [];
  if (player.hashtagId != null) keys.push(`hashtag:${String(player.hashtagId)}`);
  if (player.espnId != null) keys.push(`espn:${String(player.espnId)}`);
  if (player.id != null && player.idNamespace) keys.push(`${String(player.idNamespace).toLowerCase()}:${String(player.id)}`);
  return [...new Set(keys)];
}
export function matchPlayers(projections, current) {
  const ps = Array.isArray(projections) ? projections : projections.players;
  const cs = Array.isArray(current) ? current : current.players;
  const proposals = ps.map(projection => {
    const ids = new Set(identityKeys(projection));
    let candidates = cs.map((player, index) => ({ player, index })).filter(({ player }) => identityKeys(player).some(id => ids.has(id)));
    if (!candidates.length) {
      candidates = cs.map((player, index) => ({ player, index })).filter(({ player }) => normalizeName(player.name) === normalizeName(projection.name));
      if (candidates.length > 1 && projection.team) {
        const byTeam = candidates.filter(({ player }) => cleanHeader(player.team) === cleanHeader(projection.team));
        if (byTeam.length) candidates = byTeam;
      }
    }
    return { projection, candidates };
  });
  const useCounts = new Map();
  for (const { candidates } of proposals) {
    if (candidates.length === 1) useCounts.set(candidates[0].index, (useCounts.get(candidates[0].index) || 0) + 1);
  }
  const players = [], unmatchedProjections = [], ambiguous = [], used = new Set();
  for (const { projection, candidates } of proposals) {
    if (!candidates.length) { unmatchedProjections.push(projection); continue; }
    if (candidates.length !== 1 || useCounts.get(candidates[0].index) > 1) {
      ambiguous.push({ projection, candidates: candidates.map(({ player }) => player), reason: candidates.length !== 1 ? 'multiple_current_matches' : 'multiple_projection_matches' });
      continue;
    }
    const { player: actual, index } = candidates[0]; used.add(index);
    players.push({ ...projection, projection: projection.stats, current: actual.stats, games: actual.games, currentPlayer: actual, projectionPlayer: projection });
  }
  return { players, unmatchedProjections, unmatchedCurrent: cs.filter((_, i) => !used.has(i)), ambiguous };
}
export function round(value, digits = 2) {
  if (value == null || !Number.isFinite(value)) return null;
  const result = Math.round((value + Number.EPSILON) * 10 ** digits) / 10 ** digits;
  return Object.is(result, -0) ? 0 : result;
}
export function computeFpts(stats, scoring = DEFAULT_SCORING) {
  let total = 0;
  for (const { key } of STAT_DEFS) {
    const coefficient = Number(scoring[key] ?? 0);
    if (!Number.isFinite(coefficient)) return null;
    if (!coefficient) continue;
    if (stats?.[key] == null || !Number.isFinite(Number(stats[key]))) return null;
    total += Number(stats[key]) * coefficient;
  }
  return round(total, 6);
}
export function statValue(stats, key) {
  if (stats?.[key] != null) return stats[key];
  const pair = key === 'fgPct' ? ['fgm','fga'] : key === 'ftPct' ? ['ftm','fta'] : null;
  if (!pair || stats?.[pair[0]] == null || !(stats?.[pair[1]] > 0)) return null;
  return stats[pair[0]] / stats[pair[1]];
}
export function comparePlayers(matched, scoring = DEFAULT_SCORING) {
  const players = Array.isArray(matched) ? matched : matched.players;
  return players.map(player => {
    const currentFpts = computeFpts(player.current, scoring), projectionFpts = computeFpts(player.projection, scoring);
    const delta = currentFpts === null || projectionFpts === null ? null : round(currentFpts - projectionFpts, 6);
    const statDeltas = {}, statPerformance = {};
    for (const { key } of [...STAT_DEFS, ...PERCENT_DEFS]) {
      const actual = statValue(player.current, key), projection = statValue(player.projection, key);
      statDeltas[key] = actual == null || projection == null ? null : round(actual - projection, 6);
      statPerformance[key] = statDeltas[key] === null ? null : Math.sign(statDeltas[key] * (Number(scoring[key]) < 0 ? -1 : 1));
    }
    return { ...player, currentFpts, projectionFpts, delta, gapPercent: delta === null || !projectionFpts ? null : round(delta / Math.abs(projectionFpts) * 100, 6), statDeltas, statPerformance };
  });
}
