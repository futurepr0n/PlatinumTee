# Ball Flight Realism Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real hook/slice/backspin ball flight with Golden Tee–style forgiveness, wind that clearly varies hole to hole (and gusts shot to shot) at realistic strength, and surface-aware landings (green, bunker, fairway).

**Architecture:** Pure helpers in new modules (`js/wind.js`, `js/shotShape.js`) plus targeted changes to `BallPhysics`. Spin is passed into `BallPhysics` through a new optional `spin` argument; existing call sites keep working. Course exposes `getSurfaceAt(x, z)` through `getTerrainData()` so physics can pick friction/bounce per surface.

**Tech Stack:** Vanilla ES modules, Three.js (Node-importable for tests), `node:test`.

**Spec:** User request 2026-10-08: "more realistic behaviour, wind should differ hole to hole, real curve should be built", plus earlier: "curl after landing should not be so aggressive … forgiveness like Golden Tee trackball". Physics remain per-frame (fixed-step refactor is a separate plan).

## Global Constraints

- Coordinate convention: forward is −z, right is +x; `direction` degrees positive = right. Positive curve/sidespin = ball bends right (fade/slice for a right-hander); negative = left (draw/hook).
- Forgiveness: a straight swipe (no deliberate side angle) must produce zero curve; small deliberate angles produce gentle curve; only large angles produce big hooks/slices.
- After landing the ball rolls along its landing heading (no further hooking); sidespin may add at most a small one-time kick on first landing.
- Putter: no wind, no spin effects, unchanged putting behaviour.
- All existing tests keep passing unless this plan explicitly replaces an assertion (each replacement is listed in its task).
- No new dependencies; 4-space indent; no new comments.

## Review Focus

1. **Classic meter shots (curve 0)** must fly exactly as straight as before in calm air. Test in Task 3.
2. **Multiplayer:** phone intents already carry `curve`/`spin`; `HostSession` rewrites only `source`, so curve must reach physics in host mode too. Test in Task 4.
3. **Wind display vs. physics:** the HUD shows the hole's base wind; gusts are per shot and must be recorded in `shotInfo.wind` so results can explain a drift. Test in Task 1.
4. **Huge curve values** (curve = ±1 with a driver) must not curve the ball out of the 200-wide course from the middle of the fairway on a full drive. Test in Task 3.
5. **Bunker landing** must stop the ball quickly but never "stick" it in mid-air or make it bounce out higher. Test in Task 5.

---

## File Structure

| File | Change |
|---|---|
| `js/wind.js` (new) | `rollHoleWind`, `gustWind`, `WIND_LIMITS` |
| `js/gameState.js` | Use `rollHoleWind` per hole (distinct from previous), gust per shot, pass spin to physics, `shotInfo.wind`, `shotInfo.shape` |
| `js/physics.js` | Loft-scaled weaker wind; sidespin bend in flight; backspin on landing; heading-based roll damping; surface-aware ground contact |
| `js/shotShape.js` (new) | `describeShotShape(curve)` → `'Straight'|'Fade'|'Slice'|'Draw'|'Hook'`; `backspinForClub(club, spinInput)` |
| `js/shotControls/TrackballGesture.js` | Side angle → mostly curve (forgiving response), small start-line offset |
| `js/course.js` | Track bunker radii; `getSurfaceAt(x, z)`; include it in `getTerrainData()` |
| `js/ui/ResultsPanel.js` | Show shot shape and wind of the shot |
| tests | listed per task |

---

### Task 1: Wind that changes every hole and gusts every shot

**Files:**
- Create: `js/wind.js`
- Modify: `js/gameState.js` (`generateWind`, `takeShot`, state)
- Test: `tests/wind.test.mjs`, `tests/gameStateWind.test.mjs`

**Interfaces:**
- Produces: `WIND_LIMITS = { maxSpeed: 20, gustSpeedFraction: 0.25, gustDirectionDegrees: 15 }`; `rollHoleWind(previous = null, random = Math.random) → { direction, speed }` — integer direction 0–359 and integer speed 0–20, drawn with 25 % calm (0–3), 45 % breezy (4–11), 30 % windy (12–20); if `previous` is given, re-roll (up to 10 times) until `|Δdirection| ≥ 45°` (circular) or `|Δspeed| ≥ 5`. `gustWind(base, random = Math.random) → { direction, speed }` — speed × (1 ± 0.25), direction ± 15°, speed rounded to 1 decimal, never negative, direction normalised to 0–359.
- `gameState`: `generateWind()` uses `rollHoleWind(previousWind)`; `takeShot` builds physics wind from `gustWind(state.windData)` and stores it as `state.shotInfo.wind = { direction, speed }`.

- [ ] **Step 1: Write the failing tests**

