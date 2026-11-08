import { STAT_DEFS, DEFAULT_SCORING, parseImport, computeFpts, matchPlayers, comparePlayers } from './engine.js';
import { parseHashtagHtml, looksLikeHashtagHtml } from './html-import.js';
import { rosterForProjections } from './identities.js?v=roster-fix-1';
import { isHostedProjection, applyHostedSnapshot } from './snapshots.js';
import { fetchJson, fetchPlayerStats, isLiveStats } from './stats-client.js';

const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const year = new Date().getFullYear() + (new Date().getMonth() >= 8 ? 1 : 0);
const STORAGE = 'courtside-value-lab-v1';
const DEFAULT_WORKER_URL = 'https://value-gaps.thomrisped.workers.dev';
const LIVE_REFRESH_MS = 15 * 60 * 1000;
const windowName = value => ({season:'Season to date','14':'Last 14 games','8':'Last 8 games','days-7':'Last 7 days','days-14':'Last 14 days','days-30':'Last 30 days'}[value] || 'Imported window');
const signed = value => value == null ? '—' : (Math.abs(value) < .05 ? '0.0' : `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}`);
const number = value => value == null ? '—' : Number(value).toFixed(1);
const signClass = value => value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral';
let sourceTab = 'projections', toastTimer, generation = 0, currentResults = [], currentMatches;
let statsBusy=false, statsMessage='', statsError=false, lastStatsAttempt=0;
let state = {demo:false,projections:null,current:null,scoring:{...DEFAULT_SCORING},workerUrl:DEFAULT_WORKER_URL,workerPeriod:'season',season:year};
try { const saved = JSON.parse(localStorage.getItem(STORAGE)); if (saved?.version === 1) state = {...state,...saved.state,scoring:{...DEFAULT_SCORING,...saved.state.scoring}}; } catch { /* Browser storage is optional. */ }

// Migrate earlier demo sessions to real-data mode.
state.demo=false;
state.workerUrl ||= DEFAULT_WORKER_URL;
function datasets(){return state;}
function persist(){try{localStorage.setItem(STORAGE,JSON.stringify({version:1,state}));}catch{toast('Browser storage unavailable. Keep your import files to restore this session.');}}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5500);}
function humanDate(value){if(!value)return 'date not recorded';const date=new Date(value);return Number.isFinite(date.valueOf())?date.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'date not recorded';}

function readImport(text){return looksLikeHashtagHtml(text)?parseHashtagHtml(text):parseImport(text);}
function previewImport(){
  const preview=$('detected-import');
  try{
    const imported=readImport($('import-text').value),meta=imported.metadata;
    preview.hidden=false;preview.textContent=`Detected ${imported.players.length} players · ${meta.selectedDuration||meta.source||'Imported table'} · ${meta.basis||'confirm per-game basis'}${meta.pageLimit?` · Top ${meta.pageLimit}`:''}`;
    if(meta.season)$('import-season').value=meta.season;
    if(meta.period&&['season','8','14','days-7','days-14','days-30'].includes(String(meta.period)))$('import-period').value=meta.period;
    $('page-scoring-label').hidden=!meta.scoring;
    $('page-scoring').checked=Boolean(meta.scoring)&&!meta.unsupportedScoring?.length;
    $('page-scoring').disabled=Boolean(meta.unsupportedScoring?.length);
  }catch{preview.hidden=true;$('page-scoring-label').hidden=true;$('page-scoring').checked=false;}
}
let importPreviewTimer;
$('import-text').addEventListener('input',()=>{clearTimeout(importPreviewTimer);importPreviewTimer=setTimeout(previewImport,250);});

