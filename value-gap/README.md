# Courtside · Value Lab

A standalone points-league tool. Open `value-gap/` from a static HTTP server; the existing depth-chart `index.html` and `worker.js` are unchanged.

The two lists compare current per-game production against **pure rest-of-season projections**. Each player shows current stats, ROS projections, and current-minus-projected differences, including fantasy points. League coefficients recalculate both FPTS rows and the rankings. Penalties such as turnovers reverse favorable colors while preserving the actual signed stat difference.

The first visit shows clearly labeled fictional demo players. Choose **Data sources** to import your own datasets. Importing the first real dataset clears the demo comparison. Choose **League scoring** to configure points. Data and scoring persist only in the current browser’s local storage; clear imports from Data sources. Imported projections are never sent to the stats worker or the hosting server.

## Data input

Accepts JSON, CSV, or a tab-separated copied table with headers. Hashtag aliases include `PLAYER`, `POS`, `TEAM`, `GP`, `MPG`, `PTS`, `TREB`, `AST`, `STL`, `BLK`, `TO`, `3PM`, `FG%`, and `FT%`. Percentage cells with `(made/attempted)` preserve shooting volume. Select the correct NBA season ending year and confirm per-game inputs. Explicit totals, BLEND projection metadata, and conflicting source seasons are rejected. Select **Any** for minimum games if your current source lacks GP.

See [Hashtag findings and exporter](HASHTAG.md). Use the exporter on the table you can already view while logged into your own account. It downloads JSON without collecting credentials. Authenticated live export has not been verified in this environment. A full ROS import must be selected and verified by the user; the application does not substitute the public top-30 table or claim it is a complete feed.

```json
{
  "metadata": {"source":"My ROS snapshot","basis":"per-game","season":2027,"horizon":"rest-of-season"},
  "players": [{"name":"Example Player","team":"BOS","position":"SF","games":8,
    "stats":{"min":32,"pts":20,"reb":6,"ast":4,"stl":1,"blk":0.5,"tov":2,"fg3m":2,"fgm":7,"fga":15,"ftm":4,"fta":5}}]
}
```

Current-stat imports use the same shape with `metadata.kind: "current"` and `metadata.period: "season"`, `"14"`, or `"8"`. Windows mean appearances, not calendar days. The app does not resample imported averages when changing a window; import the correct source table for each window.

For automatic current stats, deploy the separate [Worker](value-worker.js) using [WORKER.md](WORKER.md), then enter its URL in Data sources. It batches up to 20 ESPN IDs per request and checks the requested season. The app matches stable IDs within their source namespaces, then unique normalized names; ambiguous matches stay excluded and are reported. Coverage is limited by the existing depth-chart roster unless current stats are imported directly.

## Calculation and limits

`FPTS = Σ (per-game stat × league weight)` and `gap = current FPTS − ROS FPTS`. Players missing a nonzero weighted stat cannot be ranked. Zero projection baselines have no percentage gap. Filters support name, team, position, games played, absolute FPTS gap and percentage gap. CSV export contains the filtered comparison with all three rows.

The first version supports additive per-stat points, including made/attempted shooting and minutes. It does not score percentage categories, double/triple-double bonuses, or estimate market trade prices. Hashtag pure ROS projections are treated as the baseline; no regression forecasting is added.

## Validation

From the repository root:

```sh
node --test value-gap/engine.test.mjs tests/value-worker.test.mjs
node --check value-gap/app.js
node --check value-gap/hashtag-export.js
```

Parser, scoring, matching, and Worker tests use fixtures. Browser UI receives a separate DOM smoke check during development. Live Hashtag authenticated access and the new Worker’s ESPN integration remain unverified until connected. There are no required npm dependencies or build steps for the app.