`tests/wind.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { rollHoleWind, gustWind, WIND_LIMITS } from '../js/wind.js';

function sequence(values) {
    let index = 0;
    return () => values[index++ % values.length];
}

test('hole wind stays inside limits and covers calm, breezy and windy', () => {
    const speeds = [];
    for (let i = 0; i < 2000; i++) {
        const wind = rollHoleWind();
        assert.ok(Number.isInteger(wind.direction) && wind.direction >= 0 && wind.direction < 360);
        assert.ok(Number.isInteger(wind.speed) && wind.speed >= 0 && wind.speed <= WIND_LIMITS.maxSpeed);
        speeds.push(wind.speed);
    }
    assert.ok(speeds.some(s => s <= 3));
    assert.ok(speeds.some(s => s >= 4 && s <= 11));
    assert.ok(speeds.some(s => s >= 12));
});

test('consecutive holes get noticeably different wind', () => {
    let previous = rollHoleWind();
    for (let i = 0; i < 500; i++) {
        const next = rollHoleWind(previous);
        const turn = Math.abs(((next.direction - previous.direction + 540) % 360) - 180);
        assert.ok(turn >= 45 || Math.abs(next.speed - previous.speed) >= 5, JSON.stringify({ previous, next }));
        previous = next;
    }
});

test('gusts vary speed by at most 25 % and direction by at most 15 degrees', () => {
    const base = { direction: 350, speed: 12 };
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
        const gust = gustWind(base, sequence([r, r]));
        assert.ok(gust.speed >= 9 && gust.speed <= 15, `speed ${gust.speed}`);
        const turn = Math.abs(((gust.direction - base.direction + 540) % 360) - 180);
        assert.ok(turn <= 15, `turn ${turn}`);
        assert.ok(gust.direction >= 0 && gust.direction < 360);
    }
    assert.deepEqual(gustWind({ direction: 90, speed: 0 }, sequence([0.9, 0.9])).speed, 0);
});
```

`tests/gameStateWind.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import * as GameState from '../js/gameState.js';
import { eventBus } from '../js/events.js';
import { CONTROL_MODES } from '../js/shotControls/controlModes.js';

function makeVector(x = 0, y = 0.1, z = 0) {
    return { x, y, z, set(a, b, c) { this.x = a; this.y = b; this.z = c; } };
}

test('each new hole announces a different wind and each shot records its gust', () => {
    const ball = { position: makeVector(), rotation: makeVector(0, 0, 0) };
    const arrow = { position: makeVector(0, 0.3, -1.5), rotation: makeVector(0, 0, 0), visible: true };
    const winds = [];
    const listener = data => winds.push({ ...data.windData });
    eventBus.on('windDataUpdated', listener);

    GameState.initGameState({}, ball, arrow);
    GameState.generateWind();
    GameState.generateWind();
    eventBus.off('windDataUpdated', listener);

    const [a, b] = winds.slice(-2);
    const turn = Math.abs(((b.direction - a.direction + 540) % 360) - 180);
    assert.ok(turn >= 45 || Math.abs(b.speed - a.speed) >= 5);

    GameState.setHoleData({ position: { x: 0, y: 0, z: -100 }, par: 4, distance: 200 });
    GameState.setControlMode(CONTROL_MODES.TRACKBALL);
    GameState.takeShotFromIntent({ source: CONTROL_MODES.TRACKBALL, power: 0.5 });
    const shotWind = GameState.getShotInfo().wind;
    assert.equal(typeof shotWind.speed, 'number');
    assert.ok(Math.abs(shotWind.speed - b.speed) <= b.speed * 0.25 + 0.05);
});
```

- [ ] **Step 2: Run to verify they fail** — `node --test tests/wind.test.mjs tests/gameStateWind.test.mjs`. Expected: FAIL (module missing; no `shotInfo.wind`).

- [ ] **Step 3: Create `js/wind.js`**

```js
const WIND_LIMITS = Object.freeze({
    maxSpeed: 20,
    gustSpeedFraction: 0.25,
    gustDirectionDegrees: 15
});

function rollSpeed(random) {
    const band = random();
    const within = random();
    if (band < 0.25) return Math.floor(within * 4);
    if (band < 0.7) return 4 + Math.floor(within * 8);
    return 12 + Math.floor(within * (WIND_LIMITS.maxSpeed - 11));
}

function directionDelta(a, b) {
    return Math.abs(((b - a + 540) % 360) - 180);
}

function rollOnce(random) {
    return {
        direction: Math.floor(random() * 360) % 360,
        speed: Math.min(WIND_LIMITS.maxSpeed, rollSpeed(random))
    };
}

function rollHoleWind(previous = null, random = Math.random) {
    let wind = rollOnce(random);
    if (!previous) return wind;

    for (let attempt = 0; attempt < 10; attempt++) {
        const different = directionDelta(previous.direction, wind.direction) >= 45 ||
            Math.abs(previous.speed - wind.speed) >= 5;
        if (different) return wind;
        wind = rollOnce(random);
    }
    return { direction: (previous.direction + 90 + Math.floor(random() * 180)) % 360, speed: wind.speed };
}

function gustWind(base, random = Math.random) {
    const speedFactor = 1 + (random() * 2 - 1) * WIND_LIMITS.gustSpeedFraction;
    const turn = (random() * 2 - 1) * WIND_LIMITS.gustDirectionDegrees;
    return {
        direction: Math.round(((base.direction + turn) % 360 + 360) % 360) % 360,
        speed: Math.max(0, Math.round(base.speed * speedFactor * 10) / 10)
    };
}

export { WIND_LIMITS, rollHoleWind, gustWind };
```

- [ ] **Step 4: Wire into `js/gameState.js`**