function renderProjectionLibrary(data,query,position){
  const show=Boolean(data.projections&&!data.current);
  $('projection-library').hidden=!show;
  if(!show)return;
  const projections=data.projections.players.filter(p=>(!query||`${p.name} ${p.team}`.toLowerCase().includes(query))&&(!position||(p.position||'').split(/[^A-Z]+/).includes(position))).map(p=>({...p,fpts:computeFpts(p.stats,state.scoring)}));
  projections.sort((a,b)=>(b.fpts??-Infinity)-(a.fpts??-Infinity)||a.name.localeCompare(b.name));
  $('projection-library-count').textContent=`${projections.length} / ${data.projections.players.length}`;
  const defs=STAT_DEFS.filter((def,i)=>i<8||$('shooting').checked||state.scoring[def.key]!==0);
  $('projection-library-table').innerHTML=`<caption class="sr-only">Imported NBA rest-of-season projections. Current stats have not been added yet.</caption><thead><tr><th scope="col">PLAYER</th><th scope="col">TEAM</th><th scope="col">POS</th>${defs.map(d=>`<th scope="col">${d.label}</th>`).join('')}<th scope="col">FPTS</th></tr></thead><tbody>${projections.map(p=>`<tr><th scope="row">${escape(p.name)}</th><td>${escape(p.team)}</td><td>${escape(p.position)}</td>${defs.map(d=>`<td>${number(p.stats[d.key])}</td>`).join('')}<td class="projection-fpts">${number(p.fpts)}</td></tr>`).join('')}</tbody>`;
}
$('library-current-open').onclick=()=>refreshCurrentStats();
$('download-projections').onclick=()=>{if(state.projections)download('hashtag-ros-projections.json',JSON.stringify(state.projections,null,2),'application/json');};

async function loadInitialData(){
  if(state.initialDataCleared||(state.projections&&!isHostedProjection(state.projections)))return;
  try{
    const response=await fetch('./data/initial-projections.json',{cache:'no-store',credentials:'same-origin'});
    if(!response.ok)return;
    const previous=state.projections;
    const result=applyHostedSnapshot(state,await response.json());
    if(!result.changed)return;
    state=result.state;persist();
    if(previous)toast(`Saved ROS projections updated: ${state.projections.players.length} players.`);
  }catch{
    if(state.projections)toast('The saved projection update could not be loaded. Your previous projections are still available.');
  }
}

