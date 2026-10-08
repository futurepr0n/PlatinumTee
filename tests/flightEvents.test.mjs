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