Import: `import { rollHoleWind, gustWind } from './wind.js';`

Replace the body of `generateWind()`:

```js
function generateWind() {
    const previous = state.windInitialized ? { ...state.windData } : null;
    state.windData = rollHoleWind(previous);
    state.windInitialized = true;

    eventBus.emit('windDataUpdated', { windData: state.windData, fullState: getFullState() });
}
```

Add `windInitialized: false,` to the `state` object.

In `takeShot`, compute `const shotWind = gustWind(state.windData);` before creating `BallPhysics`, pass `shotWind` as the physics wind argument (replacing the `{ direction: state.windData.direction, speed: state.windData.speed }` literal), and add `wind: shotWind` to the `state.shotInfo` object.

- [ ] **Step 5: Run tests** — focused files, then `npm test`. Expected: all pass.

- [ ] **Step 6: Commit** — `git commit -m "feat(wind): distinct wind each hole with per-shot gusts"`

---

### Task 2: Realistic wind strength, scaled by loft

**Files:**
- Modify: `js/physics.js` (wind block, constants)
- Test: `tests/physicsWind.test.mjs` (append)

**Interfaces:**
- Produces: `WIND_EFFECT_MULTIPLIER` lowered to `0.00008`; wind acceleration multiplied by `windExposure = 0.5 + this.club.height` (driver 1.3, sand wedge 0.85). Headwind/tailwind use the same vector (already) so they change carry.

Target behaviour (driver, power 0.8, 13 mph pure crosswind): air drift between 8 and 18 yards. Higher-lofted short irons drift more per yard of carry than drivers. A 13 mph headwind shortens driver carry by at least 5 % versus calm; tailwind lengthens it.

- [ ] **Step 1: Append failing tests to `tests/physicsWind.test.mjs`**

```js
test('a 13 mph crosswind moves a full drive a realistic 8-18 yards in the air', () => {
    const { landing } = playOut('driver', 0.8, 0, { direction: 270, speed: 13 });
    const driftYards = Math.abs(landing.x) * 2;
    assert.ok(driftYards >= 8 && driftYards <= 18, `drift ${driftYards} yd`);
});

test('lofted shots are moved more by wind per yard of carry than drives', () => {
    const drive = playOut('driver', 0.8, 0, { direction: 90, speed: 13 }).landing;
    const wedge = playOut('pitchingWedge', 0.8, 0, { direction: 90, speed: 13 }).landing;
    assert.ok(Math.abs(wedge.x / wedge.z) > Math.abs(drive.x / drive.z));
});

test('headwind shortens and tailwind lengthens carry', () => {
    const calm = -playOut('driver', 0.8, 0, { direction: 0, speed: 0 }).landing.z;
    const head = -playOut('driver', 0.8, 0, { direction: 180, speed: 13 }).landing.z;
    const tail = -playOut('driver', 0.8, 0, { direction: 0, speed: 13 }).landing.z;
    assert.ok(head < calm * 0.95, `head ${head} calm ${calm}`);
    assert.ok(tail > calm, `tail ${tail} calm ${calm}`);
});
```

Note: wind `direction` is the direction the wind blows **toward** in this codebase (`direction 0` pushes −z, i.e. forward = tailwind; `180` = headwind; `90` pushes +x; `270` pushes −x).

- [ ] **Step 2: Run to verify failure** — `node --test tests/physicsWind.test.mjs`. Expected: the 8–18 yd test FAILS (currently ~31 yd).

- [ ] **Step 3: Implement** — set `const WIND_EFFECT_MULTIPLIER = 0.00008;` and in the wind block use:

```js
            const windEffect = this.wind.speed * WIND_EFFECT_MULTIPLIER * (0.5 + this.club.height);
```

If the 8–18 yd window is missed by the constant, adjust only `WIND_EFFECT_MULTIPLIER` (between 0.00005 and 0.00012) and report the final value.

- [ ] **Step 4: Run tests** — `node --test tests/physicsWind.test.mjs`, then `npm test`. The existing "rolls out along its line" test must still pass.

- [ ] **Step 5: Commit** — `git commit -m "fix(wind): realistic loft-scaled wind strength"`

---

### Task 3: Real curve and backspin in the physics

**Files:**
- Create: `js/shotShape.js`
- Modify: `js/physics.js` (constructor, `update`, ground contact, `dampSidewaysVelocity`)
- Test: `tests/shotShape.test.mjs`, `tests/physicsSpin.test.mjs`; modify `tests/physicsWind.test.mjs` (one replaced assertion, listed below)

