import test from 'node:test';
import assert from 'node:assert/strict';

import * as GameState from '../js/gameState.js';
import { CONTROL_MODES } from '../js/shotControls/controlModes.js';

function makeVector(x = 0, y = 0.2, z = 0) {
    return {
        x,
        y,
        z,
        set(nextX, nextY, nextZ) {
            this.x = nextX;
            this.y = nextY;
            this.z = nextZ;
        }
    };
}

function setupGame() {
    const ball = {
        position: makeVector(),
        rotation: makeVector(0, 0, 0)
    };
    const arrow = {
        position: makeVector(0, 0.3, -1.5),
        rotation: makeVector(0, 0, 0),
        visible: true
    };

    GameState.initGameState({}, ball, arrow);
    GameState.setHoleData({
        position: { x: 0, y: 0, z: -100 },
        par: 3,
        distance: 200
    });
    GameState.setDirection(0);

    return { ball, arrow };
}

test('trackball mode does not allow keyboard advance into classic power meter', () => {
    setupGame();

    assert.equal(GameState.setControlMode(CONTROL_MODES.TRACKBALL), true);
    assert.equal(GameState.startPowerMeter(), false);
    assert.equal(GameState.getGameState(), GameState.GameState.AIMING);
});

test('classic mode still allows the classic power meter', () => {
    setupGame();

    assert.equal(GameState.setControlMode(CONTROL_MODES.CLASSIC), true);
    assert.equal(GameState.startPowerMeter(), true);
    assert.equal(GameState.getGameState(), GameState.GameState.POWER);
});

test('trackball intent launch combines player aim with gesture direction offset', () => {
    setupGame();

    GameState.setDirection(15);
    assert.equal(GameState.setControlMode(CONTROL_MODES.TRACKBALL), true);
    assert.equal(GameState.takeShotFromIntent({
        source: CONTROL_MODES.TRACKBALL,
        power: 0.5,
        accuracy: 0.5,
        directionOffset: 7,
        curve: 0
    }), true);

    assert.equal(GameState.getShotInfo().direction, '22.00');
});

test('gesture curve does not add a second aim offset on top of directionOffset', () => {
    setupGame();

    assert.equal(GameState.setControlMode(CONTROL_MODES.TRACKBALL), true);
    assert.equal(GameState.takeShotFromIntent({
        source: CONTROL_MODES.TRACKBALL,
        power: 0.5,
        accuracy: 0.5,
        directionOffset: 0,
        curve: -1
    }), true);

    assert.equal(GameState.getShotInfo().direction, '0.00');
});
