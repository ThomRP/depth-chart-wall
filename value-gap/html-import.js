import { parseImport } from './engine.js';

const clean = value => String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
const headerKey = value => clean(value).toUpperCase().replace(/[^A-Z0-9%]/g, '');
const aliases = {
  name: ['PLAYER', 'NAME', 'PLAYERNAME'], team: ['TEAM', 'TM', 'NBATEAM'], position: ['POS', 'POSITION', 'POSITIONS'],
  games: ['GP', 'G', 'GAMES', 'GAMESPLAYED'], min: ['MPG', 'MIN', 'MINUTES'],
  pts: ['PTS', 'POINTS'], reb: ['TREB', 'REB', 'TRB', 'REBOUNDS', 'TOTALREBOUNDS'],
  ast: ['AST', 'ASSISTS'], stl: ['STL', 'STEALS'], blk: ['BLK', 'BLOCKS'], tov: ['TO', 'TOV', 'TURNOVERS'],
  fg3m: ['3PM', '3PTM', 'FG3M', '3P', 'THREES'], fgm: ['FGM', 'FIELDGOALSMADE'], fga: ['FGA', 'FIELDGOALSATTEMPTED'],
  ftm: ['FTM', 'FREETHROWSMADE'], fta: ['FTA', 'FREETHROWSATTEMPTED'], fgPct: ['FG%', 'FGPCT'], ftPct: ['FT%', 'FTPCT']
};
const statisticKeys = Object.keys(aliases).filter(key => !['name', 'team', 'position', 'games'].includes(key));
const cellsOf = row => [...row.children].filter(cell => ['td', 'th'].includes(cell.localName));
const rowsOf = table => [...table.querySelectorAll('tr')].filter(row => row.closest('table') === table);
const isControl = (element, suffix) => [element.id, element.getAttribute('name')].filter(Boolean).some(value => { const name = value.toUpperCase(); return name === suffix || name.endsWith(`_${suffix}`) || name.endsWith(`$${suffix}`); });
function columnsOf(row) {
  const headers = cellsOf(row).map(cell => headerKey(cell.textContent));
  return Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, headers.findIndex(header => names.includes(header))]));
}
function selectedControl(document, suffix) {
  const select = [...document.querySelectorAll('select')].find(element => isControl(element, suffix));
  if (!select) return null;
  // Read the saved selection, rather than relying on browser default selection.
  const option = select.querySelector('option[selected]');
  if (!option) return null;
  return { selected: clean(option.textContent), value: option.getAttribute('value') ?? '', name: suffix };
}
function scoringOf(document) {
  const inputs = [...document.querySelectorAll('input')];
  const find = suffix => inputs.find(input => isControl(input, suffix));
  const supported = { min: 'MP', pts: 'PTS', reb: 'REB', ast: 'AST', stl: 'STL', blk: 'BLK', tov: 'TO', fg3m: '3PM', fgm: 'FGM', fga: 'FGA', ftm: 'FTM', fta: 'FTA' };
  const unsupported = ['3PA', 'DREB', 'OREB', 'GP', 'FGMI', 'TPMI', 'DD', 'TD', 'PF', 'ATO', 'TECH', 'EJCT', 'FTMI', 'TW'];
  const enabledWeight = category => {
    const checkbox = find(`CB${category}`), weight = find(`DD${category}`);
    if (!checkbox || !weight || !checkbox.hasAttribute('checked') || checkbox.hasAttribute('disabled') || weight.hasAttribute('disabled') || checkbox.closest('fieldset[disabled]') || weight.closest('fieldset[disabled]')) return 0;
    const raw = clean(weight.getAttribute('value'));
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw) || !Number.isFinite(Number(raw)) || Math.abs(Number(raw)) > 10000) throw new Error(`The saved scoring weight for ${category} is invalid. Review it on Hashtag before importing.`);
    return Number(raw);
  };
  const hasScoring = Object.values(supported).some(category => find(`CB${category}`));
  return {
    ...(hasScoring ? { scoring: Object.fromEntries(Object.entries(supported).map(([key, category]) => [key, enabledWeight(category)])) } : {}),
    unsupportedScoring: unsupported.filter(category => enabledWeight(category) !== 0)
  };
}
function endingYear(label) {
  const range = label.match(/\b(20\d{2})\s*[-–/]\s*(20\d{2}|\d{2})\b/);
  if (range) return Number(range[2].length === 2 ? `${range[1].slice(0, 2)}${range[2]}` : range[2]);
  const single = label.match(/\b(20\d{2})\b/);
  return single ? Number(single[1]) : null;
}
function plainName(cell) {
  // Responsive Hashtag pages save both full and abbreviated names in one cell.
  const full = cell.querySelector('.d-none.d-sm-inline') || cell.querySelector('[data-full-name]');
  const profileAnchor = [...(full || cell).querySelectorAll('a[href]')].find(anchor => /\/\d+\/player(?:[/?#]|$)/i.test(anchor.getAttribute('href')));
  const element = (profileAnchor || full || cell).cloneNode(true);
  for (const unwanted of element.querySelectorAll('script,style,[data-bs-toggle],[data-toggle],.d-inline.d-sm-none,.text-success,.text-dark,i,button')) unwanted.remove();
  return clean(element.textContent);
}
function positionOf(cell) {
  const segments = [...cell.querySelectorAll('.pos-pill__seg')].map(element => clean(element.textContent)).filter(Boolean);
  return segments.length ? segments.join('/') : clean(cell.textContent);
}

export function looksLikeHashtagHtml(text) {
  return typeof text === 'string' && /<(?:!doctype\s+html|html\b|table\b)/i.test(text);
}

// Parse a detached, inert document. Imported HTML is never inserted into the live
// page, executed, retained, or exported. Only whitelisted table/control text leaves
// this function; scripts, viewstate, tooltips, accounts and passwords are ignored.
export function parseHashtagHtml(text) {
  if (!looksLikeHashtagHtml(text)) throw new Error('Choose a saved HTML page containing the Hashtag player table.');
  if (typeof DOMParser === 'undefined') throw new Error('HTML import needs a browser with DOMParser support.');
  if (text.length > 12 * 1024 * 1024) throw new Error('Choose an HTML page smaller than 12 MB.');
  const document = new DOMParser().parseFromString(text, 'text/html');
  const duration = selectedControl(document, 'DDDURATION');
  const rank = selectedControl(document, 'DDRANK');
  const show = selectedControl(document, 'DDSHOW');
  const selectedDuration = duration?.selected || '';
  if (/BLEND|STREAM|short[\s-]*term/i.test(selectedDuration)) throw new Error('This saved page uses a BLEND or STREAM source. Select pure rest-of-season projections and save it again.');
  if (rank && (/\btotals?\b/i.test(rank.selected) || /^TOT(?:AL)?$/i.test(rank.value))) throw new Error('This saved page uses totals. Select Per-game Average and save it again.');
  const basis = rank && (/per[\s-]*game|average/i.test(rank.selected) || /^AVG$/i.test(rank.value)) ? 'per-game' : 'unconfirmed';
  const isProjection = /projections?/i.test(selectedDuration);
  const recentDays = selectedDuration.match(/\blast\s+(\d+)\s+days?\b/i);
  const kind = isProjection ? 'projections' : recentDays || /regular[\s-]*season/i.test(selectedDuration) ? 'current' : 'unconfirmed';
  const horizon = isProjection && /rest[\s-]*of[\s-]*season|\bROS\b/i.test(selectedDuration) ? 'rest-of-season' : 'unconfirmed';
  const candidates = [...document.querySelectorAll('table')].map(table => {
    const rows = rowsOf(table);
    const headerIndex = rows.findIndex(row => { const columns = columnsOf(row); return columns.name >= 0 && columns.pts >= 0 && columns.ast >= 0; });
    return headerIndex < 0 ? null : { rows, headerIndex, columns: columnsOf(rows[headerIndex]) };
  }).filter(Boolean).sort((a, b) => b.rows.length - a.rows.length);
  if (!candidates.length) throw new Error('No player table with PLAYER, PTS and AST headers was found in this HTML.');
  const { rows, headerIndex, columns } = candidates[0];
  const players = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const cells = cellsOf(row);
    const nameCell = cells[columns.name];
    if (!nameCell || !clean(nameCell.textContent)) continue;
    if (aliases.name.includes(headerKey(nameCell.textContent))) continue;
    const name = plainName(nameCell);
    if (!name) throw new Error(`Player table row ${players.length + 1} has no readable full name.`);
    const get = key => columns[key] >= 0 && cells[columns[key]] ? clean(cells[columns[key]].textContent) : null;
    const stats = Object.fromEntries(statisticKeys.filter(key => columns[key] >= 0).map(key => [key, get(key)]));
    const anchor = [...nameCell.querySelectorAll('a[href]')].find(element => /\/\d+\/player(?:[/?#]|$)/i.test(element.getAttribute('href')));
    const hashtagId = anchor?.getAttribute('href').match(/\/(\d+)\/player(?:[/?#]|$)/i)?.[1];
    players.push({ name, team: get('team') || '', position: columns.position >= 0 && cells[columns.position] ? positionOf(cells[columns.position]) : '', games: get('games'), stats, ...(hashtagId ? { hashtagId } : {}) });
  }
  const season = endingYear(selectedDuration);
  const limitNumber = show ? Number(show.value || show.selected.match(/\d+/)?.[0]) : null;
  const pageLimit = Number.isInteger(limitNumber) && limitNumber > 0 ? limitNumber : null;
  const metadata = {
    source: 'Hashtag Basketball', sourceType: 'saved-html', kind, basis, selectedDuration, selectedSource: selectedDuration, ...scoringOf(document),
    ...(isProjection ? { horizon } : {}), ...(season ? { season } : {}),
    ...(kind === 'current' ? { period: recentDays ? `days-${Number(recentDays[1])}` : 'season' } : {}),
    selectedSources: [duration, rank, show].filter(Boolean).map(({ name, selected }) => ({ name, selected })),
    coverage: 'visible-table', pageLimit, possibleTruncation: pageLimit !== null || players.length <= 30
  };
  const imported = parseImport(JSON.stringify({ players, metadata }));
  if (metadata.unsupportedScoring.length) imported.warnings.push(`Active scoring categories are outside this version: ${metadata.unsupportedScoring.join(', ')}. They cannot be included in FPTS; review your scoring settings.`);
  if (!duration) imported.warnings.push('The selected Hashtag source was not recorded. Confirm the projection horizon or current-stat window before using this snapshot.');
  if (isProjection && horizon === 'unconfirmed') imported.warnings.push('The selected source does not explicitly say rest-of-season projections. Confirm its horizon.');
  if (pageLimit !== null) imported.warnings.push(`This saved page is limited to Top ${pageLimit}; ${players.length} player rows were imported. Select the largest player list on Hashtag to increase coverage.`);
  else if (players.length <= 30) imported.warnings.push(`Only ${players.length} player rows were imported. Hashtag public projections may be limited to 30; check source coverage.`);
  const minGames = selectedControl(document, 'DDGAMES');
  const position = selectedControl(document, 'DDPOS');
  const injury = selectedControl(document, 'DDINJ');
  const teamFilter = selectedControl(document, 'DDTEAM');
  if (minGames && Number(minGames.value) > 1) imported.warnings.push(`The saved source filters out players with fewer than ${Number(minGames.value)} games.`);
  if (position && !/^(?:all|0)$/i.test(position.value)) imported.warnings.push(`The saved source is filtered to position ${position.selected}.`);
  if (injury && /^(?:no|false|0)$/i.test(injury.value)) imported.warnings.push('The saved source hides injured players.');
  if (teamFilter && teamFilter.value !== '0' && !/^all$/i.test(teamFilter.value)) imported.warnings.push('The saved source is restricted to a selected fantasy roster.');
  return imported;
}