**Interfaces:**
- `BallPhysics` constructor gains a 7th optional argument `spin = { side: 0, back: 0 }` (`side` −1…1, `back` 0…1).
- In flight (before first landing, non-putter): bend acceleration perpendicular to the current horizontal velocity, toward +right for `side > 0`: `a = SIDESPIN_ACCEL * side * horizontalSpeed`, with `SIDESPIN_ACCEL = 0.0035`; `side` decays by `SIDESPIN_DECAY = 0.995` per frame.
- First ground contact: record `this.rollHeading` = unit horizontal velocity at contact; apply a one-time sideways kick `LANDING_KICK = 0.15 × side × horizontalSpeed` along the right-perpendicular of the heading, then set `side = 0`; multiply horizontal velocity by `(1 − BACKSPIN_CHECK × back)` with `BACKSPIN_CHECK = 0.5`.
- `dampSidewaysVelocity()` damps relative to `this.rollHeading` (falling back to the launch direction if not yet set) instead of the launch direction.
- `shotShape.js`: `describeShotShape(curve)` → `'Straight'` if |curve| < 0.05, `'Fade'`/`'Draw'` if < 0.4, else `'Slice'`/`'Hook'` (positive = Fade/Slice). `backspinForClub(club, spinInput = 0)` → `clamp01(0.15 + (club.height - 0.35) * 0.6 + spinInput * 0.3)` for non-putters, `0` for the putter (driver ≈ 0.42 + input, sand wedge ≈ 0.15 + input — see note), clamped 0–1.

Note on `backspinForClub`: higher `club.height` here means a higher-launching club, which in this codebase is the *driver* (0.8) not the wedge (0.35). Real backspin rises as loft rises, so use the club's **distance rank** instead: `const loftRank = 1 - club.maxDistance / 400;` and `backspin = clamp01(0.1 + loftRank * 0.7 + spinInput * 0.3)` (driver 0.1, 7-iron ≈ 0.40, sand wedge ≈ 0.64). Use this formula; ignore the `club.height` version above.

Replaced assertion: in `tests/physicsWind.test.mjs`, the test "after landing in a strong crosswind the ball rolls out along its line" — replace its two `groundDrift` assertions with a heading check (the ball now rolls along its *landing heading*, which includes air drift):

```js
    const landingHeading = Math.atan2(landing.x, -landing.z);
    const rollHeading = Math.atan2(rest.x - landing.x, landing.z - rest.z);
    assert.ok(Math.abs(rollHeading - landingHeading) < 0.05, `roll ${rollHeading} vs landing ${landingHeading}`);
```

(keep the `airDrift > 2` sanity check, lowering 5 → 2 since Task 2 reduced drift.) Note: `landingHeading` uses the straight line from the tee as an approximation of the landing heading; if the in-flight drift makes the actual heading differ by more than 0.05 rad, compute `landingHeading` from the ball's velocity at first contact instead by exposing `physics.rollHeading` and comparing against `Math.atan2(rollHeading.x, -rollHeading.z)`; report which you used.

- [ ] **Step 1: Write failing tests**

`tests/shotShape.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { describeShotShape, backspinForClub } from '../js/shotShape.js';
import { getClub } from '../js/clubs.js';

test('shot shapes follow right-handed conventions', () => {
    assert.equal(describeShotShape(0), 'Straight');
    assert.equal(describeShotShape(0.04), 'Straight');
    assert.equal(describeShotShape(0.2), 'Fade');
    assert.equal(describeShotShape(0.7), 'Slice');
    assert.equal(describeShotShape(-0.2), 'Draw');
    assert.equal(describeShotShape(-0.7), 'Hook');
});

test('backspin rises with loft and is zero for the putter', () => {
    const driver = backspinForClub(getClub('driver'));
    const iron = backspinForClub(getClub('iron7'));
    const wedge = backspinForClub(getClub('sandWedge'));
    assert.ok(driver < iron && iron < wedge);
    assert.equal(backspinForClub(getClub('putter'), 1), 0);
    assert.ok(backspinForClub(getClub('sandWedge'), 1) <= 1);
});
```

