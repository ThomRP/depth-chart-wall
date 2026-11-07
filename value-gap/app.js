import { STAT_DEFS, DEFAULT_SCORING, parseImport, matchPlayers, comparePlayers } from './engine.js';

const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const year = new Date().getFullYear() + (new Date().getMonth() >= 8 ? 1 : 0);
const STORAGE = 'courtside-value-lab-v1';
const windowName = value => ({season:'Season to date','14':'Last 14 games','8':'Last 8 games'}[value] || 'Imported window');
const signed = value => value == null ? '—' : (Math.abs(value) < .05 ? '0.0' : `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}`);
const number = value => value == null ? '—' : Number(value).toFixed(1);
const signClass = value => value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral';
let sourceTab = 'projections', toastTimer, generation = 0, currentResults = [], currentMatches;
let state = {demo:true,projections:null,current:null,scoring:{...DEFAULT_SCORING},workerUrl:'',workerPeriod:'season',season:year};
try { const saved = JSON.parse(localStorage.getItem(STORAGE)); if (saved?.version === 1) state = {...state,...saved.state,scoring:{...DEFAULT_SCORING,...saved.state.scoring}}; } catch { /* Browser storage is optional. */ }

function demoData() {
  const people = [
    ['Jordan Ellis','BOS','SF',[34,25,7.2,4.3,1.2,.7,2.8,2.4,8.5,18,5.2,6.3],[-2,-4.2,-1.1,-.8,-.2,-.2,-.5,.5,-1,0,-1,.2]],
    ['Marcus Reed','SAC','PG',[35,23,4.5,7.8,1.4,.3,2.5,3.0,8,17,4.5,5.4],[-1,-3.1,-.7,-1.2,-.3,0,-.6,.4,-1,.3,-.8,0]],
    ['Noah Brooks','NYK','C',[32,19,11.2,2.8,.8,1.8,.4,2.0,7.5,13,3.6,5.1],[-2,-2.4,-1.7,-.3,-.1,-.5,-.2,.3,-.7,.2,-.6,.2]],
    ['Eli Bennett','DEN','SG',[31,21,4.3,4.2,1.1,.4,3.2,1.8,7.2,16,3.4,4.1],[-1,-3.4,-.5,-.5,-.2,-.1,-.8,.1,-1,.1,-.6,.1]],
    ['Adrian Cole','MIL','PF',[30,17,8.5,3.1,.9,1.1,1.5,1.9,6.2,12,3.1,4.2],[-1,-1.8,-1.2,-.4,-.2,-.2,-.3,.2,-.5,0,-.5,.2]],
    ['Miles Carter','ORL','SF',[29,18,5.6,3.8,1.3,.5,1.9,2.2,6.5,14,3.1,4],[-1,-1.2,-.6,-.3,-.2,-.1,-.3,.3,-.4,0,-.2,0]],
    ['Cameron Hayes','LAL','SG',[31,20,4.2,3.4,1.0,.4,2.7,2.1,7,15,3.3,4],[3,4.9,1.0,1.1,.5,.2,1.0,-.4,1.7,2,.5,.4]],
    ['Darius Mitchell','ATL','PG',[33,22,3.4,8.2,1.2,.2,2.4,3.2,7.5,17,4.6,5.2],[2,3.8,.6,1.5,.3,.1,.7,-.5,1.2,1.2,.7,.5]],
    ['Isaac Turner','MEM','C',[28,15,9.1,2.3,.6,1.6,.5,1.5,6,10,2.5,4],[3,2.6,2.1,.5,.3,.6,.2,-.2,.8,1.0,.8,.5]],
    ['Theo Parker','HOU','PF',[30,17,7.2,2.8,1.1,.8,1.8,1.8,6,13,3.2,4],[2,3.2,1.1,.7,.3,.2,.8,-.3,1,1.5,.4,.3]],
    ['Luca Morgan','CHI','SF',[32,19,5.8,4.3,1.0,.5,2.1,2.4,6.6,14,3.7,4.5],[1,2.5,.9,.7,.2,.2,.5,-.2,.8,1,.4,.2]],
    ['Jalen Davis','PHX','SG',[27,14,3.5,3.1,.9,.3,2.2,1.7,5,11,1.8,2.3],[2,1.9,.5,.5,.3,.1,.6,-.2,.6,1,.1,.1]]
  ];
  const projections=[],current=[];
  for (const [index,[name,team,position,values,diffs]] of people.entries()) {
    const stats=Object.fromEntries(STAT_DEFS.map((def,i)=>[def.key,values[i]]));
    const actual=Object.fromEntries(STAT_DEFS.map((def,i)=>[def.key,Math.max(0,values[i]+diffs[i])]));
    projections.push({name,team,position,stats,hashtagId:`demo-${index}`});
    current.push({name,team,position,stats:actual,games:8+index,hashtagId:`demo-${index}`});
  }
  return {projections:{players:projections,metadata:{source:'Illustrative demo',basis:'per-game',horizon:'rest-of-season',season:year}},current:{players:current,metadata:{source:'Illustrative demo',basis:'per-game',period:'season',season:year}}};
}
const demo = demoData();
function datasets(){return state.demo ? demo : state;}
function persist(){try{localStorage.setItem(STORAGE,JSON.stringify({version:1,state}));}catch{toast('Browser storage unavailable. Keep your import files to restore this session.');}}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5500);}
function humanDate(value){if(!value)return 'date not recorded';const date=new Date(value);return Number.isFinite(date.valueOf())?date.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'date not recorded';}

