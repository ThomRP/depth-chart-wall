# Courtside · Value Lab

A standalone points-league tool. Open `value-gap/` from a static HTTP server; the existing depth-chart `index.html` and `worker.js` are unchanged.

The two lists compare current per-game production against **pure rest-of-season projections**. Each player shows current stats, ROS projections, and current-minus-projected differences, including fantasy points. League coefficients recalculate both FPTS rows and the rankings. Penalties such as turnovers reverse favorable colors while preserving the actual signed stat difference.

The private review site starts with the user-supplied NBA projection snapshot. A fresh public-code checkout starts empty. Choose **Data sources** to import your own datasets; no fictional player data is loaded. Choose **League scoring** to configure points. New imports and scoring persist in the current browser’s local storage; clear imports from Data sources. The supplied initial snapshot is packaged only in the owner-private Site, not in this public repository. Imported projections are never sent to the stats worker or the hosting server.

## Data input

Accepts a complete saved Hashtag HTML page (including page source saved as `.txt`), JSON, CSV, or a tab-separated copied table with headers. HTML is parsed in a detached document; only table data and whitelisted source/scoring selections are extracted. Scripts, account fields, and raw HTML are discarded. Source kind, season, per-game basis, player-limit coverage, full names, and supported enabled scoring coefficients are detected from saved selections. A projection library shows real imported players while current data is still missing. Hashtag aliases include `PLAYER`, `POS`, `TEAM`, `GP`, `MPG`, `PTS`, `TREB`, `AST`, `STL`, `BLK`, `TO`, `3PM`, `FG%`, and `FT%`. Percentage cells with `(made/attempted)` preserve shooting volume. Select the correct NBA season ending year and confirm per-game inputs. Explicit totals, BLEND projection metadata, and conflicting source seasons are rejected. Select **Any** for minimum games if your current source lacks GP.

See [Hashtag findings and exporter](HASHTAG.md). Use the exporter on the table you can already view while logged into your own account. It downloads JSON without collecting credentials. The user-supplied logged-in page source has been successfully parsed; automated authenticated fetching is still unverified. A full ROS import must be selected and verified by the user; the application does not substitute the public top-30 table or claim it is a complete feed.

```json
{
  "metadata": {"source":"My ROS snapshot","basis":"per-game","season":2027,"horizon":"rest-of-season"},
  "players": [{"name":"Example Player","team":"BOS","position":"SF","games":8,
    "stats":{"min":32,"pts":20,"reb":6,"ast":4,"stl":1,"blk":0.5,"tov":2,"fg3m":2,"fgm":7,"fga":15,"ftm":4,"fta":5}}]
}
```

Current-stat imports use the same shape with `metadata.kind: "current"` and `metadata.period: "season"`, `"14"`, or `"8"`. Worker windows `8` and `14` mean appearances. Hashtag Last N days sources use distinct `days-7`, `days-14`, and `days-30` metadata, so days are never mislabeled as games. The app does not resample imported averages when changing a window; import the correct source table for each window.

Current stats connect automatically to `https://value-gaps.thomrisped.workers.dev` after ROS projections load. The app refreshes every 15 minutes while open, with a visible progress/error message, a Refresh NBA stats button, and season/last-14-games/last-8-games windows. Fresh cached results avoid redundant fetches; failed or invalid-season refreshes retain the prior valid data. Manual current-stat imports stay selected until the user explicitly switches to NBA stats. For another deployment, use the separate [Worker](value-worker.js) with [WORKER.md](WORKER.md), then change its URL in Data sources. It batches up to 20 ESPN IDs per request and checks the requested season. The app matches stable IDs within their source namespaces, then unique normalized names; ambiguous matches stay excluded and are reported. Explicit Nic/Nicolas Claxton and Alex/Alexandre Sarr aliases resolve verified naming differences. Stable ESPN profile IDs supplement the depth chart for Edwards, Banchero, and Leonard, so those injured players can still be requested; this supplies identities for all 100 players in the provided snapshot. Remaining future unmatched players are reported without guessed identities or invented statistics.

## Calculation and limits

`FPTS = Σ (per-game stat × league weight)` and `gap = current FPTS − ROS FPTS`. Players missing a nonzero weighted stat cannot be ranked. Zero projection baselines have no percentage gap. Filters support name, team, position, games played, absolute FPTS gap and percentage gap. CSV export contains the filtered comparison with all three rows.

The first version supports additive per-stat points, including made/attempted shooting and minutes. It does not score percentage categories, double/triple-double bonuses, or estimate market trade prices. Hashtag pure ROS projections are treated as the baseline; no regression forecasting is added.

## Validation

From the repository root:

```sh
npm ci --prefix value-gap
npm test --prefix value-gap
node --check value-gap/app.js
node --check value-gap/hashtag-export.js
```

Parser, scoring, matching, and Worker tests use fixtures. The HTML importer uses sanitized synthetic fixtures. Browser QA covers the actual supplied page-source import. Automated Hashtag authenticated fetching remains unverified. The user-deployed stats Worker returned valid live 2026–27 responses for Jokic and Doncic. The development environment cannot reach the new Worker hostname, so the full automatic browser flow is also verified with controlled responses and that real two-player sample; full live batch results need confirmation from the app in the user’s browser. Production has no npm runtime dependencies or build steps; linkedom is a development dependency for HTML parser tests.