`tests/physicsSpin.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { BallPhysics } from '../js/physics.js';
import { getClub } from '../js/clubs.js';

const CALM = { direction: 0, speed: 0 };

function playOut(club, power, spin) {
    const physics = new BallPhysics({ x: 0, y: 0.1, z: 0 }, 0, power, getClub(club), CALM, { x: 0, y: 0, z: -500 }, spin);
    const ball = { position: { x: 0, y: 0.1, z: 0 }, rotation: { x: 0, y: 0, z: 0 } };
    let landing = null;
    let frames = 0;
    while (physics.update(ball, null) && frames++ < 5000) {
        if (!landing && ball.position.y <= 0.1001) landing = { ...ball.position };
    }
    return { landing, rest: { ...ball.position } };
}

test('no spin flies dead straight in calm air', () => {
    const { rest } = playOut('driver', 0.8, { side: 0, back: 0 });
    assert.equal(rest.x, 0);
});

test('positive sidespin fades right and negative draws left, symmetrically', () => {
    const fade = playOut('driver', 0.8, { side: 0.3, back: 0 }).landing;
    const draw = playOut('driver', 0.8, { side: -0.3, back: 0 }).landing;
    assert.ok(fade.x > 0 && draw.x < 0);
    assert.ok(Math.abs(fade.x + draw.x) < 1e-9);
});

test('the bend grows through the flight instead of being a straight angled line', () => {
    const physics = new BallPhysics({ x: 0, y: 0.1, z: 0 }, 0, 0.8, getClub('driver'), CALM, null, { side: 0.5, back: 0 });
    const ball = { position: { x: 0, y: 0.1, z: 0 }, rotation: { x: 0, y: 0, z: 0 } };
    const samples = [];
    while (ball.position.y > 0.1001 || samples.length === 0) {
        physics.update(ball, null);
        samples.push({ ...ball.position });
        if (samples.length > 3000) break;
    }
    const mid = samples[Math.floor(samples.length / 2)];
    const end = samples[samples.length - 1];
    assert.ok(end.x / -end.z > (mid.x / -mid.z) * 1.3, 'path must curve, not just start offline');
});

test('even a maximum slice off a full drive stays inside the 200-wide course', () => {
    const { rest } = playOut('driver', 1, { side: 1, back: 0 });
    assert.ok(Math.abs(rest.x) < 100, `ended at x ${rest.x}`);
    const meaningful = playOut('driver', 1, { side: 1, back: 0 }).landing;
    assert.ok(meaningful.x * 2 >= 25, `max slice should move at least 25 yd (got ${meaningful.x * 2})`);
});

test('backspin checks up the roll without changing carry', () => {
    const low = playOut('pitchingWedge', 0.8, { side: 0, back: 0 });
    const high = playOut('pitchingWedge', 0.8, { side: 0, back: 1 });
    const lowRoll = low.landing.z - low.rest.z;
    const highRoll = high.landing.z - high.rest.z;
    assert.equal(low.landing.z, high.landing.z);
    assert.ok(highRoll < lowRoll * 0.75, `roll ${highRoll} vs ${lowRoll}`);
});

test('sidespin adds only a small kick on landing, then the ball rolls along its line', () => {
    const { landing, rest } = playOut('iron7', 0.7, { side: 0.4, back: 0 });
    const groundDrift = rest.x - landing.x;
    const roll = landing.z - rest.z;
    assert.ok(groundDrift >= 0, 'kick follows the spin direction');
    assert.ok(groundDrift <= roll * 0.35, `ground drift ${groundDrift} over roll ${roll}`);
});

test('the putter ignores spin', () => {
    const putt = playOut('putter', 0.5, { side: 1, back: 1 });
    assert.equal(putt.rest.x, 0);
});
```

- [ ] **Step 2: Run to verify failure** — `node --test tests/shotShape.test.mjs tests/physicsSpin.test.mjs`. Expected: FAIL (module missing; spin ignored).

- [ ] **Step 3: Create `js/shotShape.js`**

```js
import { clamp01 } from './shotControls/ShotIntent.js';

function describeShotShape(curve) {
    const magnitude = Math.abs(curve);
    if (magnitude < 0.05) return 'Straight';
    if (curve > 0) return magnitude < 0.4 ? 'Fade' : 'Slice';
    return magnitude < 0.4 ? 'Draw' : 'Hook';
}

function backspinForClub(club, spinInput = 0) {
    if (club.name === 'putter') return 0;
    const loftRank = 1 - club.maxDistance / 400;
    return clamp01(0.1 + loftRank * 0.7 + spinInput * 0.3);
}

export { describeShotShape, backspinForClub };
```

- [ ] **Step 4: Update `js/physics.js`**

Constants (with the others):

```js
const SIDESPIN_ACCEL = 0.0035;
const SIDESPIN_DECAY = 0.995;
const LANDING_KICK = 0.15;
const BACKSPIN_CHECK = 0.5;
```

Constructor: change the signature to `constructor(initialPosition, direction, power, club, wind = { direction: 0, speed: 0 }, holePosition = null, spin = { side: 0, back: 0 })` and add:

```js
        const usesSpin = club.name !== 'putter';
        this.sidespin = usesSpin ? Math.max(-1, Math.min(1, spin.side ?? 0)) : 0;
        this.backspin = usesSpin ? Math.max(0, Math.min(1, spin.back ?? 0)) : 0;
        this.rollHeading = null;
```

In `update`, right after the wind block, add the in-flight bend:

```js
        if (isInFlight && !this.hasLanded && this.sidespin !== 0) {
            const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
            if (horizontalSpeed > 0) {
                const rightX = -this.velocity.z / horizontalSpeed;
                const rightZ = this.velocity.x / horizontalSpeed;
                const bend = SIDESPIN_ACCEL * this.sidespin * horizontalSpeed;
                this.velocity.x += rightX * bend;
                this.velocity.z += rightZ * bend;
            }
            this.sidespin *= SIDESPIN_DECAY;
        }
```

Check the sign: with velocity pointing −z (forward), `rightX = -(-1)/1 = +1`, so positive sidespin pushes +x (right). ✓

In the ground-contact block, replace

```js
            this.hasLanded = true;
            this.dampSidewaysVelocity();
```

with

```js
            if (!this.hasLanded) {
                this.hasLanded = true;
                this.applyLandingSpin();
            }
            this.dampSidewaysVelocity();
```

Add methods (next to `dampSidewaysVelocity`):

```js
    applyLandingSpin() {
        const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
        if (horizontalSpeed === 0) return;

        this.rollHeading = { x: this.velocity.x / horizontalSpeed, z: this.velocity.z / horizontalSpeed };
        const rightX = -this.rollHeading.z;
        const rightZ = this.rollHeading.x;
        const kick = LANDING_KICK * this.sidespin * horizontalSpeed;
        const check = 1 - BACKSPIN_CHECK * this.backspin;

        this.velocity.x = this.velocity.x * check + rightX * kick;
        this.velocity.z = this.velocity.z * check + rightZ * kick;
        this.sidespin = 0;
    }
```