function playerCard(player,index){
  const defs = STAT_DEFS.filter((def,i)=> i<8 || $('shooting').checked || state.scoring[def.key]!==0);
  const initial = player.name.split(/\s+/).map(s=>s[0]).slice(0,2).join('');
  const row=(label,kind)=>`<tr class="${kind}"><td>${label}</td>${defs.map(def=>{
    const value=kind==='difference'?player.statDeltas[def.key]:player[kind][def.key];
    const direction=player.statPerformance[def.key];
    return `<td class="${kind==='difference'?signClass(direction):''}" title="${escape(def.name)}${kind==='difference'?' · current minus projection':''}">${kind==='difference'?signed(value):number(value)}</td>`;
  }).join('')}<td class="fpts ${kind==='difference'?signClass(player.delta):''}">${kind==='current'?number(player.currentFpts):kind==='projection'?number(player.projectionFpts):signed(player.delta)}</td></tr>`;
  return `<article class="player-card"><div class="player-top"><span class="player-rank">${String(index+1).padStart(2,'0')}</span><span class="avatar" aria-hidden="true">${escape(initial)}</span><div><h3 class="player-name">${escape(player.name)}</h3><div class="player-meta"><b>${escape(player.currentPlayer.team||player.team||'—')}</b><span class="meta-dot"></span>${escape(player.position||'—')}<span class="meta-dot"></span>${player.games??'—'} GP</div></div><div class="player-gap"><div class="gap-badge">${signed(player.delta)}<span>FPTS / G</span></div><div class="gap-percentage">${player.gapPercent==null?'No % baseline':`${signed(player.gapPercent)}% vs ROS`}</div></div></div><div class="stats-wrap" tabindex="0" role="region" aria-label="${escape(player.name)} stat comparison"><table class="stats-table ${defs.length>8?'with-shooting':''}"><caption class="sr-only">${escape(player.name)}, per-game stats and ROS projection</caption><thead><tr><th scope="col">PER GAME</th>${defs.map(def=>`<th scope="col" title="${escape(def.name)}">${def.label}</th>`).join('')}<th scope="col" class="fpts">FPTS</th></tr></thead><tbody>${row('Current','current')}${row('ROS proj.','projection')}${row('Difference','difference')}</tbody></table></div></article>`;
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
  $('under-list').innerHTML=under.length?under.map(playerCard).join(''):`<div class="empty-list"><b>${complete.length?'No players match these filters':'Add your data to find the gap'}</b>${complete.length?'Try another position or a lower minimum games filter.':'Import ROS projections and current stats in Data sources.'}</div>`;
  $('over-list').innerHTML=over.length?over.map(playerCard).join(''):`<div class="empty-list"><b>${complete.length?'No players match these filters':'Your next sell-high starts here'}</b>${complete.length?'Try another position or a lower minimum games filter.':'Both sources must be matched before players can be ranked.'}</div>`;
  $('summary-count').textContent=complete.length;$('summary-under').textContent=complete.filter(p=>p.delta<-.000001).length;$('summary-over').textContent=complete.filter(p=>p.delta>.000001).length;
  $('under-count').textContent=under.length;$('over-count').textContent=over.length;
  $('coverage-detail').textContent=`${complete.length} of ${data.projections?.players.length||0} projected players · ${windowName(data.current?.metadata.period)}`;
  $('baseline-detail').textContent=state.demo?'Illustrative values · fictional players':`${data.projections?.metadata.source||'Import Hashtag projections'}${data.projections?` · ${data.projections.metadata.season-1}–${String(data.projections.metadata.season).slice(-2)}`:''}`;
  $('data-banner').classList.toggle('ready',!state.demo&&complete.length>0);
  $('data-banner').innerHTML=state.demo?'<span><b>ILLUSTRATIVE DEMO</b> Fictional players and sample numbers. Import your data to find real opportunities.</span><button class="text-button" id="banner-import">Use my data ↗</button>':`<span><b>${complete.length?'YOUR DATA':'AWAITING DATA'}</b> ${data.projections?`${data.projections.players.length} ROS projections · snapshot ${humanDate(data.projections.metadata.capturedAt||data.projections.metadata.importedAt)}`:'Import your rest-of-season projections.'}${data.current?` · ${data.current.players.length} current-stat rows · ${windowName(data.current.metadata.period)} · ${humanDate(data.current.metadata.updatedAt||data.current.metadata.capturedAt||data.current.metadata.importedAt)}`:' Add current stats to compare.'}</span><button class="text-button" id="banner-import">Manage sources ↗</button>`;
  $('banner-import').onclick=()=>openSources();
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
  $('source-status').innerHTML=`<span>Projections: <b>${state.demo?'Demo':data.projections?`${data.projections.players.length} imported`:'Not imported'}</b></span><span>Current stats: <b>${state.demo?'Demo':data.current?`${data.current.players.length} imported`:'Not imported'}</b></span><span>Scoring: <b>${Object.keys(state.scoring).every(key=>state.scoring[key]===DEFAULT_SCORING[key])?'Standard points':'Custom points'}</b></span>`;
}

