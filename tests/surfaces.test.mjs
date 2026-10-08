import test from 'node:test';
import assert from 'node:assert/strict';

import * as Course from '../js/course.js';
import { BallPhysics } from '../js/physics.js';
import { getClub } from '../js/clubs.js';

function scene() {
    return { add() {}, remove() {} };
}

test('the course reports green around the hole, bunkers, and fairway elsewhere', () => {
    Course.initCourse(scene());
    const hole = Course.createHole({ x: 4, z: -150 }, 4, 300);
    const terrain = Course.getTerrainData();

    assert.equal(terrain.getSurfaceAt(hole.position.x + 2, hole.position.z), 'green');
    assert.equal(terrain.getSurfaceAt(60, 40), 'fairway');
    const [zone] = Course.getBunkerZones();
    assert.equal(terrain.getSurfaceAt(zone.x, zone.z), 'bunker');
});

function rollOn(surface) {
    const terrain = { getHeightAt: () => 0, getSurfaceAt: () => surface };
    const physics = new BallPhysics({ x: 0, y: 0.1, z: 0 }, 0, 0.6, getClub('iron7'), { direction: 0, speed: 0 });
    const ball = { position: { x: 0, y: 0.1, z: 0 }, rotation: { x: 0, y: 0, z: 0 } };
    let landing = null;
    let maxBounce = 0;
    let frames = 0;
    while (physics.update(ball, terrain) && frames++ < 5000) {
        if (!landing && ball.position.y <= 0.1001) landing = { ...ball.position };
        if (landing) maxBounce = Math.max(maxBounce, ball.position.y);
    }
    return { roll: landing.z - ball.position.z, maxBounce, finalY: ball.position.y };
}

test('bunkers kill the roll, greens roll farther than bunkers, nothing sticks in the air', () => {
    const fairway = rollOn('fairway');
    const bunker = rollOn('bunker');
    const green = rollOn('green');

    assert.ok(bunker.roll < fairway.roll * 0.5, `bunker ${bunker.roll} fairway ${fairway.roll}`);
    assert.ok(green.roll > bunker.roll);
    assert.ok(bunker.maxBounce <= fairway.maxBounce);
    for (const result of [fairway, bunker, green]) {
        assert.ok(Math.abs(result.finalY - 0.1) < 1e-9);
    }
});