Change `dampSidewaysVelocity()` to use the roll heading when present:

```js
    dampSidewaysVelocity() {
        let lineX;
        let lineZ;
        if (this.rollHeading) {
            lineX = this.rollHeading.x;
            lineZ = this.rollHeading.z;
        } else {
            const dirRadians = this.direction * (Math.PI / 180);
            lineX = Math.sin(dirRadians);
            lineZ = -Math.cos(dirRadians);
        }
        const along = this.velocity.x * lineX + this.velocity.z * lineZ;
        const sidewaysX = this.velocity.x - along * lineX;
        const sidewaysZ = this.velocity.z - along * lineZ;
        this.velocity.x = along * lineX + sidewaysX * SIDEWAYS_GROUND_DAMPING;
        this.velocity.z = along * lineZ + sidewaysZ * SIDEWAYS_GROUND_DAMPING;
    }
```

Note on the landing kick vs. damping on the same contact: the kick is applied, then `dampSidewaysVelocity` immediately damps the sideways part to 30 %, so the effective kick is `0.3 × LANDING_KICK`. That is intended (small kick). If "ground drift ≥ 0" fails because damping removes the kick entirely, apply the kick *after* `dampSidewaysVelocity` on the first contact only and report it.

Tuning: if "maximum slice stays inside the course" or "at least 25 yd" fails, adjust only `SIDESPIN_ACCEL` (between 0.001 and 0.008) and report the final value. If backspin's roll test fails, adjust only `BACKSPIN_CHECK` (≤ 0.8).

- [ ] **Step 5: Apply the replaced assertion** in `tests/physicsWind.test.mjs` as described above.

- [ ] **Step 6: Run tests** — focused files, then `npm test`. Expected: all pass.

- [ ] **Step 7: Commit** — `git commit -m "feat(physics): sidespin curve, backspin check, roll along landing heading"`

---

### Task 4: Shots carry their curve and backspin; results show the shape

**Files:**
- Modify: `js/gameState.js` (`takeShot`)
- Modify: `js/ui/ResultsPanel.js` (`displayResults`)
- Test: `tests/gameStateCurve.test.mjs`

**Interfaces:**
- Consumes: `describeShotShape`, `backspinForClub` (Task 3), BallPhysics 7th arg.
- `takeShot` passes `{ side: intent.curve, back: backspinForClub(club, intent.spin) }` to `BallPhysics`, and adds `shape: describeShotShape(intent.curve)` to `shotInfo`.
- `ResultsPanel.displayResults` adds lines `Shape: ${shotInfo.shape ?? 'Straight'}` and, when `shotInfo.wind` exists, `Wind: ${shotInfo.wind.speed} mph` — built with `textContent` (replace the existing `innerHTML` template with created `<p>` elements; same fields as today plus the two new ones).

- [ ] **Step 1: Write the failing test** — `tests/gameStateCurve.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import * as GameState from '../js/gameState.js';
import { CONTROL_MODES } from '../js/shotControls/controlModes.js';

function makeVector(x = 0, y = 0.1, z = 0) {
    return { x, y, z, set(a, b, c) { this.x = a; this.y = b; this.z = c; } };
}

const realRandom = Math.random;

function shoot(source, curve) {
    const ball = { position: makeVector(), rotation: makeVector(0, 0, 0) };
    const arrow = { position: makeVector(0, 0.3, -1.5), rotation: makeVector(0, 0, 0), visible: true };
    Math.random = () => 0;
    GameState.initGameState({}, ball, arrow);
    Math.random = realRandom;
    GameState.setHoleData({ position: { x: 0, y: 0, z: -300 }, par: 5, distance: 600 });
    GameState.setControlMode(source);
    GameState.setCurrentClub('driver');
    GameState.takeShotFromIntent({ source, power: 0.8, accuracy: 0.5, directionOffset: 0, curve });
    let frames = 0;
    while (GameState.getGameState() === GameState.GameState.IN_FLIGHT && frames++ < 5000) {
        GameState.updateBallPhysics();
    }
    return { x: ball.position.x, shape: GameState.getShotInfo().shape };
}

test('trackball curve bends the shot and is reported as its shape', () => {
    const fade = shoot(CONTROL_MODES.TRACKBALL, 0.3);
    const hook = shoot(CONTROL_MODES.TRACKBALL, -0.7);
    const straight = shoot(CONTROL_MODES.TRACKBALL, 0);

    assert.ok(fade.x > 1 && fade.shape === 'Fade');
    assert.ok(hook.x < -1 && hook.shape === 'Hook');
    assert.ok(Math.abs(straight.x) < 1e-9 && straight.shape === 'Straight');
});

test('remote phone shots carry curve to the physics too', () => {
    const remote = shoot(CONTROL_MODES.REMOTE, 0.3);
    assert.ok(remote.x > 1);
});
```

Notes: `Math.random = () => 0` during `initGameState` makes the hole wind calm (speed band 0 → speed 0) so only curve moves the ball; gust of a 0 mph wind is 0. If `initGameState`'s wind is not calm under that stub (e.g. `rollHoleWind` consumes randoms differently), stub `Math.random` around `GameState.generateWind()` explicitly after `initGameState` and report it.

