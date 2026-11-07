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

  // Only read rendered tables and selected labels. This script never fetches URLs,
  // reads cookies, or reads login/password fields.
  const selectedControls = [...document.querySelectorAll('select')]
    .filter(visible)
    .map(select => ({
      name: select.id || select.name || 'select',
      selected: clean(select.selectedOptions[0]?.textContent),
      options: [...select.options].map(option => clean(option.textContent))
    }));
  const perGame = /per[\s-]*game|per[\s-]*g\b|averages?/i;
  const total = /\btotals?\b/i;
  const basisControl = selectedControls.find(control =>
    control.options.some(option => perGame.test(option)) &&
    control.options.some(option => total.test(option)));
  if (basisControl && total.test(basisControl.selected) && !perGame.test(basisControl.selected)) {
    throw new Error('Select per-game averages on Hashtag, let the table refresh, then run the exporter again. Totals cannot be compared directly with per-game projections.');
  }
  const blendControl = selectedControls.find(control => /\bblend\b/i.test(control.selected));
  if (blendControl) {
    throw new Error(`Selected source is "${blendControl.selected}". Select pure rest-of-season projections rather than a BLEND source, then export again.`);
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

  const kind = /projections?/i.test(location.pathname) ? 'projections' : 'current';
  const selectedSources = selectedControls.map(({ name, selected }) => ({ name, selected }));
  const rosControl = selectedControls.find(control => /rest[\s-]*of[\s-]*season|\bROS\b/i.test(control.selected));
  const heading = clean(document.querySelector('h1,h2,h3,h4,h5')?.textContent);
  const season = `${heading} ${document.title}`.match(/\b(20\d{2})\s*[-–/]\s*(20\d{2}|\d{2})\b/);
  const seasonStart = season ? Number(season[1]) : null;
  const seasonEnd = season
    ? (season[2].length === 4 ? Number(season[2]) : Math.floor(seasonStart / 100) * 100 + Number(season[2]))
    : null;
  const endingYear = seasonEnd !== null && seasonEnd < seasonStart ? seasonEnd + 100 : seasonEnd;
  const metadata = {
    source: 'Hashtag Basketball',
    url: location.href,
    capturedAt: new Date().toISOString(),
    basis,
    kind,
    horizon: rosControl ? 'rest-of-season' : 'unconfirmed',
    selectedSources,
    coverage: 'visible-table',
    possibleTruncation: players.length <= 30,
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
  if (basis === 'unconfirmed') console.warn('Per-game basis was not detected automatically. Verify the selected basis before importing this file.');
  if (kind === 'projections' && !rosControl) console.warn('The selected source did not explicitly identify rest-of-season projections. Confirm the projection horizon before using this as your ROS baseline.');
  if (metadata.possibleTruncation) console.warn('Only 30 or fewer players were exported. The public projection page is capped at 30. Sign in, select the full player list and re-export if you need all players.');
})();
