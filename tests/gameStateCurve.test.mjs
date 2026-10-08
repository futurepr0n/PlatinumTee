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
    try {
        Math.random = () => 0;
        GameState.initGameState({}, ball, arrow);
    } finally {
        Math.random = realRandom;
    }
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