- [ ] **Step 2: Run to verify failure** — `node --test tests/gameStateCurve.test.mjs`. Expected: FAIL (curve not reaching physics; no `shape`).

- [ ] **Step 3: Implement** — in `js/gameState.js` import `{ describeShotShape, backspinForClub }` from `./shotShape.js`; in `takeShot` add `shape: describeShotShape(intent.curve)` to `state.shotInfo`; after `const club = getClub(state.currentClub);` pass a 7th argument to `new BallPhysics(...)`:

```js
        { side: intent.curve, back: backspinForClub(club, intent.spin) }
```

In `js/ui/ResultsPanel.js`, rewrite the body of `displayResults` to build the lines with `textContent`:

```js
    displayResults(resultText, shotInfo, distanceYards, strokes, relativeToPar) {
        if (!this.resultTextEl || !this.shotInfoEl || !this.resultsEl) return;

        this.resultTextEl.textContent = resultText;
        const lines = [
            `Club: ${shotInfo.club}`,
            `Shape: ${shotInfo.shape ?? 'Straight'}`,
            `Power: ${shotInfo.power}`,
            `Accuracy: ${shotInfo.accuracy}`,
            `Direction: ${shotInfo.direction}°`,
            `Distance: ${distanceYards} yards`,
            ...(shotInfo.wind ? [`Wind: ${shotInfo.wind.speed} mph`] : []),
            `Strokes: ${strokes}`,
            `To Par: ${relativeToPar > 0 ? '+' : ''}${relativeToPar}`
        ];
        this.shotInfoEl.replaceChildren(...lines.map(text => {
            const line = document.createElement('p');
            line.textContent = text;
            return line;
        }));
        this.resultsEl.style.display = 'block';
    }
```

- [ ] **Step 4: Run tests** — focused file, then `npm test`.

- [ ] **Step 5: Commit** — `git commit -m "feat(shot): pass curve and backspin to physics, show shot shape"`

---

### Task 5: Forgiving trackball curve mapping

**Files:**
- Modify: `js/shotControls/TrackballGesture.js` (`interpretTrackballGesture`)
- Modify: `tests/shotControls/TrackballGesture.test.mjs` (one replaced assertion, listed)

**Interfaces:**
- `sideRatio` (already angle-based, 8° dead zone, full at 30°) now maps to:
  - `curve = Math.sign(sideRatio) * Math.abs(sideRatio) ** 1.5` (gentle near straight, strong at the extremes)
  - `directionOffset = clamp(sideRatio * 10, -10, 10)` (the start line moves a little; the curve does the real work — Golden Tee feel)
- Replaced assertion: the existing test "maps side exit angle into curve and direction offset" asserts `directionOffset > 10`; change it to `directionOffset > 3` and keep `curve > 0.25` (was `> 0.4`).

- [ ] **Step 1: Add the failing test** (append):

```js
test('curve response is gentle near straight and strong at the extremes', () => {
    function exit(degrees) {
        const radians = degrees * Math.PI / 180;
        return interpretTrackballGesture([
            { x: 150, y: 260, t: 0 },
            { x: 150, y: 320, t: 70 },
            { x: 150 + Math.sin(radians) * 100, y: 320 - Math.cos(radians) * 100, t: 120 },
            { x: 150 + Math.sin(radians) * 220, y: 320 - Math.cos(radians) * 220, t: 180 }
        ]).intent;
    }

    const slight = exit(12);
    const strong = exit(30);
    assert.ok(slight.curve > 0 && slight.curve < 0.15, `slight ${slight.curve}`);
    assert.ok(strong.curve > 0.9, `strong ${strong.curve}`);
    assert.ok(Math.abs(strong.directionOffset) <= 10);
    assert.ok(exit(-30).curve < -0.9);
});
```

- [ ] **Step 2: Run to verify failure** — `node --test tests/shotControls/TrackballGesture.test.mjs`.

- [ ] **Step 3: Implement** — in `interpretTrackballGesture` replace

```js
    const directionOffset = clamp(sideRatio * 35, -35, 35);
```

with

```js
    const directionOffset = clamp(sideRatio * 10, -10, 10);
    const curve = Math.sign(sideRatio) * Math.abs(sideRatio) ** 1.5;
```

and use `curve,` (instead of `curve: sideRatio,`) in the returned intent. Apply the replaced assertion described above.

- [ ] **Step 4: Run tests** — focused file, then `npm test`. The natural-arc test (|offset| < 2, |curve| < 0.1) must still pass.

- [ ] **Step 5: Commit** — `git commit -m "feat(trackball): side angle drives forgiving hook/slice"`

---

### Task 6: Green, bunker and fairway behave differently

**Files:**
- Modify: `js/course.js` (bunker radii, `getSurfaceAt`, `getTerrainData`, green radius state)
- Modify: `js/physics.js` (ground contact uses surface)
- Test: `tests/surfaces.test.mjs`