function openSources(tab='projections'){setSourceTab(tab);$('sources-dialog').showModal();}
function setSourceTab(tab){sourceTab=tab;document.querySelectorAll('[data-source-tab]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.sourceTab===tab)));$('import-form').hidden=tab==='worker';$('worker-form').hidden=tab!=='worker';$('import-message').textContent='';$('basis-confirm').checked=false;$('import-text').value='';$('import-file').value='';$('file-name').textContent='or paste a table below';$('current-period-label').hidden=tab==='projections';$('import-submit').textContent=tab==='current'?'Import current stats':'Import projections';$('basis-confirm-text').textContent=tab==='current'?'These are per-game current stats for the season and window selected above.':'I’ve selected pure rest-of-season projections and per-game averages.';$('import-instruction').innerHTML=tab==='current'?'Paste the current per-game table or import its JSON / CSV. Include PLAYER, GP, and the categories used by your scoring. You can also fetch current stats from your own worker.':'While logged into Hashtag, select pure <b>rest-of-season</b> projections and <b>per-game</b> averages. Use the exporter below or copy the table including its headers. The app never asks for your password or cookies.';$('import-season').value=state.season;$('worker-url').value=state.workerUrl;$('worker-period').value=state.workerPeriod;$('worker-season').value=state.season;}
document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>button.closest('dialog').close());
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}}));
$('sources-open').onclick=()=>openSources();$('method-open').onclick=()=>$('method-dialog').showModal();
document.querySelectorAll('[data-source-tab]').forEach(button=>button.onclick=()=>setSourceTab(button.dataset.sourceTab));
for(const id of ['search','position','min-games','sort','shooting'])$(id).addEventListener(id==='search'?'input':'change',render);
function scoringFields(scoring){$('scoring-fields').innerHTML=STAT_DEFS.map(def=>`<label>${def.label} <span>${def.name}</span><input name="${def.key}" type="number" step="any" min="-10000" max="10000" required value="${scoring[def.key]}"></label>`).join('');}
$('scoring-open').onclick=()=>{scoringFields(state.scoring);$('scoring-dialog').showModal();};
$('scoring-reset').onclick=()=>scoringFields(DEFAULT_SCORING);
$('scoring-form').onsubmit=event=>{event.preventDefault();const data=new FormData(event.target);const scoring=Object.fromEntries(STAT_DEFS.map(def=>[def.key,Number(data.get(def.key))]));if(!Object.values(scoring).every(Number.isFinite))return;state.scoring=scoring;persist();render();$('scoring-dialog').close();toast('League scoring applied. FPTS and rankings updated.');};
$('import-file').onchange=async event=>{const file=event.target.files[0];if(!file)return;if(file.size>8*1024*1024){$('import-message').textContent='Choose a file smaller than 8 MB.';return;}$('import-text').value=await file.text();$('file-name').textContent=file.name;};
$('import-form').onsubmit=event=>{
  event.preventDefault();
  try{
    const imported=parseImport($('import-text').value),metadata=imported.metadata,selectedSeason=Number($('import-season').value);
    if(metadata.kind&&((sourceTab==='projections'&&/current|actual/i.test(metadata.kind))||(sourceTab==='current'&&/projection/i.test(metadata.kind))))throw new Error('This file belongs in the other source tab. Check the exported dataset kind.');
    if(metadata.horizon&&sourceTab==='projections'&&/full.?season|pre.?season/i.test(metadata.horizon))throw new Error('This file is marked full-season. Export pure rest-of-season projections for this baseline.');
    if(sourceTab==='projections'&&/blend/i.test(JSON.stringify(metadata)))throw new Error('This source is marked BLEND. Export pure ROS projections.');
    if(metadata.season&&Number(metadata.season)!==selectedSeason)throw new Error(`The file says season ${metadata.season}; change the season selection to match.`);
    if(sourceTab==='current'&&metadata.period&&String(metadata.period)!==$('import-period').value)throw new Error(`The file uses period ${metadata.period}; change the selected current stats window to match.`);
    if(state.demo){state.projections=null;state.current=null;state.demo=false;}
    generation++;
    state[sourceTab]={...imported,metadata:{...metadata,source:metadata.source||'Imported table',season:selectedSeason,basis:'per-game',importedAt:new Date().toISOString(),...(sourceTab==='projections'?{horizon:'rest-of-season'}:{period:$('import-period').value})},warnings:imported.warnings.filter(w=>!w.startsWith('Confirm these stats'))};
    state.season=selectedSeason;persist();render();
    $('import-message').className='form-message success';$('import-message').textContent=`Imported ${imported.players.length} players.${imported.players.length<=30&&sourceTab==='projections'?' Check coverage: Hashtag free access is limited to 30 players.':''}`;
    $('import-text').value='';$('basis-confirm').checked=false;
    toast(`${imported.players.length} ${sourceTab==='projections'?'ROS projections':'current-stat rows'} imported.`);
  }catch(error){$('import-message').className='form-message';$('import-message').textContent=error.message;}
};
$('clear-data').onclick=()=>{generation++;state={...state,demo:false,projections:null,current:null};persist();render();$('import-message').textContent='Imported data cleared from this browser.';};
$('load-demo').onclick=()=>{generation++;state.demo=true;persist();render();$('sources-dialog').close();toast('Illustrative demo loaded. All players and numbers are fictional.');};
async function getJson(url){const response=await fetch(url,{signal:AbortSignal.timeout(30000),credentials:'omit'});if(!response.ok)throw new Error(`Worker returned HTTP ${response.status}. Check its URL and deployment.`);const data=await response.json();if(data.error)throw new Error(data.error);return data;}
$('worker-form').onsubmit=async event=>{
  event.preventDefault();const button=$('worker-submit'),message=$('worker-message');message.className='form-message';
  if(state.demo||!state.projections){message.textContent='Import your ROS projections first, then fetch current stats.';return;}
  const inputUrl=new URL($('worker-url').value);if(inputUrl.protocol!=='https:'||inputUrl.username||inputUrl.password){message.textContent='Use an HTTPS Worker URL without credentials.';return;}
  const season=Number($('worker-season').value),period=$('worker-period').value,token=++generation,projectionSnapshot=state.projections;
  if(String(projectionSnapshot.metadata.season)!==String(season)){message.textContent='Select the same season as your ROS projection import.';return;}
  const base=inputUrl.origin;button.disabled=true;message.textContent='Matching your projections to the depth-chart roster…';
  try{
    const roster=await getJson(`${base}/roster`);if(!Array.isArray(roster.players))throw new Error('Worker /roster response must contain a players array.');
    const rosterPlayers=roster.players.map(player=>({...player,espnId:String(player.id),stats:{}}));
    const matches=matchPlayers(projectionSnapshot.players,rosterPlayers),ids=[...new Set(matches.players.map(p=>p.currentPlayer.espnId))];
    if(!ids.length)throw new Error('No projections matched the ESPN roster. Check full player names or import current stats instead.');
    const returned=[],errors=[];let updatedAt;
    for(let i=0;i<ids.length;i+=20){
      if(token!==generation)return;
      message.textContent=`Fetching current stats: ${Math.min(i+20,ids.length)} / ${ids.length} players…`;
      const data=await getJson(`${base}/stats?${new URLSearchParams({ids:ids.slice(i,i+20).join(','),period,season:String(season)})}`);
      if(data.period!==period||String(data.season)!==String(season)||!Array.isArray(data.players))throw new Error('Worker returned a different period, season, or invalid player data.');
      updatedAt=data.updatedAt;
      for(const player of data.players){const identity=rosterPlayers.find(p=>p.espnId===String(player.id));if(!identity)continue;if(player.error){errors.push(`${identity.name}: ${player.error}`);continue;}returned.push({...identity,...player,espnId:String(player.id)});}
    }
    if(token!==generation)return;
    if(!returned.length)throw new Error(`ESPN returned no usable stats. ${errors.slice(0,3).join('; ')}`);
    const parsed=parseImport(JSON.stringify({players:returned,metadata:{source:'ESPN via your worker',season,period,basis:'per-game',updatedAt,errors}}));
    state.current=parsed;state.workerUrl=base;state.workerPeriod=period;state.season=season;persist();render();message.className='form-message success';message.textContent=`Loaded ${returned.length} players. ${errors.length} failed lookups; ${matches.unmatchedProjections.length+matches.ambiguous.length} projections did not match the roster. Review coverage above the lists.`;toast('Current stats updated. Review source coverage before trading.');
  }catch(error){if(token===generation)message.textContent=error.message;}finally{button.disabled=false;}
};
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type})),anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export-results').onclick=()=>{if(!currentResults.length){toast('No matched players to export.');return;}const defs=STAT_DEFS;const headers=['Player','Team','Position','Games','Source','Row','FPTS',...defs.map(def=>def.label)];const rows=[headers];for(const player of currentResults){for(const kind of ['current','projection','difference'])rows.push([player.name,player.currentPlayer.team||player.team,player.position,player.games,state.demo?'Fictional demo':'Imported data',kind,kind==='current'?player.currentFpts:kind==='projection'?player.projectionFpts:player.delta,...defs.map(def=>kind==='difference'?player.statDeltas[def.key]:player[kind][def.key])]);}const quote=value=>`"${String(value??'').replace(/"/g,'""')}"`;download(`value-lab-${state.demo?'DEMO-':''}${new Date().toISOString().slice(0,10)}.csv`,rows.map(row=>row.map(quote).join(',')).join('\r\n'),'text/csv;charset=utf-8');};
render();
