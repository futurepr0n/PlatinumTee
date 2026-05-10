# Trackball Control Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-shot selectable control modes, preserving the classic meter while adding a Golden Tee-inspired virtual trackball for mouse and touch.

**Architecture:** Add a small `js/shotControls/` subsystem that normalizes every control mode into a `ShotIntent`. Game state launches shots from that shared intent, while UI components own rendering, pointer events, and mode selection.

**Tech Stack:** Vanilla ES modules, Three.js 0.184.0, Node built-in test runner, browser pointer events, existing event bus.

---

## File Structure

- Modify: `package.json` - switch test script to Node test runner and make local JS modules testable as ESM.
- Create: `tests/shotControls/ShotIntent.test.mjs` - unit tests for normalized shot intent defaults and clamping.
- Create: `tests/shotControls/TrackballGesture.test.mjs` - unit tests for flick gesture interpretation.
- Create: `js/shotControls/ShotIntent.js` - pure helpers for creating and normalizing shot commands.
- Create: `js/shotControls/TrackballGesture.js` - pure gesture-to-shot-intent conversion.
- Create: `js/shotControls/controlModes.js` - control mode constants and cycle helper.
- Create: `js/ui/ControlModeSwitcher.js` - segmented control UI that emits mode-change events.
- Create: `js/ui/TrackballControl.js` - Three.js virtual trackball renderer and pointer event bridge.
- Modify: `index.html` - add mode switcher and trackball container.
- Modify: `style.css` - style mode switcher and trackball control surface.
- Modify: `ui.js` - initialize and show/hide new control components based on game state and selected mode.
- Modify: `js/gameState.js` - store selected control mode and launch shots from `ShotIntent`.
- Modify: `js/gameManager.js` - wire control mode and trackball events into game state.
- Modify: `js/controls.js` - add keyboard mode cycling with `m`.

---

### Task 1: Add ShotIntent Unit Tests

**Files:**
- Modify: `package.json`
- Create: `tests/shotControls/ShotIntent.test.mjs`

- [ ] **Step 1: Update package metadata for tests**

Change `package.json` to:

```json
{
  "name": "platinumtee",
  "version": "1.0.0",
  "description": "",
  "main": "script.js",
  "scripts": {
    "test": "node --test tests"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "type": "module",
  "dependencies": {
    "three": "^0.184.0"
  }
}
```

- [ ] **Step 2: Write failing ShotIntent tests**

Create `tests/shotControls/ShotIntent.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createClassicShotIntent,
    normalizeShotIntent
} from '../../js/shotControls/ShotIntent.js';

test('normalizeShotIntent clamps numeric fields and preserves source', () => {
    const intent = normalizeShotIntent({
        directionOffset: 90,
        power: 2,
        accuracy: -1,
        curve: 5,
        spin: -4,
        launchModifier: 3,
        source: 'trackball'
    });

    assert.deepEqual(intent, {
        directionOffset: 45,
        power: 1,
        accuracy: 0,
        curve: 1,
        spin: -1,
        launchModifier: 2,
        source: 'trackball'
    });
});

test('createClassicShotIntent uses classic meter defaults', () => {
    const intent = createClassicShotIntent({
        directionOffset: -12,
        power: 0.64,
        accuracy: 0.52
    });

    assert.deepEqual(intent, {
        directionOffset: -12,
        power: 0.64,
        accuracy: 0.52,
        curve: 0,
        spin: 0,
        launchModifier: 1,
        source: 'classic-meter'
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`

Expected: FAIL with `Cannot find module ... js/shotControls/ShotIntent.js`.

- [ ] **Step 4: Commit test scaffold**

```bash
git add package.json tests/shotControls/ShotIntent.test.mjs
git commit -m "test: add shot intent normalization coverage"
```

---

### Task 2: Implement ShotIntent Helpers

**Files:**
- Create: `js/shotControls/ShotIntent.js`
- Test: `tests/shotControls/ShotIntent.test.mjs`

- [ ] **Step 1: Implement ShotIntent helpers**

Create `js/shotControls/ShotIntent.js`:

```js
const DEFAULT_SOURCE = 'classic-meter';

function clamp(value, min, max) {
    const numericValue = Number.isFinite(value) ? value : min;
    return Math.max(min, Math.min(max, numericValue));
}

function clamp01(value) {
    return clamp(value, 0, 1);
}

function normalizeSource(source) {
    return typeof source === 'string' && source.length > 0 ? source : DEFAULT_SOURCE;
}

function normalizeShotIntent(intent = {}) {
    return {
        directionOffset: clamp(intent.directionOffset ?? 0, -45, 45),
        power: clamp01(intent.power ?? 0),
        accuracy: clamp01(intent.accuracy ?? 0.5),
        curve: clamp(intent.curve ?? 0, -1, 1),
        spin: clamp(intent.spin ?? 0, -1, 1),
        launchModifier: clamp(intent.launchModifier ?? 1, 0.5, 2),
        source: normalizeSource(intent.source)
    };
}

function createClassicShotIntent({ directionOffset = 0, power = 0, accuracy = 0.5 } = {}) {
    return normalizeShotIntent({
        directionOffset,
        power,
        accuracy,
        curve: 0,
        spin: 0,
        launchModifier: 1,
        source: DEFAULT_SOURCE
    });
}

export {
    clamp,
    clamp01,
    createClassicShotIntent,
    normalizeShotIntent
};
```

- [ ] **Step 2: Run tests**

Run: `npm test`

Expected: PASS for `ShotIntent.test.mjs`.

- [ ] **Step 3: Commit**

```bash
git add js/shotControls/ShotIntent.js tests/shotControls/ShotIntent.test.mjs package.json
git commit -m "feat: add normalized shot intent helpers"
```

---

### Task 3: Add Trackball Gesture Unit Tests

**Files:**
- Create: `tests/shotControls/TrackballGesture.test.mjs`

- [ ] **Step 1: Write failing gesture tests**

Create `tests/shotControls/TrackballGesture.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretTrackballGesture } from '../../js/shotControls/TrackballGesture.js';

test('interpretTrackballGesture rejects tiny gestures', () => {
    const result = interpretTrackballGesture([
        { x: 100, y: 100, t: 0 },
        { x: 106, y: 96, t: 80 }
    ]);

    assert.equal(result.valid, false);
    assert.equal(result.reason, 'gesture-too-small');
});

test('interpretTrackballGesture converts a forward flick into a trackball shot intent', () => {
    const result = interpretTrackballGesture([
        { x: 150, y: 260, t: 0 },
        { x: 154, y: 190, t: 60 },
        { x: 160, y: 110, t: 130 }
    ]);

    assert.equal(result.valid, true);
    assert.equal(result.intent.source, 'trackball');
    assert.ok(result.intent.power > 0.45);
    assert.ok(result.intent.power <= 1);
    assert.ok(result.intent.accuracy > 0.85);
    assert.ok(result.intent.directionOffset > 0);
});

test('interpretTrackballGesture maps side exit angle into curve and direction offset', () => {
    const result = interpretTrackballGesture([
        { x: 150, y: 260, t: 0 },
        { x: 190, y: 180, t: 70 },
        { x: 235, y: 95, t: 140 }
    ]);

    assert.equal(result.valid, true);
    assert.ok(result.intent.directionOffset > 10);
    assert.ok(result.intent.curve > 0.4);
    assert.ok(result.intent.accuracy < 0.9);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL with `Cannot find module ... js/shotControls/TrackballGesture.js`.

- [ ] **Step 3: Commit failing gesture tests**

```bash
git add tests/shotControls/TrackballGesture.test.mjs
git commit -m "test: add trackball gesture coverage"
```

---

### Task 4: Implement Trackball Gesture Conversion

**Files:**
- Create: `js/shotControls/TrackballGesture.js`
- Test: `tests/shotControls/TrackballGesture.test.mjs`

- [ ] **Step 1: Implement pure gesture conversion**

Create `js/shotControls/TrackballGesture.js`:

```js
import { clamp, clamp01, normalizeShotIntent } from './ShotIntent.js';

const MIN_FLICK_DISTANCE = 24;
const MIN_FORWARD_RATIO = 0.25;
const MAX_POWER_DISTANCE = 260;
const MAX_POWER_VELOCITY = 1.6;
const MAX_SIDE_DRIFT = 160;

