// Standalone Cloudflare Worker. This never receives Hashtag credentials or projections.
const ROSTER_URL = "https://ancient-haze-faf8.thomrisped.workers.dev";
const STAT_KEYS = ["min", "pts", "reb", "ast", "stl", "blk", "tov", "fgm", "fga", "ftm", "fta", "fg3m"];
const PERIODS = new Set(["season", "14", "8"]);
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json; charset=UTF-8",
};

function json(body, status = 200, cacheSeconds = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Cache-Control": cacheSeconds ? `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}` : "no-store" },
  });
}

export function currentSeason(now = new Date()) {
  // NBA season years use the ending year, e.g. November 2026 -> 2027.
  return now.getUTCFullYear() + (now.getUTCMonth() >= 8 ? 1 : 0);
}

function numeric(value) {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  const input = String(value ?? "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(input)) return null;
  return Number(input);
}

function minutes(value) {
  const input = String(value ?? "").trim();
  const clock = /^(\d+):(\d{2})$/.exec(input);
  if (clock) return Number(clock[2]) < 60 ? Number(clock[1]) + Number(clock[2]) / 60 : null;
  return numeric(value);
}

function madeAttempt(value) {
  const match = /^(\d+(?:\.\d+)?)\s*[-/]\s*(\d+(?:\.\d+)?)$/.exec(String(value ?? "").trim());
  if (!match) return [null, null];
  const made = Number(match[1]);
  const attempted = Number(match[2]);
  return made <= attempted ? [made, attempted] : [null, null];
}

function normalized(value) { return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, ""); }

function columnMap(data) {
  const labels = (data.labels || []).map(normalized);
  const names = (data.names || []).map(normalized);
  const column = (short, long = []) => {
    for (const alias of short) { const found = labels.indexOf(normalized(alias)); if (found !== -1) return found; }
    for (const alias of long) { const found = names.indexOf(normalized(alias)); if (found !== -1) return found; }
    return -1;
  };
  return {
    min: column(["MIN", "MP"], ["minutes"]),
    pts: column(["PTS"], ["points"]), reb: column(["REB", "TRB"], ["rebounds", "totalRebounds"]),
    ast: column(["AST"], ["assists"]), stl: column(["STL"], ["steals"]), blk: column(["BLK"], ["blocks"]),
    tov: column(["TO", "TOV"], ["turnovers"]),
    fg: column(["FG"], ["fieldGoalsMade-fieldGoalsAttempted"]),
    ft: column(["FT"], ["freeThrowsMade-freeThrowsAttempted"]),
    fg3: column(["3PT", "3P", "3FG"], ["threePointFieldGoalsMade-threePointFieldGoalsAttempted"]),
    fgm: column(["FGM"], ["fieldGoalsMade"]), fga: column(["FGA"], ["fieldGoalsAttempted"]),
    ftm: column(["FTM"], ["freeThrowsMade"]), fta: column(["FTA"], ["freeThrowsAttempted"]),
    fg3m: column(["3PM", "3PTM"], ["threePointFieldGoalsMade"]),
  };
}

function rowStats(row, columns) {
  const get = key => columns[key] >= 0 ? row[columns[key]] : null;
  const fg = madeAttempt(get("fg"));
  const ft = madeAttempt(get("ft"));
  const fg3 = madeAttempt(get("fg3"));
  return {
    min: minutes(get("min")), pts: numeric(get("pts")), reb: numeric(get("reb")),
    ast: numeric(get("ast")), stl: numeric(get("stl")), blk: numeric(get("blk")), tov: numeric(get("tov")),
    fgm: numeric(get("fgm")) ?? fg[0], fga: numeric(get("fga")) ?? fg[1],
    ftm: numeric(get("ftm")) ?? ft[0], fta: numeric(get("fta")) ?? ft[1],
    fg3m: numeric(get("fg3m")) ?? fg3[0],
  };
}

function seasonFromText(text) {
  const range = /\b(20\d{2})\s*[-–/]\s*(\d{2}|20\d{2})\b/.exec(text || "");
  if (range) return range[2].length === 4 ? Number(range[2]) : Number(range[1].slice(0, 2) + range[2]);
  const year = /\b(20\d{2})\b/.exec(text || "");
  return year ? Number(year[1]) : null;
}

function failure(error) { return { games: 0, stats: Object.fromEntries(STAT_KEYS.map(key => [key, null])), error }; }

