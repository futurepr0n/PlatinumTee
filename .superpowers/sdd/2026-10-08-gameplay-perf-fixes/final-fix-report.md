# Final fix wave report

Test command: `npm test` -> tests 107, pass 107, fail 0 (was 103). Focused: `node --test tests/gameManagerWiring.test.mjs` -> 4 pass.

1. Scorecard on new round: gameManager nextHoleButtonClicked (roundSummaryShown branch) now calls UI.scorecard.updateScoreCard(GameState.getScoreCard(), GameState.getTotalHoles()) after reset+generateNewHole; handleHoleComplete passes total holes. Added/exported getTotalHoles() in js/gameState.js. Tests: getTotalHoles()===9 (behavioral); source-level assertion on both updateScoreCard calls.
2. Keyboard path: simulateSpecificButtonPressRequested compares against GameState.GameState.{AIMING,POWER,ACCURACY,COMPLETE}. Test is SOURCE-LEVEL (GameManager not constructible in Node: imports Three/DOM): asserts the four qualified comparisons and absence of bare ones. Updated tests/controlEvents.test.mjs, whose regex pinned the old buggy bare form.
3. OOB toast: skipped when data.strokes >= MAX_STROKES_PER_HOLE (imported from js/rules.js). Source-level test.
Also removed stale "Magic number" comment in js/ui/Scorecard.js.
