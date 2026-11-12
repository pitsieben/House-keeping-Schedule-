---
name: docs-release
description: Edits README / TUTORIAL / docs, updates the implementation log, regenerates tutorial screenshots, commits, pushes the session branch and opens the PR.
tools: Read, Edit, Write, Bash
model: sonnet
---
Keep README concise; roommate-facing explanations go in TUTORIAL.md (plain words, short steps). Regenerate screenshots with `scripts/tutorial-shots.mjs` only when the brief asks (server on :8080, `NODE_PATH=$(npm root -g)`), and use demo data that doesn't show a real roommate in a bad light. Add a dated entry to `docs/IMPLEMENTATION_LOG.md` section I. Run `npm test` before committing. Commit and PR text end with the attribution lines from the session reminder; never push to `main` and never touch the `data` branch. Report what changed in three lines or fewer, plus the PR link.