export function averageGamelog(data, requestedSeason, period = "season") {
  if (!PERIODS.has(period)) return failure("invalid_period");
  const regular = (data.seasonTypes || []).find(type => /\bregular\b/i.test(type.displayName || "") || Number(type.type ?? type.id) === 2);
  if (!regular) return failure("no_regular_season");
  const reportedSeason = numeric(data.season?.year) ?? numeric(data.seasonYear)
    ?? seasonFromText(regular.displayName) ?? seasonFromText(data.season?.displayName);
  if (reportedSeason !== null && reportedSeason !== requestedSeason) return failure("season_mismatch");

  const seen = new Set();
  const rows = [];
  const columns = columnMap(data);
  if (columns.min < 0) return failure("missing_minutes_column");
  for (const category of regular.categories || []) {
    for (const event of category.events || []) {
      if (!Array.isArray(event.stats)) continue;
      const id = String(event.eventId ?? event.id ?? "");
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      const metadata = data.events?.[id];
      const time = Date.parse(event.date ?? metadata?.date ?? "");
      const stats = rowStats(event.stats, columns);
      if (stats.min === null || stats.min <= 0) continue; // DNPs are not appearances.
      rows.push({ time, stats });
    }
  }
  if (!rows.length) return failure("no_regular_season_appearances");
  // When year metadata is missing, every appearance must have a date in this season.
  if (reportedSeason === null) {
    const start = Date.UTC(requestedSeason - 1, 8, 1);
    const end = Date.UTC(requestedSeason, 8, 1);
    if (!rows.every(row => Number.isFinite(row.time))) return failure("season_unverified");
    if (!rows.every(row => row.time >= start && row.time < end)) return failure("season_mismatch");
  }
  if (period !== "season" && rows.some(row => !Number.isFinite(row.time))) return failure("missing_event_dates");
  rows.sort((a, b) => (Number.isFinite(b.time) ? b.time : 0) - (Number.isFinite(a.time) ? a.time : 0));
  const selected = period === "season" ? rows : rows.slice(0, Number(period));
  const averages = {};
  for (const key of STAT_KEYS) {
    // Missing columns or a malformed game keep the category unknown, never zero.
    averages[key] = selected.every(row => row.stats[key] !== null)
      ? selected.reduce((sum, row) => sum + row.stats[key], 0) / selected.length : null;
  }
  return { games: selected.length, stats: averages };
}

async function fetchPlayer(id, season, period) {
  try {
    const url = `https://site.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${id}/gamelog?season=${season}&seasontype=2`;
    const response = await fetch(url, { cf: { cacheTtl: 900 }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) return { id, ...failure(`espn_http_${response.status}`) };
    const data = await response.json();
    return { id, ...averageGamelog(data, season, period) };
  } catch (error) {
    return { id, ...failure(error instanceof SyntaxError ? "invalid_espn_json" : "espn_request_failed") };
  }
}

async function roster() {
  const response = await fetch(ROSTER_URL, { cf: { cacheTtl: 900 }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) return json({ error: `roster_http_${response.status}` }, 502);
  const data = await response.json();
  const players = new Map();
  for (const team of data.teams || []) {
    for (const [position, depth] of Object.entries(team.depth || {})) {
      for (const player of depth) {
        if (!/^\d+$/.test(String(player.id || ""))) continue;
        const existing = players.get(String(player.id));
        if (existing) { if (!existing.position.split("/").includes(position)) existing.position += `/${position}`; continue; }
        players.set(String(player.id), { id: String(player.id), name: player.fullName, team: team.abbr, position });
      }
    }
  }
  if (!players.size) return json({ error: "empty_roster" }, 502);
  return json({ updatedAt: data.updatedAt || new Date().toISOString(), players: [...players.values()] }, 900);
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    const url = new URL(request.url);
    if (url.pathname === "/roster") {
      try { return await roster(); } catch { return json({ error: "roster_request_failed" }, 502); }
    }
    if (url.pathname !== "/stats") return json({ service: "Fantasy Value Gap stats", routes: ["/roster", "/stats?ids=1966&period=season&season=2027"] }, url.pathname === "/" ? 200 : 404);
    const period = url.searchParams.get("period") || "season";
    const seasonString = url.searchParams.get("season") || String(currentSeason());
    const rawIds = (url.searchParams.get("ids") || "").split(",").map(id => id.trim());
    if (!PERIODS.has(period)) return json({ error: "period must be season, 14, or 8 (appearances)" }, 400);
    if (!/^20\d{2}$/.test(seasonString) || Number(seasonString) < 2003 || Number(seasonString) > currentSeason() + 1) return json({ error: "season must be an NBA ending year between 2003 and next season" }, 400);
    if (!rawIds.length || rawIds.length > 20 || rawIds.some(id => !/^\d{1,12}$/.test(id))) return json({ error: "ids must contain 1 to 20 comma-separated ESPN numeric athlete IDs" }, 400);
    const ids = [...new Set(rawIds)].sort((a, b) => Number(a) - Number(b));
    const season = Number(seasonString);
    const key = new Request(`https://cache.internal/value-gap-v1/${season}/${period}/${ids.join(",")}`);
    const cache = globalThis.caches?.default;
    const cached = cache ? await cache.match(key) : null;
    if (cached) return cached;
    // Twenty athlete requests remain below Cloudflare's free-plan subrequest limit.
    const players = await Promise.all(ids.map(id => fetchPlayer(id, season, period)));
    const complete = players.every(player => !player.error && STAT_KEYS.every(stat => player.stats[stat] !== null));
    const response = json({ updatedAt: new Date().toISOString(), period, season, players }, 200, complete ? 900 : 0);
    if (complete && cache && ctx?.waitUntil) ctx.waitUntil(cache.put(key, response.clone()));
    return response;
  },
};
