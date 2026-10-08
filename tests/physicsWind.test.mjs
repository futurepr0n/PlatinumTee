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
