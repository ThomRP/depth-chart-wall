import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('./engine.js', import.meta.url), 'utf8');
const { parseImport, matchPlayers, comparePlayers, computeFpts, normalizeName, DEFAULT_SCORING } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const stats = {pts:20,reb:5,ast:4,stl:1,blk:1,tov:2};
const player = (name, team, extra = {}) => ({name,team,stats:{...stats},games:10,...extra});

test('custom FPTS, negative weights, and missing weighted fields', () => {
  assert.equal(computeFpts(stats), 36);
  assert.equal(computeFpts({...stats,tov:1}),37);
  assert.equal(computeFpts(stats,{...DEFAULT_SCORING,fgm:2}),null);
  assert.equal(computeFpts({...stats,fgm:0},{...DEFAULT_SCORING,fgm:2}),36);
  assert.equal(computeFpts({pts:12},{pts:1}),12);
});
test('fewer turnovers improve a stat delta, projection zero has no percentage', () => {
  const [comparison] = comparePlayers([{current:{...stats,tov:1},projection:stats}],DEFAULT_SCORING);
  assert.equal(comparison.delta,1);
  assert.equal(comparison.statDeltas.tov,-1);
  assert.equal(comparison.statPerformance.tov,1);
  assert.equal(comparePlayers([{current:{pts:2},projection:{pts:0}}],{pts:1})[0].gapPercent,null);
});
test('Hashtag TSV reads made/attempted values from percentage cells', () => {
  const imported = parseImport('RANK\tPOS\tPLAYER\tTEAM\tGP\tMPG\tFG%\tFT%\t3PM\tPTS\tTREB\tAST\tSTL\tBLK\tTO\n1\tC\tNikola Jokić\tDEN\t70\t35.2\t0.580 (10.0/17.2)\t0.810 (5.0/6.2)\t1.4\t26.4\t12.2\t9.5\t1.5\t0.7\t3.4');
  assert.equal(imported.players[0].stats.fgm,10);
  assert.equal(imported.players[0].stats.fta,6.2);
  assert.equal(imported.players[0].stats.fg3m,1.4);
  assert.equal(imported.players[0].stats.reb,12.2);
  assert.equal(imported.players[0].stats.fgPct,0.58);
});
test('CSV quoted commas and JSON nulls stay valid without zero fabrication', () => {
  const imported = parseImport('NAME,TEAM,PTS,AST\n"Example, Player",ABC,12.3,');
  assert.equal(imported.players[0].name,'Example, Player');
  assert.equal(imported.players[0].stats.ast,null);
  const json = parseImport(JSON.stringify({basis:'per-game',idNamespace:'espn',players:[{name:'A Player',id:'1',stats:{pts:0,reb:null}}]}));
  assert.equal(json.players[0].stats.pts,0);
  assert.equal(json.players[0].stats.reb,null);
  assert.equal(json.players[0].idNamespace,'espn');
});
test('reject duplicates, invalid numeric fields, malformed rows and shot counts', () => {
  assert.throws(()=>parseImport('PLAYER,TEAM,PTS\nNikola Jokic,DEN,20\nNikola Jokić,DEN,21'),/Duplicate/);
  assert.throws(()=>parseImport('PLAYER,PTS\nPerson,bad'),/valid number/);
  assert.throws(()=>parseImport('PLAYER,PTS\nPerson,2,3'),/cells/);
  assert.throws(()=>parseImport('PLAYER,FGM,FGA\nPerson,4,3'),/exceeds/);
  assert.throws(()=>parseImport('PLAYER,PTS\n"Person,3'),/unclosed/);
});
test('names normalize accents, initials, suffixes and punctuation', () => {
  assert.equal(normalizeName('Nikola Jokić'),normalizeName('Nikola Jokic'));
  assert.equal(normalizeName('P.J. Washington Jr.'),normalizeName('PJ Washington'));
  assert.equal(normalizeName('Karl-Anthony Towns'),normalizeName('Karl Anthony Towns'));
});
test('match explicit namespaces; unrelated generic ids cannot override names', () => {
  const projections = [player('First Player','AAA',{id:'1'}),player('Nikola Jokić','DEN',{hashtagId:'22'})];
  const current = [player('Wrong Player','AAA',{id:'1'}),player('Nikola Jokic','DEN',{espnId:'22'})];
  const matched=matchPlayers(projections,current);
  assert.equal(matched.players.length,1);
  assert.equal(matched.players[0].name,'Nikola Jokić');
  assert.equal(matched.unmatchedProjections.length,1);
  assert.equal(matched.unmatchedCurrent.length,1);
  assert.equal(matchPlayers([player('Old Name','AAA',{espnId:'1'})],[player('New Name','AAA',{espnId:'1'})]).players.length,1);
});
test('ambiguous name collisions cannot silently overwrite or reuse a player', () => {
  const current=[player('Same Name','AAA'),player('Same Name','BBB')];
  assert.equal(matchPlayers([player('Same Name','')],current).ambiguous.length,1);
  assert.equal(matchPlayers([player('Same Name','BBB')],current).players[0].currentPlayer.team,'BBB');
  const repeated = matchPlayers([player('Same Name','AAA'),player('Same Name','BBB')],[player('Same Name','AAA')]);
  assert.equal(repeated.players.length,0);
  assert.equal(repeated.ambiguous.length,2);
});