function getGestureVector(points) {
    const start = points[0];
    const end = points[points.length - 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dt = Math.max(1, end.t - start.t);
    const distance = Math.hypot(dx, dy);
    const forward = Math.max(0, -dy);
    const velocity = distance / dt;

    return { dx, dy, dt, distance, forward, velocity };
}

function interpretTrackballGesture(points) {
    if (!Array.isArray(points) || points.length < 2) {
        return { valid: false, reason: 'gesture-too-small' };
    }

    const { dx, distance, forward, velocity } = getGestureVector(points);
    const forwardRatio = forward / Math.max(distance, 1);

    if (distance < MIN_FLICK_DISTANCE || forwardRatio < MIN_FORWARD_RATIO) {
        return { valid: false, reason: 'gesture-too-small' };
    }

    const distancePower = distance / MAX_POWER_DISTANCE;
    const velocityPower = velocity / MAX_POWER_VELOCITY;
    const sideRatio = clamp(dx / MAX_SIDE_DRIFT, -1, 1);
    const directionOffset = clamp(sideRatio * 35, -35, 35);
    const power = clamp01(distancePower * 0.65 + velocityPower * 0.35);
    const accuracy = clamp01(1 - Math.abs(sideRatio) * 0.7);

    return {
        valid: true,
        intent: normalizeShotIntent({
            directionOffset,
            power,
            accuracy,
            curve: sideRatio,
            spin: clamp(forward / MAX_POWER_DISTANCE, -1, 1),
            launchModifier: 1,
            source: 'trackball'
        }),
        metrics: {
            distance,
            forward,
            velocity,
            sideRatio
        }
    };
}

export {
    interpretTrackballGesture
};
```

- [ ] **Step 2: Run tests**

Run: `npm test`

Expected: PASS for `ShotIntent.test.mjs` and `TrackballGesture.test.mjs`.

- [ ] **Step 3: Commit**

```bash
git add js/shotControls/TrackballGesture.js tests/shotControls/TrackballGesture.test.mjs
git commit -m "feat: interpret trackball flick gestures"
```

---

### Task 5: Add Control Mode State And Classic Intent Launch

**Files:**
- Create: `js/shotControls/controlModes.js`
- Modify: `js/gameState.js`
- Test: `npm test`

- [ ] **Step 1: Add control mode constants**

Create `js/shotControls/controlModes.js`:

```js
const CONTROL_MODES = Object.freeze({
    CLASSIC: 'classic-meter',
    TRACKBALL: 'trackball'
});

const CONTROL_MODE_ORDER = Object.freeze([
    CONTROL_MODES.CLASSIC,
    CONTROL_MODES.TRACKBALL
]);

function getNextControlMode(currentMode) {
    const index = CONTROL_MODE_ORDER.indexOf(currentMode);
    const nextIndex = index === -1 ? 0 : (index + 1) % CONTROL_MODE_ORDER.length;
    return CONTROL_MODE_ORDER[nextIndex];
}

export {
    CONTROL_MODES,
    CONTROL_MODE_ORDER,
    getNextControlMode
};
```

- [ ] **Step 2: Import helpers in game state**

At the top of `js/gameState.js`, add:

```js
import { createClassicShotIntent, normalizeShotIntent } from './shotControls/ShotIntent.js';
import { CONTROL_MODES } from './shotControls/controlModes.js';
```

- [ ] **Step 3: Add selected mode to state**

Inside the `state` object in `js/gameState.js`, add:

```js
currentControlMode: CONTROL_MODES.CLASSIC,
```

- [ ] **Step 4: Replace classic takeShot call**

In `setAccuracy`, replace:

```js
takeShot();
```

with:

```js
takeShot(createClassicShotIntent({
    directionOffset: state.direction,
    power: state.power,
    accuracy: state.accuracy
}));
```

- [ ] **Step 5: Change takeShot signature and calculation**

Replace the start of `takeShot` through `finalDirection` calculation with:

```js
function takeShot(intentData) {
    const intent = normalizeShotIntent(intentData);
    state.power = intent.power;
    state.accuracy = intent.accuracy;

    const accuracyEffect = (intent.accuracy - 0.5) * 2;
    const angleToHole = calculateAngleToHole();
    const curveEffect = intent.curve * 20;
    const finalDirection = angleToHole + intent.directionOffset + (accuracyEffect * 45) + curveEffect;
```

- [ ] **Step 6: Include source in shotInfo**

Update `state.shotInfo` inside `takeShot` to:

```js
state.shotInfo = {
    power: state.power.toFixed(2),
    accuracy: state.accuracy.toFixed(2),
    direction: finalDirection.toFixed(2),
    club: state.currentClub,
    controlMode: intent.source
};
```

- [ ] **Step 7: Add exported trackball launch and mode functions**

Before the export block in `js/gameState.js`, add:

```js
function takeShotFromIntent(intentData) {
    if (state.gameState !== GameState.AIMING) return false;

    state.strokes++;
    takeShot(intentData);
    return true;
}

function setControlMode(controlMode) {
    if (state.gameState !== GameState.AIMING) return false;
    if (!Object.values(CONTROL_MODES).includes(controlMode)) return false;

    state.currentControlMode = controlMode;
    eventBus.emit('controlModeChanged', { controlMode, fullState: getFullState() });
    updateInfo();
    return true;
}

function getControlMode() {
    return state.currentControlMode;
}
```

Add these names to the export block:

```js
takeShotFromIntent,
setControlMode,
getControlMode,
```

- [ ] **Step 8: Run tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add js/gameState.js js/shotControls/controlModes.js
git commit -m "feat: add per-shot control mode state"
```

---

### Task 6: Add Control Mode Switcher UI

**Files:**
- Modify: `index.html`
- Create: `js/ui/ControlModeSwitcher.js`
- Modify: `style.css`
- Modify: `ui.js`

- [ ] **Step 1: Add switcher markup**

In `index.html`, inside `<div id="controls">` before `#power-meter`, add:

```html
<div id="control-mode-switcher" aria-label="Shot control mode">
    <button class="control-mode-btn active" type="button" data-control-mode="classic-meter">Classic</button>
    <button class="control-mode-btn" type="button" data-control-mode="trackball">Trackball</button>
</div>
```

- [ ] **Step 2: Create switcher component**

Create `js/ui/ControlModeSwitcher.js`:

```js
import { eventBus } from '../../js/events.js';
import { CONTROL_MODES } from '../../js/shotControls/controlModes.js';

export class ControlModeSwitcher {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.buttons = this.container ? Array.from(this.container.querySelectorAll('[data-control-mode]')) : [];
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.buttons.forEach(button => {
            button.addEventListener('click', () => {
                const controlMode = button.getAttribute('data-control-mode');
                eventBus.emit('controlModeChangeRequested', controlMode);
            });
        });
    }

    updateSelection(controlMode = CONTROL_MODES.CLASSIC) {
        this.buttons.forEach(button => {
            const isActive = button.getAttribute('data-control-mode') === controlMode;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-pressed', String(isActive));
        });
    }

    show() {
        if (this.container) this.container.style.display = 'inline-flex';
    }

    hide() {
        if (this.container) this.container.style.display = 'none';
    }
}
```

- [ ] **Step 3: Add switcher styles**

Append to `style.css`:

```css
#control-mode-switcher {
    display: inline-flex;
    gap: 2px;
    padding: 4px;
    margin-bottom: 8px;
    border-radius: 6px;
    background-color: rgba(0, 0, 0, 0.65);
}
.control-mode-btn {
    margin: 0;
    padding: 8px 12px;
    border-radius: 4px;
    background-color: rgba(255, 255, 255, 0.15);
    color: white;
    font-size: 13px;
}
.control-mode-btn.active {
    background-color: #f59e0b;
    color: #111827;
}
```

- [ ] **Step 4: Wire switcher into UI module**

In `ui.js`, import:

```js
import { CONTROL_MODES } from './js/shotControls/controlModes.js';
import { ControlModeSwitcher } from './js/ui/ControlModeSwitcher.js';
```

Add module variable:

```js
let controlModeSwitcher;
```

Inside `initUI`, after `gameButtons`:

```js
controlModeSwitcher = new ControlModeSwitcher('control-mode-switcher');
```

Inside `updateUI`, after club selection:

```js
controlModeSwitcher.updateSelection(info.currentControlMode);
```

Inside `showAimingUI`, after `gameButtons.showSwingButton();`, add:

```js
controlModeSwitcher.show();
if (info.currentControlMode === CONTROL_MODES.TRACKBALL) {
    gameButtons.hideAllButtons();
}
```

Inside `showPowerUI`, `showAccuracyUI`, and `showInFlightUI`, add:

```js
controlModeSwitcher.hide();
```

Add `controlModeSwitcher` to the export list.

- [ ] **Step 5: Run tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add index.html style.css ui.js js/ui/ControlModeSwitcher.js
git commit -m "feat: add shot control mode switcher"
```

---

### Task 7: Add Three.js Trackball UI Component

**Files:**
- Modify: `index.html`
- Create: `js/ui/TrackballControl.js`
- Modify: `style.css`
- Modify: `ui.js`

- [ ] **Step 1: Add trackball container markup**

In `index.html`, inside `#controls` after `#accuracy-meter`, add:

```html
<div id="trackball-control">
    <div id="trackball-canvas"></div>
    <div id="trackball-guide">Flick forward through the ball</div>
    <div id="trackball-power-preview">Power 0%</div>
</div>
```

- [ ] **Step 2: Create TrackballControl component**

Create `js/ui/TrackballControl.js`:

```js
import * as THREE from 'three';
import { eventBus } from '../../js/events.js';
import { interpretTrackballGesture } from '../../js/shotControls/TrackballGesture.js';

export class TrackballControl {
    constructor(containerId, canvasHostId, powerPreviewId) {
        this.container = document.getElementById(containerId);
        this.canvasHost = document.getElementById(canvasHostId);
        this.powerPreview = document.getElementById(powerPreviewId);
        this.points = [];
        this.dragging = false;
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.ball = null;

        this.initScene();
        this.setupPointerEvents();
        this.animate();
    }

    initScene() {
        if (!this.canvasHost) return;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
        this.camera.position.set(0, 0, 5);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(150, 150);
        this.canvasHost.appendChild(this.renderer.domElement);

        const light = new THREE.DirectionalLight(0xffffff, 1.5);
        light.position.set(3, 5, 4);
        this.scene.add(light);
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));

        const geometry = new THREE.SphereGeometry(1.25, 48, 48);
        const material = new THREE.MeshStandardMaterial({
            color: 0xfff1c2,
            roughness: 0.35,
            metalness: 0.05
        });
        this.ball = new THREE.Mesh(geometry, material);
        this.scene.add(this.ball);
    }

    setupPointerEvents() {
        if (!this.container) return;

        this.container.addEventListener('pointerdown', (event) => this.handlePointerDown(event));
        this.container.addEventListener('pointermove', (event) => this.handlePointerMove(event));
        this.container.addEventListener('pointerup', (event) => this.handlePointerUp(event));
        this.container.addEventListener('pointercancel', () => this.resetGesture());
    }

    getPoint(event) {
        return {
            x: event.clientX,
            y: event.clientY,
            t: Date.now()
        };
    }

    handlePointerDown(event) {
        event.preventDefault();
        this.dragging = true;
        this.points = [this.getPoint(event)];
        this.container.setPointerCapture(event.pointerId);
        this.updatePowerPreview(0);
    }

    handlePointerMove(event) {
        if (!this.dragging) return;

        event.preventDefault();
        const point = this.getPoint(event);
        const previous = this.points[this.points.length - 1];
        this.points.push(point);

        if (this.ball && previous) {
            this.ball.rotation.x += (previous.y - point.y) * 0.02;
            this.ball.rotation.z += (point.x - previous.x) * 0.02;
        }

        const result = interpretTrackballGesture(this.points);
        this.updatePowerPreview(result.valid ? result.intent.power : 0);
    }

    handlePointerUp(event) {
        if (!this.dragging) return;

        event.preventDefault();
        this.points.push(this.getPoint(event));
        const result = interpretTrackballGesture(this.points);
        this.resetGesture();

        if (result.valid) {
            eventBus.emit('trackballShotRequested', result.intent);
        }
    }

    resetGesture() {
        this.dragging = false;
        this.points = [];
        this.updatePowerPreview(0);
    }

    updatePowerPreview(power) {
        if (this.powerPreview) {
            this.powerPreview.textContent = `Power ${Math.round(power * 100)}%`;
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    show() {
        if (this.container) this.container.style.display = 'block';
    }

    hide() {
        if (this.container) this.container.style.display = 'none';
        this.resetGesture();
    }
}
```

- [ ] **Step 3: Add trackball styles**

Append to `style.css`:

```css
#trackball-control {
    display: none;
    width: 230px;
    margin: 8px auto 0;
    padding: 10px 12px;
    border-radius: 8px;
    background: rgba(17, 24, 39, 0.82);
    color: white;
    touch-action: none;
    user-select: none;
}
#trackball-canvas {
    width: 150px;
    height: 150px;
    margin: 0 auto;
    border-radius: 50%;
    background: radial-gradient(circle at 45% 35%, rgba(255,255,255,0.35), rgba(245,158,11,0.22) 55%, rgba(0,0,0,0.25));
}
#trackball-guide,
#trackball-power-preview {
    margin-top: 6px;
    font-size: 12px;
    font-weight: bold;
}
```

- [ ] **Step 4: Wire trackball into UI module**

In `ui.js`, import:

```js
import { TrackballControl } from './js/ui/TrackballControl.js';
```

Add module variable:

```js
let trackballControl;
```

Inside `initUI`, after `temporaryMessage = new TemporaryMessage();`, add:

```js
trackballControl = new TrackballControl('trackball-control', 'trackball-canvas', 'trackball-power-preview');
```

In `showAimingUI`, after mode handling, add:

```js
if (info.currentControlMode === CONTROL_MODES.TRACKBALL) {
    trackballControl.show();
} else {
    trackballControl.hide();
}
```

In `showPowerUI`, `showAccuracyUI`, and `showInFlightUI`, add:

```js
trackballControl.hide();
```

Add `trackballControl` to the export list.

- [ ] **Step 5: Run tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add index.html style.css ui.js js/ui/TrackballControl.js
git commit -m "feat: add virtual trackball control UI"
```

---

### Task 8: Wire Control Events Into Game Flow

**Files:**
- Modify: `js/gameManager.js`
- Modify: `js/controls.js`

- [ ] **Step 1: Wire game manager events**

In `js/gameManager.js`, inside `setupUIEventListeners`, add:

```js
eventBus.on('controlModeChangeRequested', (controlMode) => {
    if (!Controls.areControlsEnabled()) return;
    GameState.setControlMode(controlMode);
});

eventBus.on('trackballShotRequested', (intent) => {
    if (!Controls.areControlsEnabled()) return;
    GameState.takeShotFromIntent(intent);
});
```

- [ ] **Step 2: Add keyboard mode cycling**

In `js/controls.js`, import:

```js
import { getNextControlMode } from './shotControls/controlModes.js';
```

In `setupKeyboardControls`, add this `case` before `default`:

```js
case 'm':
case 'M':
    eventBus.emit('controlModeChangeRequested', getNextControlMode(GameState.getControlMode()));
    break;
```

- [ ] **Step 3: Remove unused control imports if linting by inspection**

In `js/controls.js`, change:

```js
import { powerMeter, accuracyMeter, clubSelection, gameButtons } from '../ui.js';
```

to:

```js
import { clubSelection, gameButtons } from '../ui.js';
```

- [ ] **Step 4: Run tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/gameManager.js js/controls.js
git commit -m "feat: wire selectable shot controls"
```

---

### Task 9: Browser Smoke Verification

**Files:**
- Modify only if smoke test finds an implementation bug.

- [ ] **Step 1: Start or reuse local server**

Run: `python3 -m http.server 8000`

Expected: server prints `Serving HTTP`.

- [ ] **Step 2: Reload app in browser**

Open: `http://127.0.0.1:8000/?trackball-smoke=1`

Expected:
- One course canvas is visible.
- Control mode switcher shows `Classic` and `Trackball`.
- `Classic` is selected by default.

- [ ] **Step 3: Verify classic mode**

Actions:
- Click `SWING`.
- Click `SET POWER`.
- Click `SET ACCURACY`.

Expected:
- Ball launches.
- No console errors.
- After the ball stops, aiming UI returns.

- [ ] **Step 4: Verify trackball mode with mouse**

Actions:
- Click `Trackball`.
- Drag on the virtual ball from lower center to upper center and release.

Expected:
- The virtual ball rotates while dragging.
- Power preview rises above `0%`.
- Ball launches on release.
- Mode switcher hides while ball is in flight.

- [ ] **Step 5: Verify per-shot switching**

Actions:
- After the trackball shot stops, click `Classic`.
- Launch another classic meter shot.

Expected:
- The next shot uses the classic meter.
- Trackball control is hidden.
- No console errors.

- [ ] **Step 6: Commit smoke fixes if needed**

If code changes are required:

```bash
git add index.html style.css ui.js js/gameManager.js js/gameState.js js/controls.js js/ui/TrackballControl.js js/ui/ControlModeSwitcher.js
git commit -m "fix: stabilize trackball control smoke flow"
```

If no changes are required, do not create a commit for this task.

---

## Self-Review

- Spec coverage: per-shot switching is covered in Tasks 5, 6, and 8; classic preservation in Tasks 5, 6, and 9; trackball mouse/touch pointer behavior in Tasks 4, 7, and 9; shared `ShotIntent` flow in Tasks 1, 2, and 5; verification in Task 9.
- Placeholder scan: no incomplete implementation sections or references to undefined functions remain in this plan.
- Type consistency: `ShotIntent` fields match the approved spec and are used consistently by gesture conversion, game state, and trackball UI.