function playerCard(player,index){
  const defs = STAT_DEFS.filter((def,i)=> i<8 || $('shooting').checked || state.scoring[def.key]!==0);
  const initial = player.name.split(/\s+/).map(s=>s[0]).slice(0,2).join('');
  const row=(label,kind)=>`<tr class="${kind}"><td>${label}</td>${defs.map(def=>{
    const value=kind==='difference'?player.statDeltas[def.key]:player[kind][def.key];
    const direction=player.statPerformance[def.key];
    return `<td class="${kind==='difference'?signClass(direction):''}" title="${escape(def.name)}${kind==='difference'?' · current minus projection':''}">${kind==='difference'?signed(value):number(value)}</td>`;
  }).join('')}<td class="fpts ${kind==='difference'?signClass(player.delta):''}">${kind==='current'?number(player.currentFpts):kind==='projection'?number(player.projectionFpts):signed(player.delta)}</td></tr>`;
  return `<article class="player-card"><div class="player-top"><span class="player-rank">${String(index+1).padStart(2,'0')}</span><span class="avatar" aria-hidden="true">${escape(initial)}</span><div><h3 class="player-name">${escape(player.name)}</h3><div class="player-meta"><b>${escape(player.currentPlayer.team||player.team||'—')}</b><span class="meta-dot"></span>${escape(player.position||'—')}<span class="meta-dot"></span>${player.games??'—'} GP${player.currentPlayer.retainedFromPrevious?'<span class="cached-label">CACHED</span>':''}</div></div><div class="player-gap"><div class="gap-badge">${signed(player.delta)}<span>FPTS / G</span></div><div class="gap-percentage">${player.gapPercent==null?'No % baseline':`${signed(player.gapPercent)}% vs ROS`}</div></div></div><div class="stats-wrap" tabindex="0" role="region" aria-label="${escape(player.name)} stat comparison"><table class="stats-table ${defs.length>8?'with-shooting':''}"><caption class="sr-only">${escape(player.name)}, per-game stats and ROS projection</caption><thead><tr><th scope="col">PER GAME</th>${defs.map(def=>`<th scope="col" title="${escape(def.name)}">${def.label}</th>`).join('')}<th scope="col" class="fpts">FPTS</th></tr></thead><tbody>${row('Current','current')}${row('ROS proj.','projection')}${row('Difference','difference')}</tbody></table></div></article>`;
}
function render(){
  const data=datasets();
  const seasonMismatch=data.projections&&data.current&&String(data.projections.metadata.season)!==String(data.current.metadata.season);
  currentMatches = data.projections&&data.current&&!seasonMismatch?matchPlayers(data.projections.players,data.current.players):{players:[],unmatchedProjections:[],unmatchedCurrent:[],ambiguous:[]};
  const compared=comparePlayers(currentMatches,state.scoring);
  const complete=compared.filter(p=>p.delta!==null);
  const incomplete=compared.filter(p=>p.delta===null);
  const query=$('search').value.toLowerCase().trim(),position=$('position').value,minGames=Number($('min-games').value);
  const filtered=complete.filter(p=>(!query||`${p.name} ${p.team} ${p.currentPlayer.team}`.toLowerCase().includes(query))&&(!position||(p.position||'').split(/[^A-Z]+/).includes(position))&&(minGames===0||(p.games!==null&&p.games>=minGames)));
  const sortKey=$('sort').value==='percent'?'gapPercent':'delta';
  const magnitude=player=>Number.isFinite(player[sortKey])?Math.abs(player[sortKey]):-Infinity;
  filtered.sort((a,b)=>magnitude(b)-magnitude(a)||a.name.localeCompare(b.name));
  currentResults=filtered;
  const under=filtered.filter(p=>p.delta<-.000001),over=filtered.filter(p=>p.delta>.000001),neutral=complete.filter(p=>Math.abs(p.delta)<=.000001);
  $('under-list').innerHTML=under.length?under.map(playerCard).join(''):`<div class="empty-list"><b>${complete.length?'No players match these filters':data.projections?'Add current stats to compare':'Import your NBA data'}</b>${complete.length?'Try another position or a lower minimum games filter.':data.projections?'Your ROS projections are loaded below. Current NBA stats load automatically; use Refresh NBA stats to retry.':'Import ROS projections and current stats in Data sources.'}</div>`;
  $('over-list').innerHTML=over.length?over.map(playerCard).join(''):`<div class="empty-list"><b>${complete.length?'No players match these filters':data.projections?'Waiting for current production':'Your next sell-high starts here'}</b>${complete.length?'Try another position or a lower minimum games filter.':'Both sources must be matched before players can be ranked.'}</div>`;
  $('summary-count').textContent=complete.length;$('summary-under').textContent=complete.filter(p=>p.delta<-.000001).length;$('summary-over').textContent=complete.filter(p=>p.delta>.000001).length;
  $('under-count').textContent=under.length;$('over-count').textContent=over.length;
  $('coverage-detail').textContent=`${complete.length} of ${data.projections?.players.length||0} projected players · ${data.current?windowName(data.current.metadata.period):'Awaiting current stats'}`;
  $('baseline-detail').textContent=state.demo?'Illustrative values · fictional players':`${data.projections?.metadata.source||'Import Hashtag projections'}${data.projections?` · ${data.projections.metadata.season-1}–${String(data.projections.metadata.season).slice(-2)}`:''}`;
  $('data-banner').classList.toggle('ready',!state.demo&&complete.length>0);
  $('data-banner').innerHTML=state.demo?'<span><b>ILLUSTRATIVE DEMO</b> Fictional players and sample numbers. Import your data to find real opportunities.</span><button class="text-button" id="banner-import">Use my data ↗</button>':`<span><b>${complete.length?'YOUR DATA':data.projections?'PROJECTIONS LOADED':'AWAITING DATA'}</b> ${data.projections?`${data.projections.players.length} ROS projections · ${data.projections.metadata.capturedAt?'captured':'imported'} ${humanDate(data.projections.metadata.capturedAt||data.projections.metadata.importedAt)}`:'Import your rest-of-season projections.'}${data.current?` · ${data.current.players.length} current-stat rows · ${windowName(data.current.metadata.period)} · ${humanDate(data.current.metadata.updatedAt||data.current.metadata.capturedAt||data.current.metadata.importedAt)}`:' Current stats are still needed to calculate over/underperformance.'}</span><button class="text-button" id="banner-import">Manage sources ↗</button>`;
  $('banner-import').onclick=()=>openSources('projections');
  renderProjectionLibrary(data,query,position);
  const notices=[];
  if(seasonMismatch)notices.push('The sources have different seasons. Import matching seasons before comparing.');
  if(incomplete.length)notices.push(`${incomplete.length} matched players have missing scored categories and cannot be ranked.`);
  if(currentMatches.unmatchedProjections.length)notices.push(`${currentMatches.unmatchedProjections.length} projections have no current-stat match.`);
  if(currentMatches.ambiguous.length)notices.push(`${currentMatches.ambiguous.length} ambiguous player matches were excluded.`);
  if(currentMatches.unmatchedCurrent.length)notices.push(`${currentMatches.unmatchedCurrent.length} current-stat rows have no projection match.`);
  if(neutral.length)notices.push(`${neutral.length} players are exactly at projected FPTS and appear in neither list.`);
  if(data.current?.metadata.errors?.length)notices.push(`${data.current.metadata.errors.length} ESPN lookups failed.`);
  for(const source of [data.projections,data.current])if(source?.warnings)notices.push(...source.warnings);
  const details=[...incomplete.map(p=>`${p.name}: missing ${STAT_DEFS.filter(d=>state.scoring[d.key]!==0&&(p.current[d.key]==null||p.projection[d.key]==null)).map(d=>d.label).join(', ')}`),...currentMatches.unmatchedProjections.map(p=>`${p.name}: no current stats`),...currentMatches.ambiguous.map(p=>`${p.projection.name}: ambiguous match`),...currentMatches.unmatchedCurrent.map(p=>`${p.name}: no projection`),...(data.current?.metadata.errors||[])];
  $('match-notice').hidden=!notices.length;$('match-notice').innerHTML=notices.map(escape).join(' ')+(details.length?`<details><summary>Review excluded players and matches</summary><ul>${details.map(v=>`<li>${escape(v)}</li>`).join('')}</ul></details>`:'');
  renderStatsSync();
  $('source-status').innerHTML=`<span>Projections: <b>${state.demo?'Demo':data.projections?`${data.projections.players.length} imported`:'Not imported'}</b></span><span>Current stats: <b>${state.demo?'Demo':data.current?`${data.current.players.length} imported`:'Not imported'}</b></span><span>Scoring: <b>${Object.keys(state.scoring).every(key=>state.scoring[key]===DEFAULT_SCORING[key])?'Standard points':'Custom points'}</b></span>`;
}

