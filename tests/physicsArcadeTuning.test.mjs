import test from 'node:test';
import assert from 'node:assert/strict';

import { HOLE_RADIUS_VISUAL } from '../js/course.js';
import { BallPhysics, HOLE_RADIUS, YARDS_TO_UNITS } from '../js/physics.js';
import { calculateRecommendedPower, getClub, recommendClub } from '../js/clubs.js';

function makeBall() {
    return {
        position: { x: 0, y: 0.2, z: 0 },
        rotation: { x: 0, y: 0, z: 0 }
    };
}

test('putter power remains player-controlled across the expanded green', () => {
    const softPutt = new BallPhysics(
        { x: 0, y: 0.2, z: 0 },
        0,
        0.2,
        getClub('putter'),
        { direction: 0, speed: 0 },
        { x: 0, y: 0, z: -30 * YARDS_TO_UNITS }
    );

    const firmPutt = new BallPhysics(
        { x: 0, y: 0.2, z: 0 },
        0,
        0.8,
        getClub('putter'),
        { direction: 0, speed: 0 },
        { x: 0, y: 0, z: -30 * YARDS_TO_UNITS }
    );

    assert.ok(Math.abs(softPutt.velocity.z) < Math.abs(firmPutt.velocity.z) * 0.4);
    assert.ok(Math.abs(softPutt.velocity.z) < 0.08);
});

test('expanded green recommends putter from farther out with usable power suggestions', () => {
    assert.equal(recommendClub(40 * YARDS_TO_UNITS), 'putter');
    assert.equal(recommendClub(46 * YARDS_TO_UNITS), 'sandWedge');
    assert.equal(calculateRecommendedPower('putter', 30 * YARDS_TO_UNITS), 70);
});

test('arcade putts roll for several frames instead of stopping abruptly', () => {
    const ball = makeBall();
    const putt = new BallPhysics(
        { x: 0, y: 0.2, z: 0 },
        0,
        0.55,
        getClub('putter'),
        { direction: 0, speed: 0 },
        { x: 0, y: 0, z: -14 * YARDS_TO_UNITS }
    );

    let frames = 0;
    while (frames < 20 && putt.update(ball, null)) {
        frames++;
    }

    assert.equal(putt.isInFlight, true);
    assert.ok(frames >= 20);
});

test('full driver launches with arcade hang-time power', () => {
    const drive = new BallPhysics(
        { x: 0, y: 0.2, z: 0 },
        0,
        1,
        getClub('driver'),
        { direction: 0, speed: 0 },
        { x: 0, y: 0, z: -200 * YARDS_TO_UNITS }
    );

    assert.ok(Math.abs(drive.velocity.z) > 0.9);
    assert.ok(drive.velocity.y > 0.9);
});

test('arcade cup uses a larger matching visual and capture radius', () => {
    assert.equal(HOLE_RADIUS, 0.1875);
    assert.equal(HOLE_RADIUS_VISUAL, HOLE_RADIUS);
});

test('slow putt catches at the enlarged cup edge', () => {
    const ball = makeBall();
    ball.position.x = HOLE_RADIUS * 0.98;
    ball.position.z = 0;
    ball.position.y = 0.08;

    const putt = new BallPhysics(
        { x: ball.position.x, y: ball.position.y, z: ball.position.z },
        0,
        0.05,
        getClub('putter'),
        { direction: 0, speed: 0 },
        { x: 0, y: 0, z: 0 }
    );
    putt.velocity = { x: 0, y: 0, z: 0.01 };

    assert.equal(putt.update(ball, null), true);
    assert.equal(putt.inHole, true);
});