**Interfaces:**
- Course: keeps `bunkerZones = [{ x, z, radius }]` (reset in `clearDecorativeElements`) and `greenZone = { x, z, radius: GREEN_RADIUS }` (set in `createHole`). `getSurfaceAt(x, z) → 'bunker' | 'green' | 'fairway'` (bunker wins over green). `getTerrainData()` returns `{ hills, getHeightAt, getSurfaceAt }`.
- Physics: `SURFACES = { fairway: { friction: GROUND_FRICTION, bounce: 1 }, green: { friction: 0.9, bounce: 0.6 }, bunker: { friction: 0.45, bounce: 0.25 } }` — on ground contact (non-putter) the bounce factor is multiplied by `surface.bounce` and `GROUND_FRICTION` is replaced by `surface.friction`. Putter behaviour unchanged. Surface lookup: `terrain?.getSurfaceAt?.(x, z) ?? 'fairway'`.

- [ ] **Step 1: Write the failing test** — `tests/surfaces.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import * as Course from '../js/course.js';
import { BallPhysics } from '../js/physics.js';
import { getClub } from '../js/clubs.js';

function scene() {
    return { add() {}, remove() {} };
}

test('the course reports green around the hole, bunkers, and fairway elsewhere', () => {
    Course.initCourse(scene());
    const hole = Course.createHole({ x: 4, z: -150 }, 4, 300);
    const terrain = Course.getTerrainData();

    assert.equal(terrain.getSurfaceAt(hole.position.x + 2, hole.position.z), 'green');
    assert.equal(terrain.getSurfaceAt(60, 40), 'fairway');
    const [zone] = Course.getBunkerZones();
    assert.equal(terrain.getSurfaceAt(zone.x, zone.z), 'bunker');
});

function rollOn(surface) {
    const terrain = { getHeightAt: () => 0, getSurfaceAt: () => surface };
    const physics = new BallPhysics({ x: 0, y: 0.1, z: 0 }, 0, 0.6, getClub('iron7'), { direction: 0, speed: 0 });
    const ball = { position: { x: 0, y: 0.1, z: 0 }, rotation: { x: 0, y: 0, z: 0 } };
    let landing = null;
    let maxBounce = 0;
    let frames = 0;
    while (physics.update(ball, terrain) && frames++ < 5000) {
        if (!landing && ball.position.y <= 0.1001) landing = { ...ball.position };
        if (landing) maxBounce = Math.max(maxBounce, ball.position.y);
    }
    return { roll: landing.z - ball.position.z, maxBounce, finalY: ball.position.y };
}

test('bunkers kill the roll, greens roll farther than bunkers, nothing sticks in the air', () => {
    const fairway = rollOn('fairway');
    const bunker = rollOn('bunker');
    const green = rollOn('green');

    assert.ok(bunker.roll < fairway.roll * 0.5, `bunker ${bunker.roll} fairway ${fairway.roll}`);
    assert.ok(green.roll > bunker.roll);
    assert.ok(bunker.maxBounce <= fairway.maxBounce);
    for (const result of [fairway, bunker, green]) {
        assert.ok(Math.abs(result.finalY - 0.1) < 1e-9);
    }
});
```

- [ ] **Step 2: Run to verify failure** — `node --test tests/surfaces.test.mjs`. Expected: FAIL (`getSurfaceAt`/`getBunkerZones` missing).

- [ ] **Step 3: Implement in `js/course.js`**

Module state: `let bunkerZones = [];` and `let greenZone = null;`.

In `createBunker(x, z, size)` after creating the mesh: `bunkerZones.push({ x, z, radius: size });`.
In `clearDecorativeElements()`: `bunkerZones = [];`.
In `createHole(...)`, after computing the hole position: `greenZone = { x: holePosition.x, z: holePosition.z, radius: GREEN_RADIUS };`.

Add:

```js
function getSurfaceAt(x, z) {
    const inside = zone => (x - zone.x) ** 2 + (z - zone.z) ** 2 <= zone.radius ** 2;
    if (bunkerZones.some(inside)) return 'bunker';
    if (greenZone && inside(greenZone)) return 'green';
    return 'fairway';
}

function getBunkerZones() {
    return bunkerZones.map(zone => ({ ...zone }));
}
```

`getTerrainData()` returns `{ hills, getHeightAt: getTerrainHeightAt, getSurfaceAt }`. Export `getSurfaceAt` and `getBunkerZones`.

Note: `createHole` calls `addDecorativeElements` which places bunkers, so after `createHole` at least one bunker zone exists (8 bunkers per hole); the test relies on that.

- [ ] **Step 4: Implement in `js/physics.js`**

Add near constants:

```js
const SURFACES = Object.freeze({
    fairway: { friction: GROUND_FRICTION, bounce: 1 },
    green: { friction: 0.9, bounce: 0.6 },
    bunker: { friction: 0.45, bounce: 0.25 }
});
```

In the ground-contact block (non-putter branches only):

```js
            const surface = SURFACES[terrain?.getSurfaceAt?.(ball.position.x, ball.position.z)] ?? SURFACES.fairway;
```

multiply the non-putter `bounceFactor` by `surface.bounce`, and use `surface.friction` instead of `GROUND_FRICTION` for non-putters. Putter keeps `PUTTER_BOUNCE_FACTOR` and `PUTTER_GROUND_FRICTION`.

- [ ] **Step 5: Run tests** — focused file, then `npm test`.

- [ ] **Step 6: Commit** — `git commit -m "feat(course): green, bunker and fairway landing behaviour"`
