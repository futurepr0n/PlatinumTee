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
        if (landing && GameState.getGameState() === GameState.GameState.IN_FLIGHT) {
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
