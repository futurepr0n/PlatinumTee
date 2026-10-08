# Gameplay & Performance Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the audit's gameplay bugs (terrain mismatch, wind after landing, no out-of-bounds/stroke cap, wrong result distance, round never ends, ball tee height, shadows only near tee) and its performance problems (per-frame UI churn, always-on trackball render loop, GPU leaks per hole).

**Architecture:** Small, independent fixes inside the existing modules. Pure helpers are extracted where needed so Node tests can pin behavior (`hillHeightAt`, `isOutOfBounds`, `followShadowLight`, `disposeObject`). No new dependencies.

**Tech Stack:** Vanilla ES modules, Three.js 0.184 (importable in Node for tests), `node:test`.

**Spec:** The 2026-10-08 audit (conversation), sections "Gameplay bugs" and "Performance". Out of scope: frame-rate–independent physics (separate plan), multiplayer changes beyond keeping it working.

## Global Constraints

- Single-player and multiplayer (`?host`) flows must keep working; all existing tests keep passing (82 at start).
- No new npm dependencies. No build step.
- Match existing style: 4-space indent, ES modules, no new comments beyond the surrounding density.
- Stroke cap is 10 per hole (same value as `TurnManager`'s default `maxStrokes`).
- Out-of-bounds = ball stops with `|x| > 100` or `z < -500` or `z > 500` (the ground plane is 200 × 1000 centred on the origin). Penalty: +1 stroke, ball returns to where the shot was played from.
- Tee ball height is `BALL_RADIUS` (0.1) above ground.

## Review Focus

1. **Ball goes OOB on the stroke that reaches the cap** → the cap wins: the hole completes at 10, no infinite loop. Test in Task 3.
2. **Ball holed exactly while OOB checks run** → holed beats OOB (holes are always in bounds). Test in Task 3.
3. **Multiplayer host:** OOB/cap must flow through `shotComplete`/`holeComplete` the same way so `HostSession` records the right ball and strokes. Test in Task 3 (snapshot after OOB is the shot origin).
4. **Hidden trackball** must not keep a requestAnimationFrame loop alive, and showing it twice must not start two loops. Test in Task 7.
5. **Disposing course meshes** must not dispose geometry/material shared between trees/bunkers (otherwise the next hole renders black/invisible). Test in Task 8.

---

## File Structure

| File | Change |
|---|---|
| `js/course.js` | `hillHeightAt` pure helper; terrain height matches hill mesh; shared tree/bunker resources; dispose per-hole meshes |
| `js/physics.js` | Delegate terrain height to `terrain.getHeightAt`; wind only while airborne and never for putts |
| `js/gameState.js` | Track shot origin; OOB penalty; stroke cap; `shotInfo.distanceYards`; tee height; `ballMoved` event instead of per-frame `gameStateChanged` |
| `js/rules.js` (new) | `isOutOfBounds`, `MAX_STROKES_PER_HOLE`, `COURSE_BOUNDS` |
| `js/lighting.js` (new) | `followShadowLight(light, position)` |
| `js/utils/dispose.js` (new) | `disposeObject(scene, object, shared)` |
| `js/gameManager.js`, `js/main.js` | Round-complete flow, results distance, shadow follow, `ballMoved` listener, log only real transitions |
| `js/ui/TrackballControl.js` | Start/stop render loop on show/hide |
| `js/net/HostSession.js` | Tee y = 0.1 |

---

### Task 1: Terrain height matches the hill meshes

**Files:**
- Modify: `js/course.js` (`createTerrain`, `getTerrainHeightAt`, exports)
- Modify: `js/physics.js` (`BallPhysics.getTerrainHeightAt`)
- Test: `tests/terrainHeight.test.mjs`

**Interfaces:**
- Produces: `hillHeightAt(hill, x, z) → number` exported from `js/course.js`, where `hill = { position: {x, y, z}, radius, scaleY }`. Hill data objects gain `scaleY`. `BallPhysics.getTerrainHeightAt(x, z, terrain)` returns `terrain.getHeightAt(x, z)` when available, else 0.

Background: each hill mesh is a hemisphere of radius 30 scaled `y × 0.2` and sunk to `y = -5`, so its visible surface is `y = -5 + 0.2·√(30² − d²)`, reaching ground level at d ≈ 16.6 with peak 1.0. Physics currently uses a different radius (30) and peak (1.2), and `physics.js` uses a third (linear) profile — the ball floats or sinks on hills.

- [ ] **Step 1: Write the failing test** — `tests/terrainHeight.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { hillHeightAt } from '../js/course.js';
import { BallPhysics } from '../js/physics.js';
import { getClub } from '../js/clubs.js';

const HILL = { position: { x: 10, y: -5, z: -100 }, radius: 30, scaleY: 0.2 };

test('hill height follows the visible flattened hemisphere', () => {
    assert.ok(Math.abs(hillHeightAt(HILL, 10, -100) - 1) < 1e-9);
    const groundEdge = Math.sqrt(30 * 30 - 25 * 25);
    assert.ok(Math.abs(hillHeightAt(HILL, 10 + groundEdge, -100)) < 1e-9);
    assert.equal(hillHeightAt(HILL, 10 + 20, -100), 0);
    assert.equal(hillHeightAt(HILL, 10 + 31, -100), 0);
});

test('ball physics asks the terrain for its height', () => {
    const physics = new BallPhysics({ x: 0, y: 0.1, z: 0 }, 0, 0.5, getClub('iron7'));
    const terrain = { getHeightAt: (x, z) => x + z };
    assert.equal(physics.getTerrainHeightAt(2, 3, terrain), 5);
    assert.equal(physics.getTerrainHeightAt(2, 3, null), 0);
    assert.equal(physics.getTerrainHeightAt(2, 3, {}), 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/terrainHeight.test.mjs`
Expected: FAIL — `hillHeightAt` is not exported.

- [ ] **Step 3: Implement**

In `js/course.js`, add next to `getTerrainHeightAt`:

```js
function hillHeightAt(hill, x, z) {
    const dx = x - hill.position.x;
    const dz = z - hill.position.z;
    const distanceSquared = dx * dx + dz * dz;
    const radiusSquared = hill.radius * hill.radius;
    if (distanceSquared >= radiusSquared) return 0;

    return Math.max(0, hill.position.y + hill.scaleY * Math.sqrt(radiusSquared - distanceSquared));
}
```

Replace the body of `getTerrainHeightAt(x, z)` with:

```js
function getTerrainHeightAt(x, z) {
    let height = 0;
    for (const hill of hills) {
        height = Math.max(height, hillHeightAt(hill, x, z));
    }
    return height;
}
```

In `createTerrain`, replace the `hillData` object with:

```js
        const hillData = {
            position: {
                x: hill.position.x,
                y: hill.position.y,
                z: hill.position.z
            },
            radius: HILL_RADIUS,
            scaleY: hill.scale.y
        };
```

Delete the now-unused `HILL_INITIAL_HEIGHT_MULTIPLIER` constant. Add `hillHeightAt` to the export list.

In `js/physics.js`, replace the whole `getTerrainHeightAt(x, z, terrain)` method with:

```js
    getTerrainHeightAt(x, z, terrain) {
        return typeof terrain?.getHeightAt === 'function' ? terrain.getHeightAt(x, z) : 0;
    }
```

- [ ] **Step 4: Run tests** — `node --test tests/terrainHeight.test.mjs` then `npm test`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add js/course.js js/physics.js tests/terrainHeight.test.mjs
git commit -m "fix(terrain): match physics height to the visible hill meshes"
```

---

### Task 2: Wind only acts on airborne full shots

**Files:**
- Modify: `js/physics.js` (`BallPhysics.update`, constants)
- Test: `tests/physicsWind.test.mjs`

**Interfaces:**
- Produces: new constant `AIRBORNE_EPSILON = 0.02`. Wind is applied in a frame only if the club is not the putter AND the ball was above `terrainHeight + BALL_RADIUS + AIRBORNE_EPSILON` at the start of the frame.

- [ ] **Step 1: Write the failing test** — `tests/physicsWind.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { BallPhysics } from '../js/physics.js';
import { getClub } from '../js/clubs.js';

const CROSSWIND = { direction: 90, speed: 15 };

function ballAt(y) {
    return { position: { x: 0, y, z: 0 }, rotation: { x: 0, y: 0, z: 0 } };
}

test('putts ignore wind', () => {
    const physics = new BallPhysics({ x: 0, y: 0.1, z: 0 }, 0, 0.5, getClub('putter'), CROSSWIND);
    const ball = ballAt(0.1);
    for (let i = 0; i < 20; i++) physics.update(ball, null);
    assert.equal(ball.position.x, 0);
});

test('a ball rolling on the ground is not pushed by wind', () => {
    const physics = new BallPhysics({ x: 0, y: 0.1, z: 0 }, 0, 0.5, getClub('iron7'), CROSSWIND);
    physics.velocity = { x: 0, y: 0, z: -0.3 };
    const ball = ballAt(0.1);
    physics.update(ball, null);
    assert.equal(physics.velocity.x, 0);
});

test('an airborne ball still drifts with the wind', () => {
    const physics = new BallPhysics({ x: 0, y: 5, z: 0 }, 0, 0.5, getClub('iron7'), CROSSWIND);
    physics.velocity = { x: 0, y: 0.2, z: -0.3 };
    const ball = ballAt(5);
    physics.update(ball, null);
    assert.ok(physics.velocity.x > 0);
});
```

- [ ] **Step 2: Run to verify it fails** — `node --test tests/physicsWind.test.mjs`. Expected: the first two tests FAIL (wind applied).

- [ ] **Step 3: Implement** — in `js/physics.js` add `const AIRBORNE_EPSILON = 0.02;` with the other constants. In `update(ball, terrain)`, replace the wind block:

```js
        // Apply wind effect
        const windRadians = this.wind.direction * (Math.PI / 180);
        const windEffect = this.wind.speed * WIND_EFFECT_MULTIPLIER;
        
        this.velocity.x += Math.sin(windRadians) * windEffect;
        this.velocity.z += -Math.cos(windRadians) * windEffect;
```

with:

```js
        const groundHeight = this.getTerrainHeightAt(ball.position.x, ball.position.z, terrain);
        const isAirborne = ball.position.y > groundHeight + BALL_RADIUS + AIRBORNE_EPSILON;
        if (isAirborne && this.club.name !== 'putter') {
            const windRadians = this.wind.direction * (Math.PI / 180);
            const windEffect = this.wind.speed * WIND_EFFECT_MULTIPLIER;
            this.velocity.x += Math.sin(windRadians) * windEffect;
            this.velocity.z += -Math.cos(windRadians) * windEffect;
        }
```

- [ ] **Step 4: Run tests** — `node --test tests/physicsWind.test.mjs` then `npm test` (watch `tests/physicsArcadeTuning.test.mjs`; if a distance expectation there shifts because rolls no longer drift, report it rather than loosening it silently). Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add js/physics.js tests/physicsWind.test.mjs
git commit -m "fix(physics): apply wind only to airborne non-putter shots"
```

---

### Task 3: Shot origin, out-of-bounds penalty, stroke cap, real shot distance

**Files:**
- Create: `js/rules.js`
- Modify: `js/gameState.js` (`takeShot`, `evaluateShot`, `completeHole`, state shape)
- Modify: `js/gameManager.js` (`registerGameStateCallbacks`, `handleHoleComplete`)
- Test: `tests/rules.test.mjs`, `tests/gameStateRules.test.mjs`

**Interfaces:**
- Produces (`js/rules.js`): `MAX_STROKES_PER_HOLE = 10`, `COURSE_BOUNDS = { halfWidth: 100, minZ: -500, maxZ: 500 }`, `isOutOfBounds({x, z}) → bool`.
- Produces (`gameState`): `state.shotOrigin = {x, y, z} | null` set at each shot; `shotInfo.distanceYards` (integer yards from shot origin to where the ball stopped) set when the ball stops; events `outOfBounds { strokes, fullState }` (emitted before returning to aiming) and `holeComplete` now also carries `pickedUp: bool`. A capped hole completes with `strokes === 10`, `scoreName === 'Picked up'`.
- Ordering in `evaluateShot`: holed → complete; else OOB → +1 stroke and ball back to `shotOrigin`; then if `strokes >= MAX_STROKES_PER_HOLE` → complete as picked up; else prepare next shot.

- [ ] **Step 1: Write failing tests**

`tests/rules.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { isOutOfBounds, MAX_STROKES_PER_HOLE } from '../js/rules.js';

test('out of bounds is anything off the 200 x 1000 ground plane', () => {
    assert.equal(isOutOfBounds({ x: 0, z: 0 }), false);
    assert.equal(isOutOfBounds({ x: 99.9, z: -499.9 }), false);
    assert.equal(isOutOfBounds({ x: 100.1, z: 0 }), true);
    assert.equal(isOutOfBounds({ x: -100.1, z: 0 }), true);
    assert.equal(isOutOfBounds({ x: 0, z: -500.1 }), true);
    assert.equal(isOutOfBounds({ x: 0, z: 500.1 }), true);
    assert.equal(MAX_STROKES_PER_HOLE, 10);
});
```

`tests/gameStateRules.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import * as GameState from '../js/gameState.js';
import { eventBus } from '../js/events.js';
import { CONTROL_MODES } from '../js/shotControls/controlModes.js';

function makeVector(x = 0, y = 0.1, z = 0) {
    return { x, y, z, set(a, b, c) { this.x = a; this.y = b; this.z = c; } };
}

function setupGame() {
    const ball = { position: makeVector(), rotation: makeVector(0, 0, 0) };
    const arrow = { position: makeVector(0, 0.3, -1.5), rotation: makeVector(0, 0, 0), visible: true };
    GameState.initGameState({}, ball, arrow);
    GameState.setHoleData({ position: { x: 0, y: 0, z: -100 }, par: 4, distance: 200 });
    GameState.setControlMode(CONTROL_MODES.CLASSIC);
    return ball;
}

function capture(event) {
    const seen = [];
    const listener = data => seen.push(data);
    eventBus.on(event, listener);
    return { seen, stop: () => eventBus.off(event, listener) };
}

function shootAndLand(ball, landing) {
    GameState.setControlMode(CONTROL_MODES.TRACKBALL);
    assert.equal(GameState.takeShotFromIntent({ source: CONTROL_MODES.TRACKBALL, power: 0.4 }), true);
    let frames = 0;
    while (GameState.getGameState() === GameState.GameState.IN_FLIGHT && frames++ < 5000) {
        GameState.updateBallPhysics();
        if (landing) {
            ball.position.x = landing.x;
            ball.position.z = landing.z;
        }
    }
}

test('out of bounds costs a stroke and replays from where the shot was hit', () => {
    const ball = setupGame();
    GameState.loadBallSnapshot({ x: 5, y: 0.1, z: -20, strokes: 1 });
    const oob = capture('outOfBounds');

    shootAndLand(ball, { x: 150, z: -40 });
    oob.stop();

    assert.equal(oob.seen.length, 1);
    assert.deepEqual([ball.position.x, ball.position.z], [5, -20]);
    assert.deepEqual(GameState.getBallSnapshot(), { x: 5, y: 0.1, z: -20, strokes: 3, holed: false });
    assert.equal(GameState.getGameState(), GameState.GameState.AIMING);
});

test('reaching the stroke cap picks the ball up and completes the hole', () => {
    const ball = setupGame();
    GameState.loadBallSnapshot({ x: 0, y: 0.1, z: -50, strokes: 9 });
    const done = capture('holeComplete');

    shootAndLand(ball, { x: 0, z: -60 });
    done.stop();

    assert.equal(done.seen.length, 1);
    assert.equal(done.seen[0].strokes, 10);
    assert.equal(done.seen[0].pickedUp, true);
    assert.equal(done.seen[0].scoreName, 'Picked up');
});

test('an out-of-bounds shot that reaches the cap ends the hole at the cap', () => {
    const ball = setupGame();
    GameState.loadBallSnapshot({ x: 0, y: 0.1, z: -50, strokes: 8 });
    const done = capture('holeComplete');

    shootAndLand(ball, { x: 0, z: 600 });
    done.stop();

    assert.equal(done.seen.length, 1);
    assert.equal(done.seen[0].strokes, 10);
});

test('a holed ball reports the distance of the final shot, not distance from the tee', () => {
    const ball = setupGame();
    GameState.loadBallSnapshot({ x: 0, y: 0.1, z: -90, strokes: 2 });
    const done = capture('holeComplete');

    shootAndLand(ball, { x: 0, z: -100 });
    done.stop();

    assert.equal(done.seen[0].pickedUp, false);
    assert.equal(done.seen[0].shotInfo.distanceYards, 20);
});
```

Note: `shootAndLand` forces the ball's x/z every frame (height stays physics-driven so a holed ball can drop into the cup) so the outcome does not depend on physics tuning; the hole is at z = −100, so a forced landing at z = −100 is inside the 0.15 capture radius and counts as holed.

- [ ] **Step 2: Run to verify they fail** — `node --test tests/rules.test.mjs tests/gameStateRules.test.mjs`. Expected: FAIL (module missing / no `outOfBounds` event / no cap).

- [ ] **Step 3: Create `js/rules.js`**

```js
const MAX_STROKES_PER_HOLE = 10;

const COURSE_BOUNDS = Object.freeze({
    halfWidth: 100,
    minZ: -500,
    maxZ: 500
});

function isOutOfBounds({ x, z }) {
    return Math.abs(x) > COURSE_BOUNDS.halfWidth || z < COURSE_BOUNDS.minZ || z > COURSE_BOUNDS.maxZ;
}

export {
    MAX_STROKES_PER_HOLE,
    COURSE_BOUNDS,
    isOutOfBounds
};
```

- [ ] **Step 4: Update `js/gameState.js`**

Add imports:

```js
import { isOutOfBounds, MAX_STROKES_PER_HOLE } from './rules.js';
import { YARDS_TO_UNITS } from './physics.js';
```

(`BallPhysics` is already imported from `./physics.js`; merge into one import line: `import { BallPhysics, YARDS_TO_UNITS } from './physics.js';`.)

Add `shotOrigin: null,` to the `state` object.

In `takeShot`, immediately before `setGameState(GameState.IN_FLIGHT);`, add:

```js
    state.shotOrigin = {
        x: state.ball.position.x,
        y: state.ball.position.y,
        z: state.ball.position.z
    };
```

Replace `evaluateShot` with:

```js
function evaluateShot() {
    setGameState(GameState.EVALUATING);
    recordShotDistance();

    const distanceToHole = getDistanceToHole();
    if (state.ballPhysics.inHole || distanceToHole < 0.15) {
        state.ball.position.x = state.holeData.position.x;
        state.ball.position.z = state.holeData.position.z;
        state.ball.position.y = state.holeData.position.y - 0.05;

        logger.info("HOLE COMPLETE! Ball is in the hole.");
        completeHole();
        return;
    }

    if (isOutOfBounds(state.ball.position) && state.shotOrigin) {
        state.strokes++;
        state.ball.position.set(state.shotOrigin.x, state.shotOrigin.y, state.shotOrigin.z);
        eventBus.emit('outOfBounds', { strokes: state.strokes, fullState: getFullState() });
    }

    if (state.strokes >= MAX_STROKES_PER_HOLE) {
        state.strokes = MAX_STROKES_PER_HOLE;
        completeHole({ pickedUp: true });
        return;
    }

    prepareForNextShot();
}

function recordShotDistance() {
    if (!state.shotOrigin) return;

    const dx = state.ball.position.x - state.shotOrigin.x;
    const dz = state.ball.position.z - state.shotOrigin.z;
    state.shotInfo = {
        ...state.shotInfo,
        distanceYards: Math.round(Math.sqrt(dx * dx + dz * dz) / YARDS_TO_UNITS)
    };
}
```

Change `completeHole()` to `completeHole({ pickedUp = false } = {})`, compute `scoreName` as before but override when picked up, and include `pickedUp` in the event:

```js
    let scoreName;
    if (pickedUp) scoreName = "Picked up";
    else if (relativeToPar <= -3) scoreName = "Albatross";
    else if (relativeToPar === -2) scoreName = "Eagle";
    else if (relativeToPar === -1) scoreName = "Birdie";
    else if (relativeToPar === 0) scoreName = "Par";
    else if (relativeToPar === 1) scoreName = "Bogey";
    else if (relativeToPar === 2) scoreName = "Double Bogey";
    else scoreName = "Triple+ Bogey";
```

and add `pickedUp,` to the `eventBus.emit('holeComplete', { ... })` payload. Keep everything else in `completeHole` unchanged.

Note: a picked-up ball must NOT be moved to the hole; `getBallSnapshot().holed` is `true` (state COMPLETE), which is what `HostSession`/`TurnManager` expect for a finished player.

- [ ] **Step 5: Update `js/gameManager.js`**

In `registerGameStateCallbacks`, add:

```js
        eventBus.on('outOfBounds', (data) => {
            UI.showTemporaryMessage(`Out of bounds! Penalty stroke — now playing ${data.strokes + 1}.`);
        });
```

In `handleHoleComplete(...)`, replace the `shotDistance`/`distanceYards` computation with:

```js
        const distanceYards = shotInfo.distanceYards ?? 0;
```

and keep the rest (the `UI.resultsPanel.displayResults(...)` call uses `distanceYards`). Remove the now-unused `Physics` import only if nothing else in the file uses it (it is still used by `handleShotComplete` — keep it).

- [ ] **Step 6: Run tests** — `node --test tests/rules.test.mjs tests/gameStateRules.test.mjs`, then `npm test`. Expected: all pass (including `tests/net/HostSession.test.mjs` and `tests/gameStateSnapshots.test.mjs`).

- [ ] **Step 7: Commit**

```bash
git add js/rules.js js/gameState.js js/gameManager.js tests/rules.test.mjs tests/gameStateRules.test.mjs
git commit -m "feat(rules): out-of-bounds penalty, 10-stroke pickup, real shot distance"
```

---

### Task 4: Round end, new round, and tee height

**Files:**
- Modify: `js/gameState.js` (`nextHole`, `resetGame`, new `isRoundComplete`)
- Modify: `js/gameManager.js` (`nextHoleButtonClicked` handler, new `showRoundSummary`)
- Modify: `js/ui/Scorecard.js` (`updateScoreCard` button label)
- Modify: `js/net/HostSession.js` (`TEE_POSITION`)
- Test: `tests/gameStateRoundEnd.test.mjs`

**Interfaces:**
- Produces: `GameState.isRoundComplete() → bool` (true when the current hole is the last hole and it is complete); `GameState.TEE_BALL_POSITION = { x: 0, y: 0.1, z: 0 }` (frozen) used by `nextHole`/`resetGame`. `Scorecard.updateScoreCard(scoreCard, totalHoles = 9)` labels the button `FINISH ROUND` when `scoreCard.length >= totalHoles`.
- GameManager behaviour: clicking the results button after the last hole shows a round summary in the results panel (`Round complete! N strokes (±P)`) and relabels the button `NEW ROUND`; clicking again calls `GameState.resetGame()` and `this.generateNewHole()`.

- [ ] **Step 1: Write the failing test** — `tests/gameStateRoundEnd.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import * as GameState from '../js/gameState.js';
import { CONTROL_MODES } from '../js/shotControls/controlModes.js';

function makeVector(x = 0, y = 0.1, z = 0) {
    return { x, y, z, set(a, b, c) { this.x = a; this.y = b; this.z = c; } };
}

function setupGame() {
    const ball = { position: makeVector(), rotation: makeVector(0, 0, 0) };
    const arrow = { position: makeVector(0, 0.3, -1.5), rotation: makeVector(0, 0, 0), visible: true };
    GameState.initGameState({}, ball, arrow);
    GameState.resetGame();
    return ball;
}

function holeOut(ball) {
    GameState.setHoleData({ position: { x: 0, y: 0, z: -10 }, par: 3, distance: 20 });
    GameState.setControlMode(CONTROL_MODES.TRACKBALL);
    GameState.takeShotFromIntent({ source: CONTROL_MODES.TRACKBALL, power: 0.1 });
    let frames = 0;
    while (GameState.getGameState() === GameState.GameState.IN_FLIGHT && frames++ < 5000) {
        GameState.updateBallPhysics();
        ball.position.x = 0;
        ball.position.z = -10;
    }
}

test('the round is complete only after the last hole is finished', () => {
    const ball = setupGame();
    for (let hole = 1; hole <= 9; hole++) {
        holeOut(ball);
        assert.equal(GameState.getGameState(), GameState.GameState.COMPLETE);
        assert.equal(GameState.isRoundComplete(), hole === 9);
        if (hole < 9) assert.equal(GameState.nextHole(), true);
    }
    assert.equal(GameState.nextHole(), false);
    assert.equal(GameState.getScoreCard().length, 9);
});

test('resetGame starts a fresh round with the ball resting on the tee', () => {
    const ball = setupGame();
    holeOut(ball);
    GameState.resetGame();
    assert.equal(GameState.getScoreCard().length, 0);
    assert.equal(GameState.isRoundComplete(), false);
    assert.deepEqual([ball.position.x, ball.position.y, ball.position.z], [0, 0.1, 0]);
    assert.deepEqual(GameState.TEE_BALL_POSITION, { x: 0, y: 0.1, z: 0 });
});
```

- [ ] **Step 2: Run to verify it fails** — `node --test tests/gameStateRoundEnd.test.mjs`. Expected: FAIL (`isRoundComplete` not a function).

- [ ] **Step 3: Implement in `js/gameState.js`**

Add near the top (after `GameState`):

```js
const TEE_BALL_POSITION = Object.freeze({ x: 0, y: 0.1, z: 0 });
```

In both `nextHole()` and `resetGame()` replace `state.ball.position.set(0, 0.2, 0);` with:

```js
        state.ball.position.set(TEE_BALL_POSITION.x, TEE_BALL_POSITION.y, TEE_BALL_POSITION.z);
```

In `resetGame()` also reset `state.strokes = 0;` and `state.shotOrigin = null;` (keep everything else).

Add:

```js
function isRoundComplete() {
    return state.currentHole === state.totalHoles && state.gameState === GameState.COMPLETE;
}
```

Export `isRoundComplete` and `TEE_BALL_POSITION`.

- [ ] **Step 4: Scorecard label** — in `js/ui/Scorecard.js` change the signature to `updateScoreCard(scoreCard, totalHoles = 9)` and the label check to `if (scoreCard.length >= totalHoles) {`.

- [ ] **Step 5: GameManager round flow** — in `js/gameManager.js` add `this.roundSummaryShown = false;` to the constructor, and replace the `nextHoleButtonClicked` handler with:

```js
        eventBus.on('nextHoleButtonClicked', () => {
            if (!acceptsLocalInput()) return;
            if (this.roundSummaryShown) {
                this.roundSummaryShown = false;
                UI.resultsPanel.hide();
                GameState.resetGame();
                this.generateNewHole();
                return;
            }
            if (GameState.isRoundComplete()) {
                this.showRoundSummary();
                return;
            }
            if (GameState.nextHole()) {
                this.generateNewHole();
            }
        });
```

Add the method:

```js
    showRoundSummary() {
        const scoreCard = GameState.getScoreCard();
        const strokes = scoreCard.reduce((sum, hole) => sum + hole.strokes, 0);
        const toPar = scoreCard.reduce((sum, hole) => sum + hole.toPar, 0);
        const toParText = toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : String(toPar);

        UI.resultsPanel.displayRoundSummary(`Round complete! ${strokes} strokes (${toParText})`);
        this.roundSummaryShown = true;
    }
```

In `js/ui/ResultsPanel.js` add:

```js
    displayRoundSummary(summaryText) {
        if (!this.resultsEl || !this.resultTextEl || !this.shotInfoEl) return;

        this.resultTextEl.textContent = summaryText;
        this.shotInfoEl.replaceChildren();
        const nextButton = document.getElementById('next-hole-btn');
        if (nextButton) {
            nextButton.textContent = 'NEW ROUND';
            nextButton.style.display = 'block';
        }
        this.resultsEl.style.display = 'block';
    }
```

Check `js/ui/GameButtons.js` — if clicking the next-hole button hides the results panel before emitting, the summary must still show: `showRoundSummary` runs after that hide, so it re-shows the panel. Verify by reading the click handler; adjust only if it emits before hiding in a way that hides the summary afterwards.

- [ ] **Step 6: HostSession tee** — in `js/net/HostSession.js` change `const TEE_POSITION = Object.freeze({ x: 0, y: 0.2, z: 0 });` to `y: 0.1`. If a HostSession test asserts `0.2`, update it to `0.1`.

- [ ] **Step 7: Run tests** — `node --test tests/gameStateRoundEnd.test.mjs`, then `npm test`. Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add js/gameState.js js/gameManager.js js/ui/Scorecard.js js/ui/ResultsPanel.js js/net/HostSession.js tests/gameStateRoundEnd.test.mjs tests/net/HostSession.test.mjs
git commit -m "feat(round): finish-round summary, new round, tee ball at rest height"
```

---

### Task 5: Shadow light follows the ball

**Files:**
- Create: `js/lighting.js`
- Modify: `js/main.js` (keep a reference to the directional light, add its target to the scene, pass it to `GameManager`)
- Modify: `js/gameManager.js` (constructor param `shadowLight`, call in `animate`)
- Test: `tests/lighting.test.mjs`

**Interfaces:**
- Produces: `followShadowLight(light, position)` — sets `light.position` to `(x + 10, 20, z + 10)`, sets `light.target.position` to `(x, 0, z)`, and calls `light.target.updateMatrixWorld()`. `GameManager` constructor becomes `(scene, camera, renderer, ball, directionArrow, shadowLight = null)`.

- [ ] **Step 1: Write the failing test** — `tests/lighting.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { followShadowLight } from '../js/lighting.js';

function vec() {
    return { x: 0, y: 0, z: 0, set(a, b, c) { this.x = a; this.y = b; this.z = c; } };
}

test('shadow light keeps the same offset above the ball', () => {
    let updated = 0;
    const light = { position: vec(), target: { position: vec(), updateMatrixWorld: () => updated++ } };

    followShadowLight(light, { x: 5, y: 0.1, z: -300 });

    assert.deepEqual([light.position.x, light.position.y, light.position.z], [15, 20, -290]);
    assert.deepEqual([light.target.position.x, light.target.position.y, light.target.position.z], [5, 0, -300]);
    assert.equal(updated, 1);
});

test('a missing light is ignored', () => {
    assert.doesNotThrow(() => followShadowLight(null, { x: 0, y: 0, z: 0 }));
});
```

- [ ] **Step 2: Run to verify it fails** — `node --test tests/lighting.test.mjs`. Expected: FAIL, module not found.

- [ ] **Step 3: Create `js/lighting.js`**

```js
const LIGHT_OFFSET = Object.freeze({ x: 10, y: 20, z: 10 });

function followShadowLight(light, position) {
    if (!light) return;

    light.position.set(position.x + LIGHT_OFFSET.x, LIGHT_OFFSET.y, position.z + LIGHT_OFFSET.z);
    light.target.position.set(position.x, 0, position.z);
    light.target.updateMatrixWorld();
}

export { followShadowLight };
```

- [ ] **Step 4: Wire it**

`js/main.js`: add `let shadowLight;` with the other module variables; in `addLights()` assign `shadowLight = directionalLight;` and after `scene.add(directionalLight);` add `scene.add(directionalLight.target);`. In `init()` pass it: `new GameManager(scene, camera, renderer, ball, directionArrow, shadowLight)`.

`js/gameManager.js`: import `{ followShadowLight } from './lighting.js'`; constructor accepts `shadowLight = null` and stores `this.shadowLight = shadowLight;`. In `animate()`, before `this.renderer.render(...)`, add `followShadowLight(this.shadowLight, this.ball.position);`.

- [ ] **Step 5: Run tests** — `node --test tests/lighting.test.mjs`, `node --check js/main.js`, `npm test`. Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add js/lighting.js js/main.js js/gameManager.js tests/lighting.test.mjs
git commit -m "fix(render): keep the shadow camera centred on the ball"
```

---

### Task 6: Stop per-frame UI rebuilds and log spam during flight

**Files:**
- Modify: `js/gameState.js` (`updateBallPhysics`)
- Modify: `js/gameManager.js` (`registerGameStateCallbacks`, `handleStateChange`)
- Test: `tests/flightEvents.test.mjs`

**Interfaces:**
- Produces: event `ballMoved { distanceToHole }` emitted once per physics frame while the ball is moving. `gameStateChanged` is emitted only by `setGameState` (real transitions) and by one-off `updateInfo()` calls outside the per-frame path. GameManager updates the status text from `ballMoved`; `handleStateChange` logs only when `oldState !== newState`.

- [ ] **Step 1: Write the failing test** — `tests/flightEvents.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import * as GameState from '../js/gameState.js';
import { eventBus } from '../js/events.js';
import { CONTROL_MODES } from '../js/shotControls/controlModes.js';

function makeVector(x = 0, y = 0.1, z = 0) {
    return { x, y, z, set(a, b, c) { this.x = a; this.y = b; this.z = c; } };
}

test('a flight emits ballMoved per frame but gameStateChanged only on transitions', () => {
    const ball = { position: makeVector(), rotation: makeVector(0, 0, 0) };
    const arrow = { position: makeVector(0, 0.3, -1.5), rotation: makeVector(0, 0, 0), visible: true };
    GameState.initGameState({}, ball, arrow);
    GameState.setHoleData({ position: { x: 0, y: 0, z: -100 }, par: 4, distance: 200 });
    GameState.setControlMode(CONTROL_MODES.TRACKBALL);

    let stateEvents = 0;
    let moveEvents = 0;
    const onState = () => stateEvents++;
    const onMove = data => {
        moveEvents++;
        assert.equal(typeof data.distanceToHole, 'number');
    };
    eventBus.on('gameStateChanged', onState);
    eventBus.on('ballMoved', onMove);

    GameState.takeShotFromIntent({ source: CONTROL_MODES.TRACKBALL, power: 0.5 });
    let frames = 0;
    while (GameState.getGameState() === GameState.GameState.IN_FLIGHT && frames++ < 5000) {
        GameState.updateBallPhysics();
    }

    eventBus.off('gameStateChanged', onState);
    eventBus.off('ballMoved', onMove);

    assert.ok(frames > 20);
    assert.equal(moveEvents, frames);
    assert.ok(stateEvents <= 5, `expected only transition events, got ${stateEvents}`);
});
```

- [ ] **Step 2: Run to verify it fails** — `node --test tests/flightEvents.test.mjs`. Expected: FAIL (`moveEvents` is 0 and `stateEvents` ≈ frames).

- [ ] **Step 3: Implement**

In `js/gameState.js` `updateBallPhysics()`, replace the trailing

```js
    // Update UI information with current distance
    updateInfo();
```

with:

```js
    eventBus.emit('ballMoved', { distanceToHole: getDistanceToHole() });
```

In `js/gameManager.js` `registerGameStateCallbacks()`, add:

```js
        eventBus.on('ballMoved', ({ distanceToHole }) => {
            const distanceYards = Math.round(distanceToHole / Physics.YARDS_TO_UNITS);
            UI.gameInfo.updateStatusText(`Distance to hole: ${distanceYards} yards`);
        });
```

and change `handleStateChange` to:

```js
    handleStateChange(oldState, newState) {
        if (oldState === newState) return;
        logger.info(`Game state changed from ${oldState} to ${newState}`);
    }
```

- [ ] **Step 4: Run tests** — `node --test tests/flightEvents.test.mjs`, then `npm test`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add js/gameState.js js/gameManager.js tests/flightEvents.test.mjs
git commit -m "perf(flight): emit lightweight ballMoved instead of full UI refresh per frame"
```

---

### Task 7: Trackball renders only while visible

**Files:**
- Modify: `js/ui/TrackballControl.js` (constructor, `animate`, `show`, `hide`)
- Test: `tests/ui/TrackballRenderLoop.test.mjs`

**Interfaces:**
- Produces: `this.animationFrame = null` field; `startLoop()` starts one rAF loop if none is running; `stopLoop()` cancels it. Constructor no longer starts the loop. `show()` calls `startLoop()`; `hide()` calls `stopLoop()` (and still resets).

- [ ] **Step 1: Write the failing test** — `tests/ui/TrackballRenderLoop.test.mjs`

This test loads the class with stubbed browser globals and an absent canvas host (so `initScene` returns early and no WebGL is needed).

```js
import test from 'node:test';
import assert from 'node:assert/strict';

const frames = new Map();
let nextId = 1;
globalThis.window = { devicePixelRatio: 1, setTimeout, clearTimeout };
globalThis.performance ??= { now: () => Date.now() };
globalThis.requestAnimationFrame = (fn) => { const id = nextId++; frames.set(id, fn); return id; };
globalThis.cancelAnimationFrame = (id) => { frames.delete(id); };
const container = { style: {}, addEventListener() {} };
globalThis.document = { getElementById: id => (id === 'trackball-control' ? container : null) };

const { TrackballControl } = await import('../../js/ui/TrackballControl.js');

function runFrame() {
    const [id, fn] = frames.entries().next().value;
    frames.delete(id);
    fn();
}

test('no render loop runs until the control is shown', () => {
    frames.clear();
    new TrackballControl('trackball-control', 'trackball-canvas', 'trackball-power-preview');
    assert.equal(frames.size, 0);
});

test('show starts exactly one loop and hide stops it', () => {
    frames.clear();
    const control = new TrackballControl('trackball-control', 'trackball-canvas', 'trackball-power-preview');

    control.show();
    control.show();
    assert.equal(frames.size, 1);

    runFrame();
    assert.equal(frames.size, 1);

    control.hide();
    assert.equal(frames.size, 0);
});
```

- [ ] **Step 2: Run to verify it fails** — `node --test tests/ui/TrackballRenderLoop.test.mjs`. Expected: FAIL (a frame is queued by the constructor; `show()` twice may queue two).

- [ ] **Step 3: Implement** — in `js/ui/TrackballControl.js`:

- In the constructor, add `this.animationFrame = null;` and delete the `this.animate();` call.
- Replace `animate()` with:

```js
    animate() {
        this.animationFrame = requestAnimationFrame(() => this.animate());
        this.updateVisualPhysics();
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    startLoop() {
        if (this.animationFrame !== null) return;
        this.lastFrameTime = performance.now();
        this.animate();
    }

    stopLoop() {
        if (this.animationFrame === null) return;
        cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
    }
```

- `show()`: after setting display, call `this.startLoop();`.
- `hide()`: call `this.stopLoop();` before `this.reset();`.

The existing `tests/ui/TrackballControlUI.test.mjs` source assertions (`updateVisualPhysics()`, `show()`, `hide()`, `reset()`) must still match.

- [ ] **Step 4: Run tests** — `node --test tests/ui/TrackballRenderLoop.test.mjs tests/ui/TrackballControlUI.test.mjs`, then `npm test`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add js/ui/TrackballControl.js tests/ui/TrackballRenderLoop.test.mjs
git commit -m "perf(trackball): run the render loop only while the control is visible"
```

---

### Task 8: Release GPU resources between holes; share decor resources

**Files:**
- Create: `js/utils/dispose.js`
- Modify: `js/course.js` (`createHole`, `createTree`, `createBunker`, `clearDecorativeElements`, `clearCourse`)
- Test: `tests/utils/dispose.test.mjs`, `tests/courseResources.test.mjs`

**Interfaces:**
- Produces: `disposeObject(scene, object, shared = new Set())` — removes `object` from `scene`, then disposes `object.geometry` and each material (array or single) unless that geometry/material is in `shared`. Course: trees share one trunk geometry, one trunk material, one foliage geometry, one foliage material; bunkers share one unit `CircleGeometry(1, 32)` (scaled per bunker via `bunker.scale.set(size, size, 1)`) and one material. These shared resources are created lazily once and are never disposed. Per-hole meshes (hole, green, flagpole, flag) are disposed when replaced.

- [ ] **Step 1: Write failing tests**

`tests/utils/dispose.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { disposeObject } from '../../js/utils/dispose.js';

function resource() {
    return { disposed: 0, dispose() { this.disposed++; } };
}

test('disposeObject removes the mesh and frees its own geometry and materials', () => {
    const removed = [];
    const scene = { remove: object => removed.push(object) };
    const mesh = { geometry: resource(), material: [resource(), resource()] };

    disposeObject(scene, mesh);

    assert.deepEqual(removed, [mesh]);
    assert.equal(mesh.geometry.disposed, 1);
    assert.deepEqual(mesh.material.map(m => m.disposed), [1, 1]);
});

test('shared geometry and materials are left alone', () => {
    const scene = { remove() {} };
    const sharedGeometry = resource();
    const sharedMaterial = resource();
    const mesh = { geometry: sharedGeometry, material: sharedMaterial };

    disposeObject(scene, mesh, new Set([sharedGeometry, sharedMaterial]));

    assert.equal(sharedGeometry.disposed, 0);
    assert.equal(sharedMaterial.disposed, 0);
});

test('null objects are ignored', () => {
    assert.doesNotThrow(() => disposeObject({ remove() {} }, null));
});
```

`tests/courseResources.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import * as Course from '../js/course.js';

function trackingScene() {
    const objects = new Set();
    return {
        objects,
        add(object) { objects.add(object); },
        remove(object) { objects.delete(object); }
    };
}

function disposedFlag(resource) {
    const state = { disposed: false };
    resource.addEventListener('dispose', () => { state.disposed = true; });
    return state;
}

test('replacing a hole frees the old hole meshes but keeps shared decor resources', () => {
    const scene = trackingScene();
    Course.initCourse(scene);
    Course.generateNewHole();

    const first = [...scene.objects];
    const treeMeshes = first.filter(o => o.geometry?.type === 'ConeGeometry');
    assert.ok(treeMeshes.length > 1);
    assert.ok(treeMeshes.every(o => o.geometry === treeMeshes[0].geometry));

    const uniqueGeometries = first
        .filter(o => ['CylinderGeometry', 'PlaneGeometry'].includes(o.geometry?.type) && o.geometry.parameters?.radiusTop !== 0.2)
        .map(o => ({ o, flag: disposedFlag(o.geometry) }));
    const sharedFlag = disposedFlag(treeMeshes[0].geometry);

    Course.generateNewHole();

    assert.ok(uniqueGeometries.length >= 3);
    assert.ok(uniqueGeometries.every(({ flag }) => flag.disposed));
    assert.equal(sharedFlag.disposed, false);
    assert.ok(uniqueGeometries.every(({ o }) => !scene.objects.has(o)));
});
```

Notes for the implementer: in `course.js`, the hole is a `CylinderGeometry` (radius 0.1875), the flagpole a `CylinderGeometry` (radius 0.03), the flag a `PlaneGeometry`, the green a `CircleGeometry`; trunks are `CylinderGeometry` with radius `TRUNK_RADIUS = 0.2` (excluded via `radiusTop !== 0.2`), foliage is `ConeGeometry`. `generateNewHole()` works without `createBasicCourse()` (no hills → height 0). If the filter in this test proves wrong for the actual geometry types, fix the test's filter to select exactly hole + flagpole + flag (+ green), keep the assertions, and say so in the report.

- [ ] **Step 2: Run to verify they fail** — `node --test tests/utils/dispose.test.mjs tests/courseResources.test.mjs`. Expected: FAIL (module missing; trees don't share geometry; old geometries not disposed).

- [ ] **Step 3: Create `js/utils/dispose.js`**

```js
function disposeResource(resource, shared) {
    if (resource && !shared.has(resource) && typeof resource.dispose === 'function') {
        resource.dispose();
    }
}

function disposeObject(scene, object, shared = new Set()) {
    if (!object) return;

    scene.remove(object);
    disposeResource(object.geometry, shared);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material => disposeResource(material, shared));
}

export { disposeObject };
```

- [ ] **Step 4: Update `js/course.js`**

Import: `import { disposeObject } from './utils/dispose.js';`

Add lazily created shared resources:

```js
let sharedDecor = null;

function getSharedDecor() {
    if (!sharedDecor) {
        sharedDecor = {
            trunkGeometry: new THREE.CylinderGeometry(TRUNK_RADIUS, TRUNK_RADIUS, TRUNK_HEIGHT, TRUNK_SEGMENTS),
            trunkMaterial: new THREE.MeshStandardMaterial({ color: TRUNK_COLOR }),
            foliageGeometry: new THREE.ConeGeometry(FOLIAGE_RADIUS, FOLIAGE_HEIGHT, FOLIAGE_SEGMENTS),
            foliageMaterial: new THREE.MeshStandardMaterial({ color: FOLIAGE_COLOR }),
            bunkerGeometry: new THREE.CircleGeometry(1, 32),
            bunkerMaterial: new THREE.MeshStandardMaterial({ color: BUNKER_COLOR })
        };
    }
    return sharedDecor;
}
```

`createTree(x, z)`: build `trunk`/`foliage` meshes from `getSharedDecor()`'s geometry/material instead of `new` ones (positions/shadows unchanged).

`createBunker(x, z, size)`: `new THREE.Mesh(decor.bunkerGeometry, decor.bunkerMaterial)`, keep rotation/position, add `bunker.scale.set(size, size, 1);`.

`clearDecorativeElements()`: replace the `scene.remove(...)` calls with `scene.remove(...)` only (shared resources must not be disposed) — i.e. leave them as removal, which is already the case; no change needed beyond confirming nothing disposes shared resources.

`createHole(...)`: replace

```js
    if (hole) scene.remove(hole);
    if (flagpole) scene.remove(flagpole);
    if (flag) scene.remove(flag);
    if (green) scene.remove(green);
```

with

```js
    [hole, flagpole, flag, green].forEach(object => disposeObject(scene, object));
```

`clearCourse()`: replace the hole-element and ground `scene.remove` lines with `[hole, flagpole, flag, green, ground].forEach(object => disposeObject(scene, object));` (keep the null assignments).

- [ ] **Step 5: Run tests** — `node --test tests/utils/dispose.test.mjs tests/courseResources.test.mjs`, then `npm test`. Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add js/utils/dispose.js js/course.js tests/utils/dispose.test.mjs tests/courseResources.test.mjs
git commit -m "perf(course): dispose replaced hole meshes and share tree/bunker resources"
```
