# Using Value Lab

Open [Value Lab on GitHub Pages](https://thomrp.github.io/depth-chart-wall/value-gap/). It is already running: you do not need to start a server or deploy the Worker again.

On your first visit, choose **Data sources → Projections** and import your saved Hashtag ROS JSON and DARKO CSV separately. Confirm per-game projections and use the same season ending year for both. **Combined ROS (50/50)** becomes the selected baseline once both are available. The public GitHub site contains the app code; projection files stay in your browser after you import them.

If you previously used the ChatGPT-hosted version, import the JSON once on the GitHub domain and reapply any custom scoring/filter settings. Browser storage belongs to each domain and does not transfer automatically. The same existing Cloudflare Worker supplies current stats.

Current NBA stats load automatically after the projections are available. Watch the status beside **Refresh NBA stats**; the comparison lists fill as batches arrive. Current stats refresh every 15 minutes while the page is open, or when you click that button.

## Using Combined ROS

1. Choose **Data sources → Projections** and import your Hashtag **pure rest-of-season, per-game** projections. Saved Hashtag HTML/JSON is detected automatically. For a plain CSV or copied table, select **Projection provider → Hashtag ROS**.
2. In the same tab, import your DARKO Fantasy Lab CSV. Use ending year **2027** for both files during the 2026–27 season. The DARKO file does not record its season, so check this selection yourself.
3. Close Data sources. The app selects **Combined ROS (50/50)** when the two inputs first become available. You can select Hashtag, standalone DARKO, or Combined ROS using **Projection source**.
4. Set **League scoring** and any filters. Combined scoring initially copies your saved Hashtag scoring, including shooting-volume categories; later changes are saved for the combined baseline separately.
5. Open **Projection inputs** on a player card to inspect the calculation. Open **Review combined projection coverage** above the lists to see players excluded because of missing matches or invalid minutes.

The calculation uses **Hashtag minutes only**:

```text
DARKO rate = DARKO stat per game ÷ DARKO projected minutes
Combined stat per game = (Hashtag stat per game + DARKO rate × Hashtag minutes) ÷ 2
Combined projected minutes = Hashtag projected minutes
```

Example: DARKO's 18 points in 24 minutes becomes 24 points at Hashtag's 32 minutes. If Hashtag projects 20 points, the combined projection is **22 points in 32 minutes**. The app calculates FPTS from the final stat line with your league scoring; it does not average the sources' precomputed fantasy points.

The supplied DARKO CSV omits **FGM/FGA/FTM/FTA**. Combined ROS keeps those values **Hashtag-only** and labels them in the coverage notice and player inputs. Any other stat missing from DARKO also stays Hashtag-only. A missing Hashtag stat remains missing. FG%/FT% follow the resulting makes/attempts; percentages are not divided by minutes or used to invent shot volume. Thus, with this CSV, the shooting-volume part of your fantasy scoring comes entirely from Hashtag.

Only players with a unique match and positive projected minutes in **both** sources enter Combined ROS. Players appearing in just one file stay available under that source. No projection is guessed for an absent player. Different source seasons prevent a combined baseline and remove the previous combined calculation until the inputs match again.

All projection imports and updates remain **manual**. Download a fresh file from either provider and reimport it; Combined ROS rebuilds locally using the latest saved pair. If you were viewing Combined ROS, it stays selected after a successful update. Switching to a standalone baseline preserves its separate scoring. Keep both original files for another browser/device; generated Combined ROS JSON is a calculation archive and does not replace the two source imports.

## Updating projections during the season

1. Sign in to Hashtag Basketball and open the same projection table you used before.
2. Select **Top 300**, **pure Rest-of-Season Projections**, and **Per-game Average** for the correct NBA season. Wait for the table to finish updating. Leave position/team filters on all players and include injured players for broader coverage. Avoid BLEND, STREAM, and totals sources.
3. Open [the exporter script](https://thomrp.github.io/depth-chart-wall/value-gap/hashtag-export.js) and copy its entire contents. The same script is available as [hashtag-export.js](hashtag-export.js) in this repository.
4. Return to the Hashtag tab. Open Firefox's **Web Console** with **Ctrl + Shift + K** on Windows/Linux or **Command + Option + K** on Mac. Paste the script into the console input and press **Enter**. It downloads a dated JSON file and reports how many rows it exported.
5. Open Value Lab and choose **Data sources → Projections → Choose page source / data**. Select that JSON file.
6. Check the detected player count, season, and per-game basis. Confirm the ROS/per-game checkbox and click **Import projections**. If you want to preserve custom scoring already entered in Value Lab, uncheck **Use the scoring settings detected in this page** before importing.

The lists and Combined ROS recalculate using the new projections and the saved DARKO import. Current NBA stats remain automatic; a new current-stat export is not needed. The 2026–27 NBA season uses ending year **2027** throughout that season.

A weekly export is a practical routine. Update sooner when Hashtag revises projections after major injuries, trades, or role changes. The app does not automatically refresh the paid Hashtag projection snapshot.

Imports, scoring, and the minimum projected FPTS filter stay in the current browser profile. Keep the downloaded JSON files so you can import the same snapshot on another device or browser. A manual import becomes your browser's selected baseline and is preserved when the hosted default snapshot changes.

## Importing and updating DARKO

1. Open [DARKO Fantasy Lab](https://www.darko.app/projections), clear any player/team filters, and click **Download CSV**. No console script is needed.
2. In Value Lab, choose **Data sources → Projections → Choose page source / data**, then select the CSV, such as `darko-fantasy-custom.csv`.
3. Check the detected **DARKO Fantasy Lab** label and player count. Select the season ending year (**2027** for 2026–27); the CSV does not contain a season or projection date.
4. Confirm the per-game checkbox and click **Import projections**. Close Data sources to see the lists. If Hashtag is already loaded, Combined ROS is also available. Current NBA stats load automatically.
5. When using **standalone DARKO**, if a scoring warning appears, click **Review available-category scoring**, review the proposed weights, then **Apply scoring**. The supplied CSV omits **FGM, FGA, FTM, and FTA**. Those weights must be zero to calculate standalone DARKO FPTS from this file. This uses reduced scoring for both current and projected stats. Combined ROS can retain your shooting-volume scoring using Hashtag values for those categories.
6. Use **Projection source** above the summary to switch between Hashtag, DARKO, and Combined ROS. Each keeps its own scoring settings, so reduced standalone DARKO scoring does not overwrite your Hashtag or Combined ROS weights.

For updates, download a fresh CSV and repeat the import. It replaces the saved DARKO baseline while preserving Hashtag and your source-specific scoring. The CSV's precomputed **FP/G** has no scoring coefficients attached. Value Lab retains it in downloaded JSON for reference and recalculates comparison FPTS using the weights shown in **League scoring**.

DARKO alone is a **daily** projection using projected minutes and pace; Combined ROS uses its per-minute rates at Hashtag's ROS minutes. Standalone DARKO positions are broad **G/F/C**; Combined ROS keeps Hashtag's positions. Enable **Shooting stats** to see FG% and FT%; their differences are percentage points and do not add fantasy points.

## Everyday controls

- **League scoring** sets the points awarded or deducted per statistic for the selected projection source.
- **Min. projected FPTS** hides players below your selected baseline's points-per-game level. Enter `25` for projections of at least 25 FPTS per game. Use the arrows to change the value by one; clear it to remove the bound.
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
