const TEAMS_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams?limit=32";
const INJURIES_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries";
const DEPTH_URL = (id) => `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${id}/depthcharts`;
const GAMELOG_URL = (id) => `https://site.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${id}/gamelog`;

const EAST_ABBRS = new Set([
  "ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DET", "IND",
  "MIA", "MIL", "NY", "NYK", "ORL", "PHI", "TOR", "WSH", "WAS"
]);

// Build individual YYYYMMDD scoreboard URLs for Today + next 4 days (ESPN requires 1 date per call)
function getScoreboardUrls() {
  const urls = ["https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard"];
  const now = new Date();
  for (let d = 0; d <= 4; d++) {
    const dt = new Date(now.getTime() + d * 24 * 3600 * 1000);
    const ymd = dt.toISOString().slice(0, 10).replace(/-/g, "");
    urls.push(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${ymd}`);
  }
  return urls;
}

function shortenInjury(status = "", comment = "", fantasy = "") {
  if (!status) return { label: "", code: "" };
  const s = status.toUpperCase();
  const combined = `${status} ${fantasy} ${comment}`.toUpperCase();
  if (s.includes("OUT") || s.includes("INJURED") || s.includes("SUSPENSION")) return { label: "O", code: "OUT" };
  if (combined.includes("DOUBT")) return { label: "D", code: "DOUBTFUL" };
  if (combined.includes("QUESTION")) return { label: "Q", code: "QUESTIONABLE" };
  if (combined.includes("PROB")) return { label: "P", code: "PROBABLE" };
  if (s.includes("DAY")) return { label: "DTD", code: "DTD" };
  return { label: s.slice(0, 1), code: s.slice(0, 3) };
}

function extractRecord(recordObj) {
  if (!recordObj) return "";
  const items = recordObj.items || [];
  const total = items.find(i => i.type === "total") || items[0];
  return total?.summary || "";
}

function parseEventForTeam(event, teamId) {
  if (!event || !event.competitions || !event.competitions[0]) return null;
  const comp = event.competitions[0];
  const statusObj = comp.status || event.status || {};
  const state = statusObj.type?.state || "pre";
  const shortDetail = statusObj.type?.shortDetail || "";

  const competitors = comp.competitors || [];
  const me = competitors.find(c => String(c.id || c.team?.id) === String(teamId));
  const opp = competitors.find(c => String(c.id || c.team?.id) !== String(teamId));

  let oppText = "";
  let scoreText = "";
  let teamRecord = "";

  if (me?.records) {
    const totRec = me.records.find(r => r.type === "total") || me.records[0];
    if (totRec?.summary) teamRecord = totRec.summary;
  }

  if (opp && opp.team) {
    const prefix = me?.homeAway === "home" ? "vs" : "@";
    oppText = `${prefix} ${opp.team.abbreviation || ""}`;
    if (state === "in" && me?.score !== undefined && opp?.score !== undefined) {
      const myScore = typeof me.score === "object" ? me.score.displayValue : me.score;
      const oppScore = typeof opp.score === "object" ? opp.score.displayValue : opp.score;
      if (myScore && oppScore) scoreText = `${myScore}-${oppScore}`;
    }
  }

  return {
    state,
    isLive: state === "in",
    date: comp.date || event.date || null,
    opp: oppText,
    clock: shortDetail,
    score: scoreText,
    record: teamRecord
  };
}

// Compute USG% and MPG over the same regular-season appearances in one request.
async function fetchSinglePlayerStats(pid, diagnostic = {}, debug = false, period = "8") {
  if (!pid) return null;
  try {
    const res = await fetch(GAMELOG_URL(pid), { cf: { cacheTtl: debug ? 0 : 3600 } });
    diagnostic.upstreamStatus = res.status;
    diagnostic.contentType = res.headers.get("content-type");
    if (!res.ok) {
      diagnostic.reason = "espn_http_error";
      return null;
    }
    const data = await res.json();

    // ESPN puts short names ("MIN", "FG", "FT", "TO") in data.labels, and long names in data.names
    const labels = (data.labels || []).map(s => String(s).toUpperCase());
    const names = (data.names || []).map(s => String(s).toLowerCase());

    let minIdx = labels.indexOf("MIN");
    if (minIdx === -1) minIdx = names.indexOf("minutes");

    let fgIdx = labels.indexOf("FG");
    if (fgIdx === -1) fgIdx = names.findIndex(n => n.includes("fieldgoalsmade"));

    let ftIdx = labels.indexOf("FT");
    if (ftIdx === -1) ftIdx = names.findIndex(n => n.includes("freethrowsmade"));

    let toIdx = labels.indexOf("TO");
    if (toIdx === -1) toIdx = names.indexOf("turnovers");

    if (minIdx === -1) {
      diagnostic.reason = "missing_stat_columns";
      diagnostic.labels = data.labels || [];
      diagnostic.names = data.names || [];
      return null;
    }

    // Collect regular-season game rows from seasonTypes -> categories -> events
    const seasonTypes = data.seasonTypes || [];
    const regSeason = seasonTypes.find(s => String(s.displayName || "").toLowerCase().includes("regular"));
    if (!regSeason) {
      diagnostic.reason = "no_regular_season";
      return null;
    }
    diagnostic.season = regSeason.displayName;

    const gameRows = [];
    for (const cat of (regSeason.categories || [])) {
      if (Array.isArray(cat.events)) {
        for (const ev of cat.events) {
          if (Array.isArray(ev.stats)) gameRows.push(ev.stats);
        }
      }
    }

    if (!gameRows.length) {
      diagnostic.reason = "no_game_rows";
      return null;
    }

    let totPoss = 0;
    let totMin = 0;
    let gamesCounted = 0;
    const gamesLimit = period === "season" ? Infinity : Number(period);

    for (const stats of gameRows) {
      if (gamesCounted >= gamesLimit) break;
      const minVal = parseFloat(stats[minIdx]) || 0;
      if (minVal <= 0) continue;

      const fgStr = String(stats[fgIdx] || "0-0");
      const fgParts = fgStr.split("-");
      const fga = parseFloat(fgParts.length > 1 ? fgParts[1] : fgParts[0]) || 0;

      const ftStr = String(stats[ftIdx] || "0-0");
      const ftParts = ftStr.split("-");
      const fta = parseFloat(ftParts.length > 1 ? ftParts[1] : ftParts[0]) || 0;

      const tov = toIdx !== -1 ? (parseFloat(stats[toIdx]) || 0) : 0;

      totPoss += fga + (0.44 * fta) + tov;
      totMin += minVal;
      gamesCounted++;
    }

    diagnostic.gamesCounted = gamesCounted;
    diagnostic.minutes = totMin;
    if (gamesCounted === 0) {
      diagnostic.reason = "insufficient_minutes";
      return null;
    }

    // Standard NBA pace: ~2.08 team possessions per minute on floor
    const usgPct = Math.round((totPoss / (totMin * 2.08)) * 100);
    const hasUsage = fgIdx !== -1 && totMin >= 5;
    diagnostic.reason = hasUsage ? "ok" : (fgIdx === -1 ? "missing_stat_columns" : "insufficient_minutes");
    return {
      usg: hasUsage ? Math.min(Math.max(usgPct, 5), 46) : null,
      mpg: Math.round((totMin / gamesCounted) * 10) / 10
    };
  } catch (e) {
    diagnostic.reason = e instanceof SyntaxError ? "invalid_espn_json" : "espn_request_failed";
    return null;
  }
}

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "public, max-age=120, s-maxage=120"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const reqUrl = new URL(request.url);
    const usgParam = reqUrl.searchParams.get("usg");

    // ROUTE A: Batch player USG% + MPG request (?usg=id1,id2,...,id20).
    // Preserve the existing usg map and add an mpg map, without extra upstream requests.
    // Stays under 25 subrequests per call so Cloudflare's 50-subrequest limit is never exceeded
    if (usgParam) {
      const debug = reqUrl.searchParams.get("debug") === "1";
      // Default to 8 games for existing callers; keep every period's cache separate.
      const period = reqUrl.searchParams.get("period") || "8";
      if (!["8", "14", "season"].includes(period)) {
        return new Response(JSON.stringify({ error: "period must be 8, 14, or season" }), {
          status: 400,
          headers: { ...corsHeaders, "Cache-Control": "no-store" }
        });
      }
      const ids = usgParam.split(",").map(s => s.trim()).filter(Boolean).slice(0, 25);
      const batchCacheKey = new Request(`https://cache.internal/usg-mpg-v6/${period}/${ids.join(",")}`, request);
      const cache = caches.default;

      let cachedBatch = debug ? null : await cache.match(batchCacheKey);
      if (cachedBatch) return cachedBatch;

      const results = {};
      const mpgResults = {};
      const diagnostics = {};
      await Promise.all(ids.map(async (id) => {
        diagnostics[id] = { period };
        const stats = await fetchSinglePlayerStats(id, diagnostics[id], debug, period);
        results[id] = stats?.usg ?? null;
        mpgResults[id] = stats?.mpg ?? null;
      }));

      // Failed or unavailable lookups must be retried, not cached as null for 30 minutes.
      const cacheable = !debug && Object.values(results).every(value => value !== null)
        && Object.values(mpgResults).every(value => value !== null);
      const usgResp = new Response(JSON.stringify({ period, usg: results, mpg: mpgResults, ...(debug ? { diagnostics } : {}) }), {
        headers: {
          ...corsHeaders,
          "Cache-Control": cacheable ? "public, max-age=1800, s-maxage=1800" : "no-store"
        }
      });
      if (cacheable) ctx.waitUntil(cache.put(batchCacheKey, usgResp.clone()));
      return usgResp;
    }

    // ROUTE B: Main 30-Team Depth Chart + Live/Upcoming Scoreboard Feed
    const cacheKey = new Request("https://cache.internal/depth-wallboard-v3", request);
    const cache = caches.default;

    let response = await cache.match(cacheKey);
    if (response) {
      return response;
    }

    try {
      const sbUrls = getScoreboardUrls();
      // Total requests here: 1 (teams) + 1 (injuries) + 6 (scoreboards) + 30 (depthcharts) = 38 requests (< 50 limit!)
      const [teamsResp, injuriesResp, ...sbResponses] = await Promise.all([
        fetch(TEAMS_URL, { cf: { cacheTtl: 120 } }).then(r => r.json()),
        fetch(INJURIES_URL, { cf: { cacheTtl: 120 } }).then(r => r.json()).catch(() => ({})),
        ...sbUrls.map(u => fetch(u, { cf: { cacheTtl: 120 } }).then(r => r.json()).catch(() => ({})))
      ]);

      // Merge and deduplicate events across Today + next 4 days
      const eventMap = new Map();
      for (const sb of sbResponses) {
        for (const ev of (sb?.events || [])) {
          if (ev?.id && !eventMap.has(ev.id)) {
            eventMap.set(ev.id, ev);
          }
        }
      }

      const allEvents = Array.from(eventMap.values()).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      const scoreboardMap = {};
      const recordFromScoreboard = {};

      for (const ev of allEvents) {
        const comps = ev.competitions?.[0]?.competitors || [];
        for (const c of comps) {
          const tid = String(c.id || c.team?.id || "");
          if (!tid) continue;
          const parsed = parseEventForTeam(ev, tid);
          if (!parsed) continue;

          if (parsed.record && !recordFromScoreboard[tid]) {
            recordFromScoreboard[tid] = parsed.record;
          }
          // Live game ("in") always takes priority; otherwise keep earliest upcoming ("pre") game
          if (parsed.state === "in") {
            scoreboardMap[tid] = parsed;
          } else if (parsed.state === "pre" && !scoreboardMap[tid]) {
            scoreboardMap[tid] = parsed;
          }
        }
      }

      const injuryMap = {};
      for (const teamGroup of (injuriesResp.injuries || [])) {
        for (const inj of (teamGroup.injuries || [])) {
          const athlete = inj.athlete || {};
          const pid = String(athlete.id || "");
          const pname = (athlete.displayName || athlete.fullName || "").toLowerCase();
          const rawStatus = inj.status || "";
          const shortComment = inj.shortComment || "";
          const details = inj.details || {};
          const fantasyAbbr = (details.fantasyStatus || {}).abbreviation || "";

          const { label, code } = shortenInjury(rawStatus, shortComment, fantasyAbbr);
          let detailStr = rawStatus;
          if (details.type) detailStr += ` (${details.type})`;
          if (details.returnDate) detailStr += ` • Est. Return: ${details.returnDate}`;

          const info = { label, code, detail: detailStr };
          if (pid) injuryMap[pid] = info;
          if (pname) injuryMap[pname] = info;
        }
      }

      const rawTeams = teamsResp?.sports?.[0]?.leagues?.[0]?.teams || [];
      const teams = rawTeams.map(t => {
        const tid = String(t.team.id);
        let gameInfo = scoreboardMap[tid] || null;

        if (!gameInfo && t.team.nextEvent && t.team.nextEvent[0]) {
          const nextEv = parseEventForTeam(t.team.nextEvent[0], tid);
          if (nextEv && (nextEv.state === "in" || nextEv.state === "pre")) {
            gameInfo = nextEv;
          }
        }

        const baseRecord = extractRecord(t.team.record) || gameInfo?.record || recordFromScoreboard[tid] || "";

        return {
          id: tid,
          abbr: t.team.abbreviation,
          name: t.team.displayName,
          record: baseRecord,
          conf: EAST_ABBRS.has(t.team.abbreviation.toUpperCase()) ? "EAST" : "WEST",
          color: "#" + (t.team.color || "f97316"),
          logo: t.team.logos?.[0]?.href || "",
          game: gameInfo
        };
      });

      const emptySlot = { id: "", shortName: "-", fullName: "-", injury: "", injuryCode: "", injuryDetail: "" };
      const depthCharts = await Promise.all(teams.map(t =>
        fetch(DEPTH_URL(t.id), { cf: { cacheTtl: 120 } }).then(r => r.json()).catch(() => ({}))
      ));

      const leagueDepth = teams.map((team, i) => {
        const dResp = depthCharts[i] || {};
        const positions = dResp?.depthchart?.[0]?.positions || {};
        const depth = {};
        const depthRecord = dResp?.team?.recordSummary || extractRecord(dResp?.team?.record) || team.record || "";

        // Fallback if team had no game in next 4 days but depthchart team object has nextEvent
        let teamGame = team.game;
        if (!teamGame && dResp?.team?.nextEvent?.[0]) {
          const nextEv = parseEventForTeam(dResp.team.nextEvent[0], team.id);
          if (nextEv && (nextEv.state === "in" || nextEv.state === "pre")) {
            teamGame = nextEv;
          }
        }

        for (const posKey of ["pg", "sg", "sf", "pf", "c"]) {
          const posAbbr = posKey.toUpperCase();
          const rawAthletes = (positions[posKey]?.athletes || []).slice(0, 5);
          const athletes = rawAthletes.map(a => {
            const pObj = ("displayName" in a || "fullName" in a) ? a : (a.athlete || {});
            const pid = String(pObj.id || "");
            const shortName = pObj.shortName || pObj.displayName || "-";
            const fullName = pObj.displayName || shortName;

            const foundInj = injuryMap[pid] || injuryMap[fullName.toLowerCase()];

            return {
              id: pid,
              shortName,
              fullName,
              injury: foundInj ? foundInj.label : "",
              injuryCode: foundInj ? foundInj.code : "",
              injuryDetail: foundInj ? foundInj.detail : ""
            };
          });

          while (athletes.length < 5) athletes.push(emptySlot);
          depth[posAbbr] = athletes;
        }

        return {
          team: team.name,
          abbr: team.abbr,
          record: depthRecord,
          conf: team.conf,
          color: team.color,
          logo: team.logo,
          game: teamGame,
          depth
        };
      });

      leagueDepth.sort((a, b) => a.team.localeCompare(b.team));

      const payload = JSON.stringify({
        updatedAt: new Date().toISOString(),
        teams: leagueDepth
      });

      response = new Response(payload, { headers: corsHeaders });
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
    }
  }
};
