import test from 'node:test';
import assert from 'node:assert/strict';

import { isOutOfBounds, MAX_STROKES_PER_HOLE } from '../js/rules.js';

test('out of bounds is anything off the 200 x 1000 ground plane', () => {
    assert.equal(isOutOfBounds({ x: 0, z: 0 }), false);
    assert.equal(isOutOfBounds({ x: 99.9, z: -499.9 }), false);
    assert.equal(isOutOfBounds({ x: 100.1, z: 0 }), true);
    assert.equal(isOutOfBounds({ x: -100.1, z: 0 }), true);
    assert.equal(isOutOfBounds({ x: 0, z: -500.1 }), true);
    assert.equal(isOutOfBounds({ x: 0, z: 500.1 }), true);
    assert.equal(MAX_STROKES_PER_HOLE, 10);
});
