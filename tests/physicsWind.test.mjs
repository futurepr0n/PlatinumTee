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

function playOut(club, power, direction, wind) {
    const physics = new BallPhysics({ x: 0, y: 0.1, z: 0 }, direction, power, getClub(club), wind, { x: 0, y: 0, z: -500 });
    const ball = ballAt(0.1);
    let landing = null;
    let frames = 0;
    while (physics.update(ball, null) && frames++ < 5000) {
        if (!landing && ball.position.y <= 0.1001) landing = { ...ball.position };
    }
    return { landing, rest: { ...ball.position } };
}

test('after landing in a strong crosswind the ball rolls out along its line', () => {
    const { landing, rest } = playOut('driver', 0.8, 0, { direction: 270, speed: 13 });

    const airDrift = Math.abs(landing.x);
    const groundDrift = Math.abs(rest.x - landing.x);
    const roll = landing.z - rest.z;

    assert.ok(airDrift > 5, `wind should still move the ball in the air (${airDrift})`);
    assert.ok(groundDrift <= airDrift * 0.25, `ground drift ${groundDrift} vs air drift ${airDrift}`);
    assert.ok(groundDrift <= roll * 0.15, `ground drift ${groundDrift} over roll ${roll}`);
});

test('a slightly offline shot keeps rolling on its own line instead of hooking', () => {
    const { landing, rest } = playOut('iron7', 0.6, -5, { direction: 0, speed: 0 });

    const lineAngle = Math.atan2(rest.x - landing.x, landing.z - rest.z) * 180 / Math.PI;
    assert.ok(Math.abs(lineAngle - -5) < 0.5, `roll angle ${lineAngle}`);
});
