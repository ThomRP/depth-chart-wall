import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCombinedProjection } from './combined-projections.js';
import { DEFAULT_SCORING, computeFpts, parseImport } from './engine.js';
import { projectionKey, projectionLabel, rememberProjection, rebuildCombinedProjection, identifyProjectionImport } from './projection-sources.js';

const player = (name, stats, other = {}) => ({ name, team:'DEN', position:'C', games:60, stats, ...other });
const hStats = { min:32,pts:20,reb:8,ast:6,stl:1,blk:1,tov:2,fg3m:2,fgm:7,fga:14,ftm:4,fta:5 };
const dStats = { min:24,pts:18,reb:6,ast:3,stl:1.5,blk:0.6,tov:3,fg3m:3,fgPct:0.6,ftPct:0.9 };
const hashtag = (players=[player('Example Center',hStats)]) => ({players,metadata:{provider:'hashtag',source:'Hashtag Basketball',kind:'projections',horizon:'rest-of-season',basis:'per-game',season:2027}});
const darko = (players=[player('Example Center',dStats,{position:'C-F'})]) => ({players,metadata:{provider:'darko',source:'DARKO Fantasy Lab',kind:'projections',horizon:'daily',basis:'per-game',season:2027}});
const league = { ...DEFAULT_SCORING, pts:1,reb:1,ast:2,stl:4,blk:4,tov:-2,fg3m:1,fgm:2,fga:-1,ftm:1,fta:-1 };

test('averages per-minute counting rates at Hashtag minutes and calculates FPTS after the blend', () => {
  const result=buildCombinedProjection(hashtag(),darko()),p=result.players[0];
  assert.equal(p.stats.min,32);
  assert.equal(p.stats.pts,22); // (20 + 18 / 24 * 32) / 2, not (20 + 18) / 2.
  assert.equal(p.stats.reb,8);
  assert.equal(p.stats.ast,5);
  assert.equal(p.stats.stl,1.5);
  assert.equal(p.stats.blk,0.9);
  assert.equal(p.stats.tov,3);
  assert.equal(p.stats.fg3m,3);
  assert.equal(p.components.stats.pts.darkoPerMinute,0.75);
  assert.equal(p.components.stats.pts.darkoAdjusted,24);
  assert.equal(p.components.stats.pts.method,'average');
  assert.equal(computeFpts(p.stats,league),45.6);
  assert.equal(result.metadata.horizon,'rest-of-season');
  assert.equal(result.metadata.provider,'combined');
  assert.equal(projectionLabel(result),'Combined ROS');
});

test('DARKO workload cancels out when rates stay the same; Hashtag workload determines the projection', () => {
  const a=buildCombinedProjection(hashtag(),darko());
  const sameRates=Object.fromEntries(Object.entries(dStats).map(([key,value])=>[key,key.endsWith('Pct')?value:value/2]));
  const b=buildCombinedProjection(hashtag(),darko([player('Example Center',sameRates)]));
  assert.deepEqual(a.players[0].stats,b.players[0].stats);
  const c=buildCombinedProjection(hashtag([player('Example Center',{...hStats,min:40,pts:25})]),darko());
  assert.equal(c.players[0].stats.min,40);
  assert.equal(c.players[0].stats.pts,27.5);
});

test('absent DARKO shot volume stays explicitly Hashtag-only; percentages do not imply volume', () => {
  const p=buildCombinedProjection(hashtag(),darko()).players[0];
  for(const key of ['fgm','fga','ftm','fta']) {
    assert.equal(p.stats[key],hStats[key]);
    assert.equal(p.components.stats[key].method,'hashtag-only');
    assert.equal(p.components.stats[key].darkoPerMinute,null);
  }
  assert.equal(p.stats.fgPct,0.5);
  assert.equal(p.stats.ftPct,0.8);
  assert.match(buildCombinedProjection(hashtag(),darko()).warnings.join(' '),/FGM.*FGA.*FTM.*FTA/);
  // A richer future export can supply shot volume, which then blends normally.
  const rich=buildCombinedProjection(hashtag(),darko([player('Example Center',{...dStats,fgm:6,fga:12,ftm:3,fta:4})])).players[0];
  assert.equal(rich.stats.fgm,7.5);
  assert.equal(rich.stats.fga,15);
  assert.equal(rich.stats.fta,5.166667);
  assert.equal(rich.components.stats.fgm.method,'average');
});

test('zero production is a valid rate, missing Hashtag stats remain missing, and source FPTS is ignored', () => {
  const h=hashtag([player('Example Center',{...hStats,ast:null,stl:0},{sourceFpts:999})]);
  const d=darko([player('Example Center',{...dStats,pts:0,stl:0},{sourceFpts:888})]);
  const p=buildCombinedProjection(h,d).players[0];
  assert.equal(p.stats.pts,10);
  assert.equal(p.stats.stl,0);
  assert.equal(p.stats.ast,null);
  assert.equal(p.components.stats.stl.method,'average');
  assert.equal(p.components.stats.ast.method,'missing');
  assert.equal(p.sourceFpts,undefined);
  assert.equal(computeFpts(p.stats,league),null);
});

