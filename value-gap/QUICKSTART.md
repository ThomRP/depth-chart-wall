# Using Value Lab

Open [Value Lab on GitHub Pages](https://thomrp.github.io/depth-chart-wall/value-gap/). It is already running: you do not need to start a server or deploy the Worker again.

On your first visit, choose **Data sources → Projections**, import your saved Hashtag JSON, confirm ROS/per-game averages, and click **Import projections**. The public GitHub site contains the app code; subscriber projections are stored in your browser after you import them.

If you previously used the ChatGPT-hosted version, import the JSON once on the GitHub domain and reapply any custom scoring/filter settings. Browser storage belongs to each domain and does not transfer automatically. The same existing Cloudflare Worker supplies current stats.

Current NBA stats load automatically after the projections are available. Watch the status beside **Refresh NBA stats**; the comparison lists fill as batches arrive. Current stats refresh every 15 minutes while the page is open, or when you click that button.

## Updating projections during the season

1. Sign in to Hashtag Basketball and open the same projection table you used before.
2. Select **Top 300**, **pure Rest-of-Season Projections**, and **Per-game Average** for the correct NBA season. Wait for the table to finish updating. Leave position/team filters on all players and include injured players for broader coverage. Avoid BLEND, STREAM, and totals sources.
3. Open [the exporter script](https://thomrp.github.io/depth-chart-wall/value-gap/hashtag-export.js) and copy its entire contents. The same script is available as [hashtag-export.js](hashtag-export.js) in this repository.
4. Return to the Hashtag tab. Open Firefox's **Web Console** with **Ctrl + Shift + K** on Windows/Linux or **Command + Option + K** on Mac. Paste the script into the console input and press **Enter**. It downloads a dated JSON file and reports how many rows it exported.
5. Open Value Lab and choose **Data sources → Projections → Choose page source / data**. Select that JSON file.
6. Check the detected player count, season, and per-game basis. Confirm the ROS/per-game checkbox and click **Import projections**. If you want to preserve custom scoring already entered in Value Lab, uncheck **Use the scoring settings detected in this page** before importing.

The lists recalculate using the new projections. Current NBA stats remain automatic; a new current-stat export is not needed. The 2026–27 NBA season uses ending year **2027** throughout that season.

A weekly export is a practical routine. Update sooner when Hashtag revises projections after major injuries, trades, or role changes. The app does not automatically refresh the paid Hashtag projection snapshot.

Imports, scoring, and the minimum projected FPTS filter stay in the current browser profile. Keep the downloaded JSON files so you can import the same snapshot on another device or browser. A manual import becomes your browser's selected baseline and is preserved when the hosted default snapshot changes.

## Everyday controls

- **League scoring** sets the points awarded or deducted per statistic.
- **Min. projected FPTS** hides players below your chosen ROS points-per-game level. Enter `25` for projections of at least 25 FPTS per game. Use the arrows to change the value by one; clear it to remove the bound.
- **NBA stats window** chooses season-to-date, last 14 games, or last 8 games. These recent windows count appearances, not calendar days.
- Search, position, and minimum-games filters narrow both comparison lists. CSV export uses the filtered results.
- A **CACHED** label means a player still shows the previous current-stat value because its latest refresh did not succeed. Unavailable/missing data is reported above the lists.

## Running from the repository instead

The code is a static website with no build or npm install required for normal use. From the repository root, run:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000/value-gap/>. On systems where Python is named `python`, use `python -m http.server 8000` instead. Keep that terminal open while using the local page.

The public repository contains the app code, not the subscriber projections. A fresh local copy starts empty; import your exported projection JSON once. It uses the same configured stats Worker. The existing depth-chart page remains at the repository root, with its own unchanged Worker.

## GitHub Pages hosting

The existing repository publishes `main` from its root to GitHub Pages. The depth chart stays at <https://thomrp.github.io/depth-chart-wall/> and Value Lab is in the `/value-gap/` subfolder. Changes to `main` trigger the Pages build and deployment; you can check its status under the repository’s **Actions** tab. No additional build step is required for Value Lab.

Keep the repository and GitHub Pages enabled to maintain that address. Renaming the account or repository can change the default URL. GitHub Pages is a hosting service, so provider outages or changes are still possible. A custom domain you own can keep the same address when changing hosts.
