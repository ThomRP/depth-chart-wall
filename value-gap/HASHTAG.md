# Hashtag Basketball data import

The default baseline for Value Gap is **pure rest-of-season projections**. Compare those with current **per-game** statistics using the same season and your league's scoring coefficients. A positive FPTS gap means current output is above the projection; a negative gap means current output is below it.

## What was verified

- The [public projections page](https://hashtagbasketball.com/fantasy-basketball-projections) contains readable stat tables, but explicitly restricts free visitors to the top 30 players. Full projections require subscription access.
- Hashtag's [official guide](https://hashtagbasketball.com/user-guide) distinguishes pure projections from BLEND 7/14, which combine projections with recent performance. Select a pure projection source for an independent comparison baseline.
- The [points-league rankings page](https://hashtagbasketball.com/fantasy-basketball-points-league-rankings) provides current statistics and scoring settings. The page's TOTAL column is a calculated league score; Value Gap recalculates FPTS from the individual statistics using your own settings.
- Projection player links carry Hashtag player IDs. The exporter preserves those IDs when available and preserves displayed player names without guessing expanded names.
- FG% and FT% cells can contain made/attempted pairs. The exporter extracts those pairs as FGM/FGA and FTM/FTA.

No documented official API or CSV export was found in the public pages or guide. An authenticated server fetch has not been verified. A subscription alone does not prove that a Cloudflare Worker can retrieve the full table: the logged-in request, session expiry, and page structure still need to be tested.

## Export while signed in

1. Open Hashtag in your own browser and sign in normally.
2. Open the projections table. Select **pure rest-of-season projections**, **per-game averages**, the intended season, and the full player list. Wait for the table to refresh. Do not choose a BLEND source or season totals.
3. Open [hashtag-export.js](./hashtag-export.js), copy the entire file, and paste it into the browser developer console on the Hashtag page. Run it. The browser downloads a JSON file.
4. Import that file into Value Gap as projections. Check the source, season, player count, and capture time. If the file says the basis or horizon is unconfirmed, verify the selected Hashtag controls and supply the correct basis/horizon through the import flow before using it.
5. Repeat on the current-stat table, with the same per-game basis and season, then import that file as current statistics.

If a browser blocks pasting into its developer console, follow its own instructions only after reviewing the script. The script reads the currently rendered table and visible selected labels. It does not fetch URLs, read cookies or passwords, or send data to a server. Import files remain under your control.

The script stops when a visible control clearly selects totals or BLEND. It marks the basis as `per-game` only when a selected label explicitly confirms per-game/averages; otherwise it marks it `unconfirmed`. It marks the horizon as `rest-of-season` only when a selected label explicitly identifies ROS/rest of season. A generic page title containing “rest of season” is not treated as proof of the selected data set.

Only currently rendered rows are exported. Pagination, player-count filters, collapsed tables, and subscription limits can reduce coverage. A count of 30 or fewer raises a warning; it is not proof of either full or incomplete coverage. Zeros are preserved, unavailable categories are omitted, and missing statistics are not filled with zero.

## Import format

```json
{
  "players": [
    {
      "hashtagId": "110399",
      "name": "Example Player",
      "team": "SA",
      "position": "C",
      "games": 8,
      "stats": {
        "min": 30,
        "pts": 25,
        "reb": 11,
        "ast": 4,
        "stl": 1,
        "blk": 3,
        "tov": 3,
        "fg3m": 2,
        "fgm": 9,
        "fga": 18,
        "ftm": 5,
        "fta": 6
      }
    }
  ],
  "metadata": {
    "source": "Hashtag Basketball",
    "url": "https://hashtagbasketball.com/fantasy-basketball-projections",
    "capturedAt": "2026-11-08T00:00:00.000Z",
    "basis": "per-game",
    "kind": "projections",
    "horizon": "rest-of-season",
    "coverage": "visible-table",
    "possibleTruncation": true,
    "selectedSources": []
  }
}
```

This example contains illustrative statistics, not live player projections. `hashtagId` and `games` may be `null` if the table does not expose them. `season` is included in metadata when detected. The `selectedSources` array records the selected control labels so an ambiguous import can be reviewed.

## Worker integration

A Worker can retrieve current statistics independently and cache normalized responses. The browser export is the initial path for subscriber projections. A future authenticated projection adapter should keep its access private, preserve source/capture metadata, detect login pages and truncated tables, and retain the previous valid data when a refresh fails. Do not put account credentials or session cookies in the front end or source repository.

Hashtag's [terms](https://hashtagbasketball.com/terms-conditions) require written consent for redistribution or republication. A shared public service that republishes the paid projection data needs that permission; this import workflow is designed for the subscriber's own comparison.
