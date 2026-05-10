# Trackball Control Modes Design

## Objective

PlatinumTee should move toward a Golden Tee-like arcade golf experience in Three.js. The first control milestone is to let players choose the shot input style per shot, including a virtual trackball that works with mouse, touch, and pointer input.

## Goals

- Add per-shot control mode switching during aiming.
- Preserve the current classic power/accuracy meter.
- Add a Golden Tee-inspired virtual trackball mode.
- Let desktop mouse users and phone touch users perform the same trackball-style flick gesture.
- Keep the physics system centralized by normalizing all control modes into one shot command.

## Non-Goals

- Full cabinet artwork reproduction.
- Replay/options buttons from the arcade control panel.
- Advanced spin buttons in the first pass.
- Major physics rewrite beyond accepting normalized control data.

## Recommended Approach

Use a unified shot input layer. Each control mode produces a normalized `ShotIntent`, and game state launches shots from that shared command shape.

```js
{
  directionOffset,
  power,
  accuracy,
  curve,
  spin,
  launchModifier,
  source
}
```

This keeps `Classic Meter` and `Trackball Flick` interchangeable per shot and gives future control modes a clean path into the game.

## Control Modes

### Classic Meter

The existing power and accuracy meter flow remains available. It should continue to work with keyboard and button input as it does today.

### Trackball Flick

Trackball mode replaces the power and accuracy meters with a bottom-centered virtual ball surface rendered with Three.js/WebGL. The player drags or flicks through the ball using mouse or touch.

Gesture interpretation:

- Drag/flick distance and release velocity set power.
- Forward component drives primary shot energy.
- Side exit angle contributes hook/slice.
- Gesture smoothness and alignment contribute accuracy.
- Follow-through shape can later feed topspin/backspin.

Small accidental gestures should not launch a shot.

## UI Behavior

Add a compact shot control switcher near the current controls:

`Classic | Trackball`

Switching is allowed only while aiming. Once a shot interaction starts, the selected control mode is locked until the shot resolves. After the ball stops, the player can choose any mode again for the next shot.

In trackball mode, show:

- A 3D virtual ball control.
- Direction/flick guide.
- Power preview feedback.
- Visual ball rotation while dragging.
- Optional gesture trail or arrow.

## Data Flow

Current flow:

```text
button/meter UI -> GameState.setPower/setAccuracy -> takeShot()
```

Target flow:

```text
selected control mode -> ShotIntent -> GameState.takeShot(intent) -> BallPhysics
```

The first implementation can adapt the existing `power`, `accuracy`, and `direction` fields internally, but the public boundary should move toward a single shot intent.

## Architecture

Add a small input subsystem rather than mixing trackball logic into `gameState.js`.

Suggested modules:

- `js/shotControls/controlModes.js`: mode constants and selection state.
- `js/shotControls/ShotIntent.js`: intent normalization helpers.
- `js/shotControls/TrackballControl.js`: pointer gesture collection and WebGL visual control.
- `js/shotControls/ClassicMeterControl.js`: adapter for existing meter behavior.

The UI layer owns display and pointer events. Game state owns validation, shot launch, scoring, and physics handoff.

## Verification

- The app boots with one Three.js canvas for the course.
- Classic meter mode still launches shots.
- Trackball mode launches shots from mouse flicks.
- Trackball mode launches shots from touch/pointer gestures.
- Control mode can change before every shot.
- Control mode cannot change mid-shot.
- Too-small trackball gestures are ignored.
- No console errors after several shots and mode switches.
- Canvas remains responsive after browser resize.

## Open Follow-Up

After the first pass works, add arcade-style refinements: dedicated spin buttons, richer cabinet-inspired UI treatment, clearer shot path previews, and better curve/spin physics.
