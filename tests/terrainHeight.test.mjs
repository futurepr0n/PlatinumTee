import test from 'node:test';
import assert from 'node:assert/strict';

import { hillHeightAt } from '../js/course.js';
import { BallPhysics } from '../js/physics.js';
import { getClub } from '../js/clubs.js';

const HILL = { position: { x: 10, y: -5, z: -100 }, radius: 30, scaleY: 0.2 };

test('hill height follows the visible flattened hemisphere', () => {
    assert.ok(Math.abs(hillHeightAt(HILL, 10, -100) - 1) < 1e-9);
    const groundEdge = Math.sqrt(30 * 30 - 25 * 25);
    assert.ok(Math.abs(hillHeightAt(HILL, 10 + groundEdge, -100)) < 1e-9);
    assert.equal(hillHeightAt(HILL, 10 + 20, -100), 0);
    assert.equal(hillHeightAt(HILL, 10 + 31, -100), 0);
});

test('ball physics asks the terrain for its height', () => {
    const physics = new BallPhysics({ x: 0, y: 0.1, z: 0 }, 0, 0.5, getClub('iron7'));
    const terrain = { getHeightAt: (x, z) => x + z };
    assert.equal(physics.getTerrainHeightAt(2, 3, terrain), 5);
    assert.equal(physics.getTerrainHeightAt(2, 3, null), 0);
    assert.equal(physics.getTerrainHeightAt(2, 3, {}), 0);
});
