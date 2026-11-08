# Current NBA stats worker

The deployed Worker is `https://value-gaps.thomrisped.workers.dev`; the app uses it by default. `value-worker.js` in this folder is its standalone source. It does not replace the repository's existing `../worker.js` and does not need Hashtag account access. The value comparison tool can also work entirely with imported projection/current-stat files without deploying a worker.

1. Create a new Worker in your Cloudflare dashboard.
2. Replace its starter code with the complete contents of `value-worker.js`, then deploy.
3. Enter the resulting HTTPS Worker URL in the tool's data settings.

No secret or API key is required. The worker reads public ESPN gamelogs and the existing depth-chart worker. Projections stay in the user's browser; paid projections are never sent to this worker.

## Routes

The app now resolves all supplied players from bundled public ESPN identities and does not require this proxy route. The user deployment’s `/roster` returned `roster_http_404` while `/stats` worked; this app-side fix requires no Worker redeployment. For unknown future names, the app may try the original public depth feed directly.

`GET /roster` returns `{ updatedAt, players: [{ id, name, team, position }] }`. Player IDs are ESPN athlete IDs, deduplicated across depth-chart positions. Players absent from the existing depth chart are not present in this roster; they can still be requested by known ESPN ID.

`GET /stats?ids=1966,4277811&period=season&season=2027` returns:

```json
{
  "updatedAt": "2026-11-08T10:00:00.000Z",
  "period": "season",
  "season": 2027,
  "players": [
    {
      "id": "1966",
      "games": 9,
      "stats": {
        "min": 30,
        "pts": 20,
        "reb": 8,
        "ast": 6,
        "stl": 2,
        "blk": 1,
        "tov": 4,
        "fgm": 7,
        "fga": 14,
        "ftm": 4,
        "fta": 5,
        "fg3m": 2
      }
    }
  ]
}
```

The response example above illustrates the format and contains invented values. Every statistic is a per-game average. `period=8` and `period=14` mean the latest 8 or 14 regular-season appearances, **not calendar days**. `period=season` includes all regular-season appearances. DNPs and zero-minute appearances are excluded. The season is the NBA ending year: the 2026–27 season is `2027`. When omitted, the season defaults to the current NBA ending year.

At most 20 numeric athlete IDs are accepted per request. The browser should batch larger rosters. Missing columns yield `null`; unavailable player data includes an `error` code and null stats. These players must not be ranked using invented zeros. Season mismatches are rejected. Recent periods are rejected if upstream event dates are missing.

Complete results are cached for 15 minutes. Incomplete or failed batches use `Cache-Control: no-store`. As with the existing worker, the endpoints are public with CORS enabled; no user data or credentials are accepted. ESPN endpoints are undocumented and may change, so import remains the fallback.

Run the parser and request-validation checks with `node --test tests/value-worker.test.mjs` from the repository root. These tests use fixtures, not live ESPN data. A live response supplied from the deployed Worker verified 2026–27 per-game stats for Jokic and Doncic. The development environment does not currently allow this new hostname, so full live batch coverage must be checked in the app in the user’s browser.
