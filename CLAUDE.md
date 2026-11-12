# House Quest: working notes for Claude

Static web app (GitHub Pages) that turns the house chores of Paco · Pit · Hrithik into a game. No build step, no framework, plain ES modules. Read `README.md` for setup, `TUTORIAL.md` for how roommates use it, and `docs/IMPLEMENTATION_LOG.md` for the compact log (where to work, status, next steps). Don't re-read them unless the task needs them.

## Layout
- `index.html`, `css/style.css`, `sw.js` (network-first service worker), `manifest.webmanifest`, icons.
- `js/schedule.js`: pure rules engine: roommates, rota, duties, `statusOf`, `computeScores`, `POINTS`, `ADMIN`. Also used by `scripts/build-calendar.mjs`.
- `js/store.js`: shared state, synced through `state.json` on the `data` branch via the GitHub contents API (queue, merge on conflict, orphan branch creation).
- `js/app.js`: all views and actions (Today, Week, Ranks, Rooms, Calendar, Rules, Admin), the leaderboard scene, auto-update check.
- `js/rooms.js`: monthly achievements, collectibles, dirt levels, room drawing. `js/sprites.js`: hero pixel art + outfits. `js/ics.js`: calendar export.
- `tests/run.mjs`: headless regression test. `scripts/tutorial-shots.mjs`: regenerates `docs/tutorial/*.png`.

## Commands
- Test: `npm test` (PASS/FAIL per check, ends `ALL CHECKS PASSED`). Syntax: `npm run check`.
- Serve: `npm run serve` → http://localhost:8080. Time-travel: `?now=2026-11-19T09:30`.
- Calendar feeds: `npm run calendar` after changing rota/times in `js/schedule.js`.
- Browser checks: Playwright is preinstalled. Use `NODE_PATH=$(npm root -g) node <script>`, mock `api.github.com` with `page.route`, and screenshot at deviceScaleFactor 1 (2 only for screenshots a person sees).

## Conventions and gotchas
- `main` is protected (ruleset: PR required). Work on the session branch, open a PR, and the user merges. Never push to `main`.
- The app writes **only** to the `data` branch (`state.json`). Don't touch it unless the user asks; never delete `state.json` (the next save would start from empty).
- Scores, achievements and collectibles are **derived** from `state.json`; never store them. New rules go in `computeScores` / `computeAchievements` + a check in `tests/run.mjs`.
- Bump the localStorage keys in `store.js` (`-v2`) only when the user wants a full reset.
- The admin lock is honour-system (PIN hash in `state.json`); say so, and don't present it as security.
- iOS Home Screen apps don't share storage with Safari; any per-device setting must be enterable inside the app.
- Unauthenticated GitHub API = 60 req/h per IP; polling is 20 s, so watch request counts when adding calls.
- Keep changes small, run `npm test` + a headless screenshot of the touched view before committing. Never claim a fix without checking it.
- After each completed step, append a short entry to `docs/IMPLEMENTATION_LOG.md` section I (what changed, checked, not verified) without being asked.
- Commits end with the attribution lines from the session reminder. No model names in commits, PRs or code.

## Token-efficient workflow
Work as orchestrator: delegate to the agents in `.claude/agents/` and keep only their short summaries.
- `explorer` (haiku): where/what questions; returns paths, line numbers and a few lines.
- `tester` (haiku): `npm test` + `npm run check`; returns PASS/FAIL and failing numbers.
- `ui-checker` (sonnet): serves the app, drives a view headlessly with mocked GitHub, and returns screenshots' paths + what looks wrong. Never edits `js/`.
- `game-engineer` (opus): non-trivial rule/scoring/sync/achievement changes from a precise brief; checks only that its own code runs.
- `game-checker` (sonnet): writes independent checks for that change in `tests/run.mjs`, runs them and reports. Never edits `js/`; neither agent may loosen a check to get a pass.
- `pixel-artist` (sonnet): sprites, room items, outfits, scene art in `js/sprites.js`, `js/rooms.js`, `assets/`, `icon*`; returns a screenshot path.
- `docs-release` (sonnet): README/TUTORIAL/log, tutorial screenshots, commit, push, PR.
Rules: agents exchange summaries or file paths, never full logs or whole files; give each agent only the files it needs; filter long output (`tail`, `grep`) before reading it. Small one-file edits: do them directly instead of spawning an agent.
