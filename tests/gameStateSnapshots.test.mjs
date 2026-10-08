import test from 'node:test';
import assert from 'node:assert/strict';

import * as GameState from '../js/gameState.js';
import { eventBus } from '../js/events.js';
import { CONTROL_MODES, CONTROL_MODE_ORDER } from '../js/shotControls/controlModes.js';

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
    const ball = { position: makeVector(), rotation: makeVector(0, 0, 0) };
    const arrow = { position: makeVector(0, 0.3, -1.5), rotation: makeVector(0, 0, 0), visible: true };
    GameState.initGameState({}, ball, arrow);
    GameState.setHoleData({ position: { x: 0, y: 0, z: -100 }, par: 4, distance: 200 });
    GameState.setControlMode(CONTROL_MODES.CLASSIC);
    return { ball, arrow };
}

test('REMOTE is a valid control mode but not part of the keyboard cycle', () => {
    setupGame();
    assert.equal(CONTROL_MODE_ORDER.includes(CONTROL_MODES.REMOTE), false);
    assert.equal(GameState.setControlMode(CONTROL_MODES.REMOTE), true);
});

test('loadBallSnapshot restores a player ball without announcing a finished shot', () => {
    const { ball, arrow } = setupGame();
    let shotCompleteCount = 0;
    const listener = () => shotCompleteCount++;
    eventBus.on('shotComplete', listener);

    assert.equal(GameState.loadBallSnapshot({ x: 3, y: 0.2, z: -40, strokes: 2 }), true);
    eventBus.off('shotComplete', listener);

    assert.deepEqual([ball.position.x, ball.position.z], [3, -40]);
    assert.deepEqual([arrow.position.x, arrow.position.z], [3, -40]);
    assert.equal(GameState.getGameState(), GameState.GameState.AIMING);
    assert.deepEqual(GameState.getBallSnapshot(), { x: 3, y: 0.2, z: -40, strokes: 2, holed: false });
    assert.equal(shotCompleteCount, 0);
});

test('remote shots count strokes and the ball cannot be swapped mid-flight', () => {
    setupGame();
    GameState.loadBallSnapshot({ x: 0, y: 0.2, z: 0, strokes: 0 });
    GameState.setControlMode(CONTROL_MODES.REMOTE);

    assert.equal(GameState.takeShotFromIntent({ source: CONTROL_MODES.REMOTE, power: 0.5 }), true);
    assert.equal(GameState.getGameState(), GameState.GameState.IN_FLIGHT);
    assert.equal(GameState.getBallSnapshot().strokes, 1);
    assert.equal(GameState.loadBallSnapshot({ x: 9, y: 0.2, z: -9, strokes: 0 }), false);
});