function openSources(tab='projections'){setSourceTab(tab);$('sources-dialog').showModal();}
function setSourceTab(tab){sourceTab=tab;document.querySelectorAll('[data-source-tab]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.sourceTab===tab)));$('import-form').hidden=tab==='worker';$('worker-form').hidden=tab!=='worker';$('import-message').textContent='';$('basis-confirm').checked=false;$('import-text').value='';$('import-file').value='';$('file-name').textContent='or paste page source / a table below';$('detected-import').hidden=true;$('page-scoring-label').hidden=true;$('current-period-label').hidden=tab==='projections';$('import-submit').textContent=tab==='current'?'Import current stats':'Import projections';$('basis-confirm-text').textContent=tab==='current'?'These are per-game current stats for the season and window selected above.':'I’ve selected pure rest-of-season projections and per-game averages.';$('import-instruction').innerHTML=tab==='current'?'On Hashtag, select <b>2026–27 Regular Season Rankings</b>, <b>Per-game Average</b>, and <b>Top 300</b>. Save or copy the page source and import it here. JSON, CSV, and copied tables also work.':'On Hashtag, select pure <b>rest-of-season projections</b>, <b>Per-game Average</b>, and <b>Top 300</b>. Save or copy the page source and import it directly. The app reads only table data; scripts and account fields are discarded.';$('import-season').value=state.season;$('worker-url').value=state.workerUrl;$('worker-period').value=state.workerPeriod;$('worker-season').value=state.season;}
document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>button.closest('dialog').close());
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}}));
$('sources-open').onclick=()=>openSources();$('method-open').onclick=()=>$('method-dialog').showModal();
document.querySelectorAll('[data-source-tab]').forEach(button=>button.onclick=()=>setSourceTab(button.dataset.sourceTab));
for(const id of ['search','position','min-games','sort','shooting'])$(id).addEventListener(id==='search'?'input':'change',render);
function scoringFields(scoring){$('scoring-fields').innerHTML=STAT_DEFS.map(def=>`<label>${def.label} <span>${def.name}</span><input name="${def.key}" type="number" step="any" min="-10000" max="10000" required value="${scoring[def.key]}"></label>`).join('');}
$('scoring-open').onclick=()=>{scoringFields(state.scoring);$('scoring-dialog').showModal();};
$('scoring-reset').onclick=()=>scoringFields(DEFAULT_SCORING);
$('scoring-form').onsubmit=event=>{event.preventDefault();const data=new FormData(event.target);const scoring=Object.fromEntries(STAT_DEFS.map(def=>[def.key,Number(data.get(def.key))]));if(!Object.values(scoring).every(Number.isFinite))return;state.scoring=scoring;persist();render();$('scoring-dialog').close();toast('League scoring applied. FPTS and rankings updated.');};
$('import-file').onchange=async event=>{const file=event.target.files[0];if(!file)return;if(file.size>8*1024*1024){$('import-message').textContent='Choose a file smaller than 8 MB.';return;}$('import-text').value=await file.text();$('file-name').textContent=file.name;previewImport();};
$('import-form').onsubmit=event=>{
  event.preventDefault();
  try{
    const imported=readImport($('import-text').value),metadata=imported.metadata,selectedSeason=Number($('import-season').value);
    if(metadata.kind&&((sourceTab==='projections'&&/current|actual/i.test(metadata.kind))||(sourceTab==='current'&&/projection/i.test(metadata.kind))))throw new Error('This file belongs in the other source tab. Check the exported dataset kind.');
    if(metadata.horizon&&sourceTab==='projections'&&/full.?season|pre.?season/i.test(metadata.horizon))throw new Error('This file is marked full-season. Export pure rest-of-season projections for this baseline.');
    if(sourceTab==='projections'&&/blend/i.test(JSON.stringify(metadata)))throw new Error('This source is marked BLEND. Export pure ROS projections.');
    if(metadata.season&&Number(metadata.season)!==selectedSeason)throw new Error(`The file says season ${metadata.season}; change the season selection to match.`);
    if(sourceTab==='current'&&metadata.period&&String(metadata.period)!==$('import-period').value)throw new Error(`The file uses period ${metadata.period}; change the selected current stats window to match.`);
    if(state.demo){state.projections=null;state.current=null;state.demo=false;}
    generation++;
    state[sourceTab]={...imported,metadata:{...metadata,source:metadata.source||'Imported table',season:selectedSeason,basis:'per-game',importedAt:new Date().toISOString(),...(sourceTab==='projections'?{horizon:'rest-of-season',managedSnapshot:false,snapshotId:null}:{period:$('import-period').value})},warnings:imported.warnings.filter(w=>!w.startsWith('Confirm these stats'))};
    state.season=selectedSeason;if($('page-scoring').checked&&metadata.scoring){for(const def of STAT_DEFS)if(Number.isFinite(metadata.scoring[def.key]))state.scoring[def.key]=metadata.scoring[def.key];}persist();render();
    $('import-message').className='form-message success';$('import-message').textContent=`Imported ${imported.players.length} players.${imported.players.length<=30&&sourceTab==='projections'?' Check coverage: Hashtag free access is limited to 30 players.':''}`;
    $('import-text').value='';$('basis-confirm').checked=false;
    toast(`${imported.players.length} ${sourceTab==='projections'?'ROS projections':'current-stat rows'} imported.`);
    if(sourceTab==='projections'&&(!state.current||isLiveStats(state.current)))void refreshCurrentStats();
  }catch(error){$('import-message').className='form-message';$('import-message').textContent=error.message;}
};
$('clear-data').onclick=()=>{generation++;state={...state,demo:false,projections:null,current:null,initialDataCleared:true};persist();statsMessage='';statsError=false;render();$('import-message').textContent='Imported data cleared from this browser.';};