test('coverage excludes unmatched, ambiguous and zero/missing-minute players without substituting another player', () => {
  const h=hashtag([
    player('Nicolas Claxton',hStats),player('Hashtag Only',hStats),player('Zero Minutes',{...hStats,min:0}),
    player('Missing Minutes',{...hStats,min:null}),player('Ambiguous Player',hStats,{team:''})
  ]);
  const d=darko([
    player('Nic Claxton',dStats),player('DARKO Only',dStats),player('Zero Minutes',dStats),player('Missing Minutes',dStats),
    player('Ambiguous Player',dStats,{team:'BOS'}),player('Ambiguous Player',dStats,{team:'NYK'})
  ]);
  const result=buildCombinedProjection(h,d);
  assert.deepEqual(result.players.map(p=>p.name),['Nicolas Claxton']);
  assert.equal(result.metadata.coverage.invalidMinutes,2);
  assert.equal(result.metadata.coverage.excluded.length,4);
  assert.match(result.metadata.coverage.excluded.find(p=>p.name==='Ambiguous Player').reason,/Ambiguous/);
  assert(result.metadata.coverage.unusedDarko.includes('DARKO Only'));
  const zeroD=darko([player('Example Center',{...dStats,min:0})]);
  assert.throws(()=>buildCombinedProjection(hashtag(),zeroD),/No players can be combined/);
});

test('seasons, projection basis and pure Hashtag ROS are required', () => {
  const h=hashtag(),d=darko();
  assert.throws(()=>buildCombinedProjection(h,null),/both Hashtag.*DARKO/);
  assert.throws(()=>buildCombinedProjection(h,{...d,metadata:{...d.metadata,season:2026}}),/same season/);
  assert.throws(()=>buildCombinedProjection({...h,metadata:{...h.metadata,horizon:'full-season'}},d),/pure Hashtag/);
  assert.throws(()=>buildCombinedProjection({...h,metadata:{...h.metadata,selectedDuration:'BLEND'}},d),/pure Hashtag/);
  assert.throws(()=>buildCombinedProjection(h,{...d,metadata:{...d.metadata,basis:'totals'}}),/per-game projections/);
  assert.throws(()=>buildCombinedProjection(h,{...d,metadata:{...d.metadata,kind:'current'}}),/per-game projections/);
});

test('building leaves manual inputs untouched and gives a stable revision that changes with source values', () => {
  const h=hashtag(),d=darko(),before=JSON.stringify([h,d]);
  const a=buildCombinedProjection(h,d),b=buildCombinedProjection(h,d);
  assert.equal(JSON.stringify([h,d]),before);
  assert.equal(a.metadata.snapshotId,b.metadata.snapshotId);
  const changed=darko([player('Example Center',{...dStats,pts:21})]);
  assert.notEqual(a.metadata.snapshotId,buildCombinedProjection(h,changed).metadata.snapshotId);
});

test('both import orders initialize combined scoring from Hashtag rather than reduced DARKO scoring', () => {
  for(const order of [['hashtag','darko'],['darko','hashtag']]) {
    let state={projections:null,scoring:DEFAULT_SCORING,minProjectedFpts:25};
    const sources={hashtag:hashtag(),darko:darko()};
    for(const key of order){
      state=rememberProjection(state,sources[key],key==='hashtag'?league:DEFAULT_SCORING);
      state=rebuildCombinedProjection(state,{selectWhenReady:true}).state;
    }
    assert.equal(projectionKey(state.projections),'combined');
    assert.equal(state.scoring.fgm,2);
    assert.equal(state.minProjectedFpts,25);
    assert.equal(state.projectionSources.hashtag.players[0].stats.pts,20);
  }
});

test('reimports refresh the active combined baseline, preserve edited scoring, and invalidate stale season combinations', () => {
  let state=rememberProjection({scoring:league},hashtag());
  state=rememberProjection(state,darko());
  state=rebuildCombinedProjection(state,{selectWhenReady:true}).state;
  state.scoring={...state.scoring,stl:5};
  state=rememberProjection(state,state.projections);
  state=JSON.parse(JSON.stringify(state));
  const revision=state.projections.metadata.snapshotId;
  state=rebuildCombinedProjection(state).state;
  assert.equal(state.projections.metadata.snapshotId,revision);
  const updated=darko([player('Example Center',{...dStats,pts:24})]);
  state=rememberProjection(state,updated);
  state=rebuildCombinedProjection(state,{selectWhenReady:true}).state;
  assert.equal(state.projections.players[0].stats.pts,26);
  assert.equal(state.scoring.stl,5);
  assert.notEqual(state.projections.metadata.snapshotId,revision);
  state.projectionSources.darko={...updated,metadata:{...updated.metadata,season:2026}};
  const result=rebuildCombinedProjection(state);
  assert.match(result.error,/same season/);
  assert.equal(result.state.projectionSources.combined,undefined);
  assert.equal(projectionKey(result.state.projections),'hashtag');
  assert.equal(result.state.scoring.stl,4);
});

test('manual provider labels identify copied Hashtag tables and cannot relabel a detected DARKO source', () => {
  const table=parseImport('Player,Min,PTS\nExample Center,32,20');
  const h=identifyProjectionImport(table,'hashtag');
  assert.equal(projectionKey(h),'hashtag');
  assert.equal(h.metadata.horizon,'rest-of-season');
  assert.throws(()=>identifyProjectionImport(darko(),'hashtag'),/conflicts/);
  assert.equal(projectionKey({metadata:{provider:'combined',source:'Hashtag + DARKO'}}),'combined');
});
