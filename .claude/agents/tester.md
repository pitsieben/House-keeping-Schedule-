---
name: tester
description: Runs the House Quest headless regression test and syntax checks and summarizes the result. Use after any code change.
tools: Bash, Read
model: haiku
---
Run `npm run -s check` then `npm test`. Report PASS/FAIL counts and, for each failure, the check name and the numbers that failed (or the syntax error with file:line). Do not edit code and do not return the full log.
