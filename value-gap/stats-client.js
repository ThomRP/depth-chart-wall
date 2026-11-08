import { parseImport } from './engine.js';

export async function fetchJson(url) {
  let response;
  try { response = await fetch(url, { signal: AbortSignal.timeout(30000), credentials: 'omit' }); }
  catch (error) { throw new Error(`${new URL(url).pathname}: ${error.name === 'TimeoutError' ? 'request timed out' : 'network request failed'}`); }
  let data;
  try { data = await response.json(); } catch { throw new Error(`${new URL(url).pathname}: HTTP ${response.status}, invalid JSON response`); }
  if (!response.ok || data.error) throw new Error(`${new URL(url).pathname}: HTTP ${response.status}${data.error ? ` (${String(data.error).slice(0,160)})` : ''}`);
  return data;
}

export function isLiveStats(dataset) {
  return Boolean(dataset?.metadata?.workerUrl || /^ESPN via your worker$/i.test(dataset?.metadata?.source || ''));
}

// Keep successful players when an independent batch or malformed player fails.
// Retry overloaded 20-player requests in smaller pairs; stop an outage early.
export async function fetchPlayerStats({ base, identities, season, period, request = fetchJson, onProgress = () => {}, onRows = () => {}, cancelled = () => false }) {
  const players = new Map(), failures = [], ids = [...new Set(identities.map(p => p.espnId))];
  const byId = new Map(identities.map(p => [p.espnId,p]));
  let consecutiveFailedBatches = 0;
  async function batch(group) {
    const data = await request(`${base}/stats?${new URLSearchParams({ids:group.join(','),period,season:String(season)})}`);
    if (String(data.season) !== String(season) || data.period !== period || !Array.isArray(data.players)) {
      const error = new Error('/stats: response has a different season, window, or invalid players array'); error.fatal = true; throw error;
    }
    if (cancelled()) return;
    for (const id of group) {
      const identity = byId.get(id), row = data.players.find(p => String(p.id) === id);
      if (!row || row.error) { failures.push({id,reason:row?.error||'missing_worker_result'}); continue; }
      try {
        const parsed = parseImport(JSON.stringify({players:[{...identity,...row,espnId:id}],metadata:{basis:'per-game'}})).players[0];
        players.set(id,{...parsed,statsUpdatedAt:data.updatedAt||new Date().toISOString()});
      } catch(error) { failures.push({id,reason:error.message}); }
    }
    onRows([...players.values()], [...failures]);
  }
  for (let offset=0; offset<ids.length && !cancelled(); offset+=20) {
    const group = ids.slice(offset,offset+20);
    onProgress(Math.min(offset+20,ids.length),ids.length,players.size);
    try { await batch(group); consecutiveFailedBatches=0; }
    catch(error) {
      if (cancelled()) break;
      if(error.fatal){failures.push(...ids.slice(offset).map(id=>({id,reason:error.message})));break;}
      let smallerSucceeded=false;
      for (let sub=0;sub<group.length&&!cancelled();sub+=2) {
        const small=group.slice(sub,sub+2);
        try { await batch(small); smallerSucceeded=true; }
        catch(retryError) {
          failures.push(...(sub===0?group:small).map(id=>({id,reason:retryError.message})));
          if(sub===0||retryError.fatal)break;
        }
      }
      consecutiveFailedBatches=smallerSucceeded?0:consecutiveFailedBatches+1;
      if(consecutiveFailedBatches>=2&&!players.size){
        failures.push(...ids.slice(offset+20).map(id=>({id,reason:'Stats service unavailable; remaining requests paused.'})));break;
      }
    }
  }
  return {players:[...players.values()],failures};
}
