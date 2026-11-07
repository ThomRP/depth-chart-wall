import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DOMParser } from 'linkedom';
globalThis.DOMParser = DOMParser;
const engine = await readFile(new URL('./engine.js', import.meta.url), 'utf8');
const engineUrl = `data:text/javascript;base64,${Buffer.from(engine).toString('base64')}`;
const source = (await readFile(new URL('./html-import.js', import.meta.url), 'utf8')).replace("'./engine.js'", JSON.stringify(engineUrl));
const { parseHashtagHtml, looksLikeHashtagHtml } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const html = ({duration='2026-27 Rest-of-Season Projections',basis='Per-game Average',show='100',profile=false}={}) => `<!DOCTYPE html><html><head><title>Fantasy Points League Rankings</title><script>globalThis.__htmlImportExecuted=true;</script></head><body>
<input type="password" value="SECRET"><input name="__VIEWSTATE" value="PRIVATE-VIEWSTATE">
<select id="ContentPlaceHolder1_DDDURATION"><option selected value="0">${duration}</option><option>BLEND7</option></select>
<select id="ContentPlaceHolder1_DDRANK"><option selected value="${basis==='Total'?'TOT':'AVG'}">${basis}</option></select>
<select id="ContentPlaceHolder1_DDSHOW"><option selected value="${show}">Top ${show}</option></select>
<table><tr><th>PLAYER</th><th>AVG</th><th>POS</th><th>TEAM</th><th>GP</th><th>MPG</th><th>FGM</th><th>FGA</th><th>FTM</th><th>FTA</th><th>3PM</th><th>PTS</th><th>TREB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th></tr>
<tr><td><span class="d-none d-sm-inline">${profile?'<a href="/123/player">Alex Example</a>':'Alex Example'}<span data-bs-toggle="tooltip" title="PRIVATE-TEAM"><i></i></span></span><span class="d-inline d-sm-none">A.Example</span><span class="text-dark">PRIVATE-NOTE</span></td><td>99.9</td><td><span class="pos-pill__seg">PG</span><span class="pos-pill__seg">SG</span></td><td>AAA</td><td>70</td><td>32.1</td><td>8.2</td><td>17.1</td><td>4.2</td><td>5.1</td><td>2.7</td><td>23.3</td><td>4.5</td><td>7.2</td><td>1.1</td><td>0.3</td><td>2.8</td></tr></table></body></html>`;
const domTest = test;
test('detects saved HTML separately from delimited tables',()=>{assert.equal(looksLikeHashtagHtml(html()),true);assert.equal(looksLikeHashtagHtml('PLAYER,PTS\nAlex,20'),false);});
domTest('selected duration overrides rankings title; full names and canonical stats extracted',()=>{
  const imported=parseHashtagHtml(html());
  assert.equal(imported.metadata.kind,'projections');assert.equal(imported.metadata.horizon,'rest-of-season');assert.equal(imported.metadata.season,2027);assert.equal(imported.metadata.basis,'per-game');
  assert.equal(imported.players.length,1);assert.equal(imported.players[0].name,'Alex Example');assert.equal(imported.players[0].position,'PG/SG');assert.equal(imported.players[0].stats.pts,23.3);assert.equal(imported.players[0].stats.fga,17.1);assert.equal(imported.players[0].games,70);
  assert.equal(imported.metadata.pageLimit,100);assert.ok(imported.warnings.some(w=>w.includes('Top 100')));assert.equal(imported.metadata.capturedAt,undefined);
});
domTest('inert extraction excludes scripts, secrets, notes, and inferred IDs',()=>{
  const imported=parseHashtagHtml(html());const output=JSON.stringify(imported);
  assert.equal(globalThis.__htmlImportExecuted,undefined);assert.equal(output.includes('PRIVATE'),false);assert.equal(output.includes('SECRET'),false);assert.equal(imported.players[0].hashtagId,undefined);
  assert.equal(parseHashtagHtml(html({profile:true})).players[0].hashtagId,'123');
});
domTest('current regular season and calendar-day windows have distinct periods',()=>{
  assert.equal(parseHashtagHtml(html({duration:'2026-27 Regular Season Rankings'})).metadata.period,'season');
  for(const days of [7,14,30]){const m=parseHashtagHtml(html({duration:`Last ${days} days (2026-27 Regular Season)`})).metadata;assert.equal(m.kind,'current');assert.equal(m.period,`days-${days}`);assert.equal(m.season,2027);}
});
domTest('explicit totals, BLEND and STREAM snapshots are rejected',()=>{
  assert.throws(()=>parseHashtagHtml(html({basis:'Total'})),/totals/);
  assert.throws(()=>parseHashtagHtml(html({duration:'2026-27 Rest-of-Season Projections (BLEND7)'})),/BLEND/);
  assert.throws(()=>parseHashtagHtml(html({duration:'2026-27 Short-term Projections (STREAM14)'})),/STREAM/);
});
domTest('missing saved selection stays unconfirmed and malformed stats are rejected',()=>{
  const unknown=parseHashtagHtml(html().replaceAll('selected','not-selected'));
  assert.equal(unknown.metadata.basis,'unconfirmed');assert.equal(unknown.metadata.kind,'unconfirmed');assert.ok(unknown.warnings.some(w=>w.includes('not recorded')));
  assert.throws(()=>parseHashtagHtml(html().replace('<td>23.3</td>','<td>invalid</td>')),/valid number/);
});
domTest('only checked, enabled scoring coefficients are included; unsupported weights reported',()=>{
  const controls='<input id="ContentPlaceHolder1_CBPTS" type="checkbox" checked><input id="ContentPlaceHolder1_DDPTS" value="1">'+
    '<input id="ContentPlaceHolder1_CBTO" type="checkbox" checked><input id="ContentPlaceHolder1_DDTO" value="-2">'+
    '<input id="ContentPlaceHolder1_CBFGM" type="checkbox" checked><input id="ContentPlaceHolder1_DDFGM" value="2">'+
    '<input id="ContentPlaceHolder1_CBMP" type="checkbox"><input id="ContentPlaceHolder1_DDMP" value="100" disabled>'+
    '<input id="ContentPlaceHolder1_CBDREB" type="checkbox"><input id="ContentPlaceHolder1_DDDREB" value="0" disabled>'+
    '<input id="ContentPlaceHolder1_CBREB" type="checkbox" checked><input id="ContentPlaceHolder1_DDREB" value="1">'+
    '<input id="ContentPlaceHolder1_CB3PA" type="checkbox"><input id="ContentPlaceHolder1_DD3PA" value="1" disabled>'+
    '<input id="ContentPlaceHolder1_CBTD" type="checkbox" checked><input id="ContentPlaceHolder1_DDTD" value="20">'+
    '<input id="ContentPlaceHolder1_CBPF" type="checkbox" checked><input id="ContentPlaceHolder1_DDPF" value="1" disabled>';
  const imported=parseHashtagHtml(html().replace('</body>',controls+'</body>'));
  assert.equal(imported.metadata.scoring.pts,1);assert.equal(imported.metadata.scoring.tov,-2);assert.equal(imported.metadata.scoring.fgm,2);assert.equal(imported.metadata.scoring.reb,1);assert.equal(imported.metadata.scoring.min,0);
  assert.deepEqual(imported.metadata.unsupportedScoring,['TD']);assert.ok(imported.warnings.some(w=>w.includes('outside this version: TD')));
});