function renderStatsSync(){
  const current=state.current;
  const partial=Boolean(current?.metadata.partial&&!statsBusy);
  $('stats-sync').classList.toggle('sync-error',statsError||partial);
  const stamp=current?.metadata.updatedAt||current?.metadata.importedAt;
  const formatted=stamp?new Date(stamp).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'';
  $('stats-sync-message').textContent=statsMessage||(!state.projections?'Import ROS projections to connect current NBA stats.':partial?`NBA stats partially loaded: ${current.players.length} players · some updates were unavailable. Use Refresh NBA stats to retry.`:isLiveStats(current)?`NBA stats synced ${formatted} · refresh every 15 minutes while open.`:current?'Using your current-stat import. Refresh NBA stats to switch to ESPN.':'Connecting to current NBA stats…');
  $('refresh-stats').disabled=statsBusy||!state.projections;
  $('refresh-stats').textContent=statsBusy?'Fetching NBA stats…':'Refresh NBA stats ↻';
  $('live-period').value=state.workerPeriod;
  $('live-period').disabled=statsBusy||!state.projections;
  $('worker-submit').disabled=statsBusy;
  $('library-current-open').disabled=statsBusy;
  $('library-current-open').textContent=statsBusy?'Fetching NBA stats…':'Fetch current NBA stats →';
}
function reportStats(message,error=false){
  statsMessage=message;statsError=error;
  $('worker-message').className=`form-message${error?'':' success'}`;
  $('worker-message').textContent=message;renderStatsSync();
}
async function refreshCurrentStats({url=state.workerUrl,season=Number(state.projections?.metadata.season||state.season),period=state.workerPeriod}={}){
  if(statsBusy)return false;
  if(!state.projections){reportStats('Import your ROS projections first, then fetch current NBA stats.');return false;}
  let base;
  try{const parsedUrl=new URL(url);if(parsedUrl.protocol!=='https:'||parsedUrl.username||parsedUrl.password)throw new Error();base=parsedUrl.origin;}catch{reportStats('Use an HTTPS Worker URL without credentials.',true);return false;}
  if(!['season','14','8'].includes(period)||String(state.projections.metadata.season)!==String(season)){reportStats('Select the same season as your ROS projections and a supported NBA stats window.',true);return false;}
  const token=++generation,projectionSnapshot=state.projections;
  state.workerUrl=base;state.workerPeriod=period;persist();statsBusy=true;lastStatsAttempt=Date.now();
  reportStats('Matching projections to the NBA roster…');
  try{
    // Known ESPN IDs are bundled, so the deployed Worker's broken /roster
    // proxy is not required to compare the supplied NBA players.
    let rosterPlayers=rosterForProjections(projectionSnapshot.players);
    let matches=matchPlayers(projectionSnapshot.players,rosterPlayers);
    if(matches.unmatchedProjections.length){
      try{
        const feed=await fetchJson('https://ancient-haze-faf8.thomrisped.workers.dev');
        const live=new Map();
        for(const team of feed.teams||[])for(const [position,rows] of Object.entries(team.depth||{}))for(const p of rows)if(p.id)live.set(String(p.id),{id:p.id,name:p.fullName,team:team.abbr,position});
        rosterPlayers=rosterForProjections(projectionSnapshot.players,[...live.values()]);
        matches=matchPlayers(projectionSnapshot.players,rosterPlayers);
      }catch{/* Known identities still work when the optional roster feed is unavailable. */}
    }
    if(token!==generation)return false;
    const identities=matches.players.map(p=>p.currentPlayer);
    if(!identities.length)throw new Error('No ESPN identities found for these projections. Check player names in Data sources.');
    const previous=state.current;
    const canRetain=isLiveStats(previous)&&String(previous.metadata.season)===String(season)&&previous.metadata.period===period;
    const prior=canRetain?previous.players:[];
    const byId=new Map(identities.map(p=>[p.espnId,p]));
    let lastPublishedCount=0,lastPublishedAt=0;
    function publishRows(rows,failures,finished=false){
      if(token!==generation||!rows.length)return;
      if(!finished&&lastPublishedAt&&rows.length-lastPublishedCount<20&&Date.now()-lastPublishedAt<750)return;
      lastPublishedCount=rows.length;lastPublishedAt=Date.now();
      const merged=new Map(prior.map(p=>[p.espnId||p.id,{...p,retainedFromPrevious:true,statsUpdatedAt:p.statsUpdatedAt||previous.metadata.updatedAt}]));
      for(const p of rows)merged.set(p.espnId,{...p,retainedFromPrevious:false});
      const retained=[...merged.values()].filter(p=>p.retainedFromPrevious).length;
      const errors=failures.map(f=>`${byId.get(f.id)?.name||f.id}: ${f.reason}`);
      const warnings=retained?[`${retained} players still show their previous current stats${finished?' because this refresh did not return updated values':'; the refresh is in progress'}.`]:[];
      const updatedAt=rows.map(p=>p.statsUpdatedAt).sort().at(-1)||new Date().toISOString();
      state.current={players:[...merged.values()],metadata:{source:'ESPN via your worker',workerUrl:base,season,period,projectionSnapshotId:projectionSnapshot.metadata.snapshotId||null,basis:'per-game',updatedAt,fetchedAt:new Date().toISOString(),partial:!finished||failures.length>0,retainedPlayers:retained,errors},warnings};
      state.season=season;persist();render();
    }
    const result=await fetchPlayerStats({base,identities,season,period,
      cancelled:()=>token!==generation,
      onProgress:(processed,total,loaded)=>reportStats(`Fetching NBA stats: ${processed} / ${total} · ${loaded} players loaded…`),
      onRows:(rows,failures)=>publishRows(rows,failures)
    });
    if(token!==generation)return false;
    if(!result.players.length)throw new Error(`/stats returned no usable players. ${result.failures[0]?.reason||'Check the stats Worker response.'}`);
    publishRows(result.players,result.failures,true);
    const unrefreshed=result.failures.length;
    reportStats(`NBA stats: ${result.players.length} players updated · ${windowName(period)}${unrefreshed?` · ${unrefreshed} unavailable (see details below)`:''} · refresh every 15 minutes while open.`,unrefreshed>0);
    return true;
  }catch(error){if(token===generation)reportStats(`NBA stats refresh failed: ${error.message}${state.current?' Previous current stats are still shown.':' Your projections are still loaded.'}`,true);return false;}finally{statsBusy=false;renderStatsSync();if(token!==generation&&state.projections&&(!state.current||isLiveStats(state.current)))void refreshCurrentStats();}
}
$('worker-form').onsubmit=event=>{event.preventDefault();void refreshCurrentStats({url:$('worker-url').value,season:Number($('worker-season').value),period:$('worker-period').value});};
$('refresh-stats').onclick=()=>refreshCurrentStats();
$('live-period').onchange=event=>refreshCurrentStats({period:event.target.value});
function maybeRefreshStats(){
  if(document.hidden||!state.projections||statsBusy)return;
  // Manual imports stay selected until the user explicitly switches to live stats.
  if(state.current?.players?.length&&!isLiveStats(state.current))return;
  const meta=state.current?.metadata;
  const sameQuery=meta&&String(meta.season)===String(state.projections.metadata.season)&&meta.period===state.workerPeriod&&meta.workerUrl===state.workerUrl&&(meta.projectionSnapshotId??null)===(state.projections.metadata.snapshotId??null);
  const lastSync=sameQuery?(Date.parse(meta.fetchedAt||meta.updatedAt||'')||0):0;
  if(Date.now()-Math.max(lastSync,lastStatsAttempt)>=LIVE_REFRESH_MS)void refreshCurrentStats();
}
document.addEventListener('visibilitychange',maybeRefreshStats);
setInterval(maybeRefreshStats,LIVE_REFRESH_MS);

function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type})),anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export-results').onclick=()=>{if(!currentResults.length){toast('No matched players to export.');return;}const defs=STAT_DEFS;const headers=['Player','Team','Position','Games','Source','Row','FPTS',...defs.map(def=>def.label)];const rows=[headers];for(const player of currentResults){for(const kind of ['current','projection','difference'])rows.push([player.name,player.currentPlayer.team||player.team,player.position,player.games,state.demo?'Fictional demo':'Imported data',kind,kind==='current'?player.currentFpts:kind==='projection'?player.projectionFpts:player.delta,...defs.map(def=>kind==='difference'?player.statDeltas[def.key]:player[kind][def.key])]);}const quote=value=>`"${String(value??'').replace(/"/g,'""')}"`;download(`value-lab-${state.demo?'DEMO-':''}${new Date().toISOString().slice(0,10)}.csv`,rows.map(row=>row.map(quote).join(',')).join('\r\n'),'text/csv;charset=utf-8');};
await loadInitialData();
render();
maybeRefreshStats();
