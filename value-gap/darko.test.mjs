import test from 'node:test';
import assert from 'node:assert/strict';
import { parseImport, computeFpts, matchPlayers, comparePlayers, statValue, DEFAULT_SCORING, normalizeName } from './engine.js';
import { projectionKey, projectionLabel, rememberProjection, unavailableScoredCategories, matchesPosition, positionFilters } from './projection-sources.js';

// Synthetic fixture with the actual Fantasy Lab column layout, not a data snapshot.
const csv = '\uFEFFRank,Player,Team,Pos,Min,PTS,REB,AST,STL,BLK,3PM,FG%,FT%,TOV,FP/G\r\n1,"Example, Center",Denver Nuggets,C-F,30,20,10,5,1,2,2,50.0%,80.0%,3,999\r\n2,Example Guard,Los Angeles Lakers,G,28,15,4,6,2,0,3,45.0%,90.0%,2,888';
const darko = () => parseImport(csv);
const league = { ...DEFAULT_SCORING, fgm: 2, fga: -1, ftm: 1, fta: -1 };

test('DARKO CSV identifies the daily per-game source, preserves percentages and reference FP/G', () => {
  const imported = darko(), player = imported.players[0];
  assert.equal(imported.metadata.provider,'darko');
  assert.equal(imported.metadata.horizon,'daily');
  assert.equal(imported.metadata.kind,'projections');
  assert.equal(imported.metadata.basis,'per-game');
  assert.equal(imported.players.length,2);
  assert.equal(player.name,'Example, Center');
  assert.equal(player.team,'DEN');
  assert.equal(player.position,'C-F');
  assert.equal(player.stats.fg3m,2);
  assert.equal(player.stats.fgPct,0.5);
  assert.equal(player.stats.ftPct,0.8);
  assert.equal(player.sourceFpts,999);
  assert.equal(player.games,null);
  assert.ok(!imported.warnings.some(w=>/minimum-games/.test(w)));
  assert.match(imported.warnings.join(' '),/daily/);
  assert.equal(projectionLabel(imported),'DARKO');
  assert.equal(parseImport('Player,PTS,FP/G\nGeneric Player,20,999').metadata.provider,undefined);
});

test('missing shot volume blocks incompatible scoring; source FP/G never replaces calculated FPTS', () => {
  const imported = darko(), player = imported.players[0];
  for (const key of ['fgm','fga','ftm','fta']) assert.equal(player.stats[key],null);
  assert.equal(computeFpts(player.stats,league),null);
  assert.deepEqual(unavailableScoredCategories(imported,league).map(d=>d.key),['fgm','fga','ftm','fta']);
  const reduced = { ...league, fgm:0, fga:0, ftm:0, fta:0 };
  assert.equal(computeFpts(player.stats,reduced),45.5);
  const actual = { ...player, games:8, stats:{...player.stats,pts:22,fgm:8,fga:16,ftm:4,fta:5} };
  const [comparison] = comparePlayers(matchPlayers(imported.players,[actual]),reduced);
  assert.equal(comparison.delta,2);
  assert.equal(comparison.currentFpts,47.5);
  assert.equal(comparison.projectionFpts,45.5);
});

test('DARKO JSON round trip retains the provider, percentages and signed reference FP/G', () => {
  const imported=darko();
  imported.players[0].sourceFpts=-1;
  const restored=parseImport(JSON.stringify(imported));
  assert.equal(restored.players[0].sourceFpts,-1);
  assert.equal(restored.players[0].stats.fgPct,0.5);
  assert.equal(restored.metadata.horizon,'daily');
  assert.throws(()=>parseImport(csv.replace(',999',',oops')),/FP\/G/);
});

test('source changes preserve both baselines and restore their distinct scoring after reload', () => {
  const hashtag={players:[{name:'Example',stats:{pts:20}}],metadata:{source:'Hashtag Basketball',horizon:'rest-of-season'}};
  let state={projections:hashtag,scoring:league,current:{players:[]},minProjectedFpts:25};
  state=rememberProjection(state,hashtag);
  state=rememberProjection(state,darko());
  assert.equal(state.scoring.fgm,2);
  state.scoring={...state.scoring,fgm:0,fga:0,ftm:0,fta:0};
  state=rememberProjection(state,state.projections);
  state=JSON.parse(JSON.stringify(state));
  state=rememberProjection(state,state.projectionSources.hashtag);
  assert.equal(state.scoring.fgm,2);
  assert.equal(state.projections.metadata.horizon,'rest-of-season');
  state=rememberProjection(state,state.projectionSources.darko);
  assert.equal(state.scoring.fgm,0);
  assert.equal(state.minProjectedFpts,25);
  assert.equal(projectionKey(state.projections),'darko');
  assert.deepEqual(Object.keys(state.projectionSources).sort(),['darko','hashtag']);
});

test('DARKO broad positions filter honestly without inventing precise eligibility', () => {
  assert.deepEqual(positionFilters(darko()),['G','F','C']);
  assert.equal(matchesPosition('C-F','F'),true);
  assert.equal(matchesPosition('C-F','C'),true);
  assert.equal(matchesPosition('G','PG'),false);
  assert.equal(matchesPosition('PG,SG','G'),true);
  assert.equal(matchesPosition('SG,SF','F'),true);
  assert.equal(matchesPosition('G-F','C'),false);
});

test('percentage differences use percentage points; zero attempts remain missing', () => {
  assert.equal(statValue({fgm:8,fga:20},'fgPct'),0.4);
  assert.equal(statValue({ftm:0,fta:0},'ftPct'),null);
  assert.equal(statValue({fgPct:0,fgm:8,fga:20},'fgPct'),0);
  const [comparison]=comparePlayers([{projection:{pts:20,fgPct:0.5},current:{pts:21,fgm:8,fga:20}}],{pts:1});
  assert.equal(comparison.statDeltas.fgPct,-0.1);
  assert.equal(comparison.statPerformance.fgPct,-1);
});

test('documented DARKO name variants match ESPN without fuzzy joins', () => {
  assert.equal(normalizeName("Nah'Shon Hyland"),normalizeName('Bones Hyland'));
  assert.equal(normalizeName('Carlton Carrington'),normalizeName('Bub Carrington'));
  assert.notEqual(normalizeName('Jalen Williams'),normalizeName('Jaylin Williams'));
});
