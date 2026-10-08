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
        if (GameState.getGameState() === GameState.GameState.IN_FLIGHT) {
            ball.position.x = 0;
            ball.position.z = -10;
        }
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
