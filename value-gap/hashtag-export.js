/* Paste this entire script into the browser console on the Hashtag table you want to export. */
(() => {
  'use strict';

  if (!/(^|\.)hashtagbasketball\.com$/i.test(location.hostname)) {
    throw new Error('Open your Hashtag Basketball table before running this exporter.');
  }

  const visible = element => Boolean(element.getClientRects().length) &&
    getComputedStyle(element).visibility !== 'hidden';
  const clean = value => String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const headerKey = value => clean(value).toUpperCase().replace(/[^A-Z0-9%]/g, '');
  const number = value => {
    const match = clean(value).replace(/,/g, '').match(/[-+]?\d*\.?\d+/);
    return match ? Number(match[0]) : null;
  };
  const cellText = cell => {
    if (!cell) return '';
    const text = clean(cell.innerText);
    if (text) return text;
    const input = [...cell.querySelectorAll('input')].find(element =>
      visible(element) && !['hidden', 'checkbox', 'radio', 'button', 'submit'].includes(element.type));
    return input ? clean(input.value) : '';
  };

  // Read rendered tables, selected labels, and whitelisted scoring controls only.
  // Never fetch URLs, read cookies, or read login/password fields.
  const selectedControls = [...document.querySelectorAll('select')]
    .filter(visible)
    .map(select => ({
      name: select.id || select.name || 'select',
      selected: clean(select.selectedOptions[0]?.textContent),
      value: clean(select.value),
      options: [...select.options].map(option => clean(option.textContent))
    }));
  const sourceControl = selectedControls.find(control => /DDDURATION$/i.test(control.name)) ||
    selectedControls.find(control => control.options.some(option => /projections?/i.test(option)) &&
      control.options.some(option => /regular season rankings|last\s+\d+\s+days/i.test(option)));
  const selectedSource = sourceControl?.selected || '';
  const perGame = /per[\s-]*game|per[\s-]*g\b|averages?/i;
  const total = /\btotals?\b/i;
  const basisControl = selectedControls.find(control =>
    control.options.some(option => perGame.test(option)) &&
    control.options.some(option => total.test(option)));
  if (basisControl && total.test(basisControl.selected) && !perGame.test(basisControl.selected)) {
    throw new Error('Select per-game averages on Hashtag, let the table refresh, then run the exporter again. Totals cannot be compared directly with per-game projections.');
  }
  const blendedSource = (sourceControl ? [sourceControl] : selectedControls)
    .find(control => /\b(?:BLEND|STREAM)\s*\d*/i.test(control.selected));
  if (blendedSource) {
    throw new Error(`Selected source is "${blendedSource.selected}". Select pure rest-of-season projections rather than a BLEND or STREAM source, then export again.`);
  }
  const basis = (basisControl && perGame.test(basisControl.selected) && !total.test(basisControl.selected)) ||
    selectedControls.some(control => /per[\s-]*game/i.test(control.selected) && !total.test(control.selected))
    ? 'per-game' : 'unconfirmed';

  const aliases = {
    name: ['PLAYER', 'NAME', 'PLAYERNAME'],
    team: ['TEAM', 'NBATEAM'],
    position: ['POS', 'POSITION', 'POSITIONS'],
    games: ['GP', 'GAMES', 'GAMESPLAYED'],
    min: ['MPG', 'MIN', 'MINUTES'],
    pts: ['PTS', 'POINTS'],
    reb: ['TREB', 'REB', 'REBOUNDS', 'TOTALREBOUNDS'],
    ast: ['AST', 'ASSISTS'],
    stl: ['STL', 'STEALS'],
    blk: ['BLK', 'BLOCKS'],
    tov: ['TO', 'TOV', 'TURNOVERS'],
    fg3m: ['3PM', '3PTM', '3P', '3PT', 'THREES'],
    fgm: ['FGM', 'FIELDGOALSMADE'],
    fga: ['FGA', 'FIELDGOALSATTEMPTED'],
    ftm: ['FTM', 'FREETHROWSMADE'],
    fta: ['FTA', 'FREETHROWSATTEMPTED'],
    fg: ['FG%', 'FGPCT'],
    ft: ['FT%', 'FTPCT']
  };
  const mapColumns = row => {
    const keys = [...row.cells].map(cell => headerKey(cell.innerText));
    return Object.fromEntries(Object.entries(aliases).map(([stat, names]) =>
      [stat, keys.findIndex(key => names.includes(key))]));
  };
  const candidates = [...document.querySelectorAll('table')]
    .filter(visible)
    .map(table => {
      const rows = [...table.rows].filter(row => visible(row) && row.closest('table') === table);
      const header = rows.find(row => {
        const columns = mapColumns(row);
        return columns.name >= 0 && columns.pts >= 0 && columns.ast >= 0;
      });
      return header ? { table, rows, header, columns: mapColumns(header) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.rows.length - a.rows.length);
  const candidate = candidates[0];
  if (!candidate) {
    throw new Error('No visible player table with PLAYER/NAME, PTS and AST headers was found. Open the projections or current-stat table and wait for it to load.');
  }

  const { rows, header, columns } = candidate;
  const players = [];
  const seen = new Set();
  for (const row of rows.slice(rows.indexOf(header) + 1)) {
    const cells = [...row.cells];
    const nameCell = cells[columns.name];
    if (!nameCell) continue;
    const anchor = [...nameCell.querySelectorAll('a')].find(link => /\/\d+\/player(?:[/?#]|$)/i.test(link.href));
    const name = clean(anchor ? anchor.textContent : cellText(nameCell));
    const pts = number(cellText(cells[columns.pts]));
    const ast = number(cellText(cells[columns.ast]));
    if (!name || pts === null || ast === null || aliases.name.includes(headerKey(name))) continue;
    const hashtagId = anchor?.href.match(/\/(\d+)\/player(?:[/?#]|$)/i)?.[1] || null;
    const team = columns.team >= 0 ? cellText(cells[columns.team]) : '';
    const key = hashtagId || `${name.toLocaleLowerCase()}|${team.toLocaleLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const stats = {};
    for (const stat of ['min', 'pts', 'reb', 'ast', 'stl', 'blk', 'tov', 'fg3m', 'fgm', 'fga', 'ftm', 'fta']) {
      if (columns[stat] < 0) continue;
      const value = number(cellText(cells[columns[stat]]));
      if (value !== null) stats[stat] = value;
    }
    for (const [column, made, attempted] of [['fg', 'fgm', 'fga'], ['ft', 'ftm', 'fta']]) {
      if (columns[column] < 0) continue;
      const pair = cellText(cells[columns[column]]).match(/\(?\s*(\d*\.?\d+)\s*\/\s*(\d*\.?\d+)\s*\)?/);
      if (pair) {
        if (stats[made] === undefined) stats[made] = Number(pair[1]);
        if (stats[attempted] === undefined) stats[attempted] = Number(pair[2]);
      }
    }
    players.push({
      hashtagId,
      name,
      team,
      position: columns.position >= 0 ? cellText(cells[columns.position]) : '',
      games: columns.games >= 0 ? number(cellText(cells[columns.games])) : null,
      stats
    });
  }
  if (!players.length) throw new Error('The visible table contained no readable player rows.');

  const kind = /projections?/i.test(selectedSource) ? 'projections'
    : /rankings|regular season|last\s+\d+\s+(?:days|games)/i.test(selectedSource) ? 'current'
    : /projections?/i.test(location.pathname) ? 'projections' : 'current';
  const selectedSources = selectedControls.map(({ name, selected, value }) => ({ name, selected, value }));
  const rosControl = (sourceControl ? [sourceControl] : selectedControls)
    .find(control => /rest[\s-]*of[\s-]*season|\bROS\b/i.test(control.selected));
  const recentDays = selectedSource.match(/\blast\s+(\d+)\s+days\b/i);
  const recentGames = selectedSource.match(/\blast\s+(\d+)\s+games\b/i);
  const period = kind !== 'current' ? null : recentDays ? `days-${recentDays[1]}`
    : recentGames ? recentGames[1] : /regular season|season.to.date/i.test(selectedSource) ? 'season' : null;
  const heading = clean(document.querySelector('h1,h2,h3,h4,h5')?.textContent);
  const season = `${selectedSource} ${heading} ${document.title}`.match(/\b(20\d{2})\s*[-–/]\s*(20\d{2}|\d{2})\b/);
  const seasonStart = season ? Number(season[1]) : null;
  const seasonEnd = season
    ? (season[2].length === 4 ? Number(season[2]) : Math.floor(seasonStart / 100) * 100 + Number(season[2]))
    : null;
  const endingYear = seasonEnd !== null && seasonEnd < seasonStart ? seasonEnd + 100 : seasonEnd;
  const limitControl = selectedControls.find(control => /DDSHOW$/i.test(control.name));
  const limitMatch = limitControl?.selected.match(/\btop\s+(\d+)\b/i);
  const pageLimit = limitMatch ? Number(limitMatch[1]) : null;
  const possibleTruncation = pageLimit !== null ? players.length >= pageLimit : players.length <= 30;
  const warnings = [];
  if (basis === 'unconfirmed') warnings.push('Per-game basis was not detected automatically. Verify the selected basis before importing.');
  if (kind === 'projections' && !rosControl) warnings.push('The selected source did not explicitly identify rest-of-season projections. Confirm the projection horizon.');
  if (possibleTruncation) warnings.push(pageLimit
    ? `The table reached the selected Top ${pageLimit} player limit. Select a larger player list for broader coverage.`
    : 'Only 30 or fewer players were exported. Confirm that subscription access and player filters include everyone needed.');

  const scoringFields = {
    FGM: 'fgm', FGA: 'fga', FTM: 'ftm', FTA: 'fta', '3PM': 'fg3m', PTS: 'pts',
    REB: 'reb', AST: 'ast', STL: 'stl', BLK: 'blk', TO: 'tov', MP: 'min'
  };
  const unsupportedFields = ['3PA', 'DREB', 'OREB', 'GP', 'FGMI', 'TPMI', 'DD', 'TD', 'PF', 'ATO', 'TECH', 'EJCT', 'FTMI', 'TW'];
  const scoring = Object.fromEntries(Object.values(scoringFields).map(key => [key, 0]));
  const unsupportedScoring = [];
  let hasScoringControls = false;
  for (const field of [...Object.keys(scoringFields), ...unsupportedFields]) {
    const input = document.querySelector(`input[id$="_DD${field}"]`);
    const checkbox = document.querySelector(`input[id$="_CB${field}"]`);
    if (!input || !checkbox) continue;
    if (scoringFields[field]) hasScoringControls = true;
    if (!checkbox.checked || input.disabled || checkbox.disabled) continue;
    const raw = clean(input.value);
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw) || !Number.isFinite(Number(raw))) {
      throw new Error(`The enabled ${field} scoring coefficient is not a valid number. Fix it on Hashtag before exporting.`);
    }
    const weight = Number(raw);
    if (scoringFields[field]) scoring[scoringFields[field]] = weight;
    else if (weight !== 0) unsupportedScoring.push(field);
  }
  if (unsupportedScoring.length) warnings.push(`Active scoring categories are not supported by Value Gap: ${unsupportedScoring.join(', ')}. Match your league rules before relying on FPTS.`);
  const metadata = {
    source: 'Hashtag Basketball',
    url: location.href,
    capturedAt: new Date().toISOString(),
    basis,
    kind,
    horizon: rosControl ? 'rest-of-season' : 'unconfirmed',
    ...(selectedSource ? { selectedSource, selectedDuration: selectedSource } : {}),
    ...(period ? { period } : {}),
    selectedSources,
    coverage: 'visible-table',
    possibleTruncation,
    ...(pageLimit !== null ? { pageLimit } : {}),
    ...(hasScoringControls ? { scoring, unsupportedScoring } : {}),
    warnings,
    ...(season ? { season: endingYear, sourceSeasonLabel: `${season[1]}-${season[2]}` } : {})
  };
  const file = new Blob([JSON.stringify({ players, metadata }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(file);
  const download = document.createElement('a');
  download.href = url;
  download.download = `hashtag-${kind}-${metadata.capturedAt.slice(0, 10)}.json`;
  document.body.append(download);
  download.click();
  download.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  console.info(`Exported ${players.length} ${kind} rows from the visible Hashtag table.`, metadata);
  for (const warning of warnings) console.warn(warning);
})();
