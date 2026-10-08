import test from 'node:test';
import assert from 'node:assert/strict';

import { BallPhysics } from '../js/physics.js';
import { getClub } from '../js/clubs.js';

const CALM = { direction: 0, speed: 0 };

function playOut(club, power, spin) {
    const physics = new BallPhysics({ x: 0, y: 0.1, z: 0 }, 0, power, getClub(club), CALM, { x: 0, y: 0, z: -500 }, spin);
    const ball = { position: { x: 0, y: 0.1, z: 0 }, rotation: { x: 0, y: 0, z: 0 } };
    let landing = null;
    let frames = 0;
    while (physics.update(ball, null) && frames++ < 5000) {
        if (!landing && ball.position.y <= 0.1001) landing = { ...ball.position };
    }
    return { landing, rest: { ...ball.position } };
}

test('no spin flies dead straight in calm air', () => {
    const { rest } = playOut('driver', 0.8, { side: 0, back: 0 });
    assert.equal(rest.x, 0);
});

test('positive sidespin fades right and negative draws left, symmetrically', () => {
    const fade = playOut('driver', 0.8, { side: 0.3, back: 0 }).landing;
    const draw = playOut('driver', 0.8, { side: -0.3, back: 0 }).landing;
    assert.ok(fade.x > 0 && draw.x < 0);
    assert.ok(Math.abs(fade.x + draw.x) < 1e-9);
});

test('the bend grows through the flight instead of being a straight angled line', () => {
    const physics = new BallPhysics({ x: 0, y: 0.1, z: 0 }, 0, 0.8, getClub('driver'), CALM, null, { side: 0.5, back: 0 });
    const ball = { position: { x: 0, y: 0.1, z: 0 }, rotation: { x: 0, y: 0, z: 0 } };
    const samples = [];
    while (ball.position.y > 0.1001 || samples.length === 0) {
        physics.update(ball, null);
        samples.push({ ...ball.position });
        if (samples.length > 3000) break;
    }
    const mid = samples[Math.floor(samples.length / 2)];
    const end = samples[samples.length - 1];
    assert.ok(end.x / -end.z > (mid.x / -mid.z) * 1.3, 'path must curve, not just start offline');
});

test('even a maximum slice off a full drive stays inside the 200-wide course', () => {
    const { rest } = playOut('driver', 1, { side: 1, back: 0 });
    assert.ok(Math.abs(rest.x) < 100, `ended at x ${rest.x}`);
    const meaningful = playOut('driver', 1, { side: 1, back: 0 }).landing;
    assert.ok(meaningful.x * 2 >= 25, `max slice should move at least 25 yd (got ${meaningful.x * 2})`);
});

test('backspin checks up the roll without changing carry', () => {
    const low = playOut('pitchingWedge', 0.8, { side: 0, back: 0 });
    const high = playOut('pitchingWedge', 0.8, { side: 0, back: 1 });
    const lowRoll = low.landing.z - low.rest.z;
    const highRoll = high.landing.z - high.rest.z;
    assert.equal(low.landing.z, high.landing.z);
    assert.ok(highRoll < lowRoll * 0.75, `roll ${highRoll} vs ${lowRoll}`);
});

test('sidespin adds only a small kick on landing, then the ball rolls along its line', () => {
    const { landing, rest } = playOut('iron7', 0.7, { side: 0.4, back: 0 });
    const groundDrift = rest.x - landing.x;
    const roll = landing.z - rest.z;
    assert.ok(groundDrift >= 0, 'kick follows the spin direction');
    assert.ok(groundDrift <= roll * 0.35, `ground drift ${groundDrift} over roll ${roll}`);
});

test('the putter ignores spin', () => {
    const putt = playOut('putter', 0.5, { side: 1, back: 1 });
    assert.equal(putt.rest.x, 0);
});
