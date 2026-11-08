import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchJson, fetchPlayerStats, isLiveStats } from './stats-client.js';
import { rosterForProjections } from './identities.js';

const ids=Array.from({length:60},(_,i)=>({espnId:String(i+1),name:`Example Player ${i+1}`}));
const response=(url,overrides={})=>{
  const query=new URL(url).searchParams;
  return {season:2027,period:'season',updatedAt:'2026-11-08T00:00:00Z',players:query.get('ids').split(',').map(id=>({id,games:9,stats:{pts:20,reb:5,ast:4,stl:1,blk:1,tov:2}})),...overrides};
};
test('successful players publish before later requests fail, with bounded smaller retries',async()=>{
  const visible=[];let calls=0;
  const result=await fetchPlayerStats({base:'https://example.test',identities:ids,season:2027,period:'season',
    request:async url=>{calls++;const group=new URL(url).searchParams.get('ids').split(',');if(Number(group[0])>40)throw new Error('/stats: HTTP 502');return response(url);},
    onRows:rows=>visible.push(rows.length)
  });
  assert.deepEqual(visible,[20,40]);assert.equal(result.players.length,40);assert.equal(result.failures.length,20);assert.equal(calls,4);
});
test('overloaded large batches recover in two-player groups',async()=>{
  const sizes=[];const result=await fetchPlayerStats({base:'https://example.test',identities:ids.slice(0,20),season:2027,period:'season',request:async url=>{
    const count=new URL(url).searchParams.get('ids').split(',').length;sizes.push(count);if(count>2)throw new Error('HTTP 502');return response(url);
  }});
  assert.deepEqual(sizes,[20,...Array(10).fill(2)]);assert.equal(result.players.length,20);assert.deepEqual(result.failures,[]);
});
test('one malformed player is excluded without rejecting the rest of the response',async()=>{
  const result=await fetchPlayerStats({base:'https://example.test',identities:ids.slice(0,3),season:2027,period:'season',request:async url=>{
    const data=response(url);data.players[1].stats.pts='invalid';return data;
  }});
  assert.equal(result.players.length,2);assert.equal(result.failures[0].id,'2');
});
test('wrong-season data is never published or scored',async()=>{
  let calls=0,published=false;
  const result=await fetchPlayerStats({base:'https://example.test',identities:ids,season:2027,period:'season',request:async url=>{calls++;return response(url,{season:2026});},onRows:()=>published=true});
  assert.equal(published,false);assert.equal(result.players.length,0);assert.equal(calls,1);assert.equal(result.failures.length,60);
});
test('service-wide failures stop after a bounded number of attempts',async()=>{
  let calls=0;const result=await fetchPlayerStats({base:'https://example.test',identities:ids,season:2027,period:'season',request:async()=>{calls++;throw new Error('offline');}});
  assert.equal(calls,4);assert.equal(result.players.length,0);assert.equal(result.failures.length,60);
});
test('HTTP failures expose the exact route and upstream error code',async()=>{
  const original=globalThis.fetch;
  try{globalThis.fetch=async()=>new Response(JSON.stringify({error:'roster_http_404'}),{status:502});
    await assert.rejects(()=>fetchJson('https://example.test/roster'),/\/roster: HTTP 502 \(roster_http_404\)/);
  }finally{globalThis.fetch=original;}
});
test('known sample players resolve without any live roster request',()=>{
  const known=rosterForProjections([{name:'Luka Doncic'},{name:'Nikola Jokic'}]);
  assert.deepEqual(known.map(p=>p.espnId),['3945274','3112335']);
});
test('legacy ESPN records remain eligible for automatic refresh',()=>{
  assert.equal(isLiveStats({metadata:{source:'ESPN via your worker'}}),true);
  assert.equal(isLiveStats({metadata:{source:'My manual import'}}),false);
});
