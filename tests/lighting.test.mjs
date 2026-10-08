import test from 'node:test';
import assert from 'node:assert/strict';

import { followShadowLight } from '../js/lighting.js';

function vec() {
    return { x: 0, y: 0, z: 0, set(a, b, c) { this.x = a; this.y = b; this.z = c; } };
}

test('shadow light keeps the same offset above the ball', () => {
    let updated = 0;
    const light = { position: vec(), target: { position: vec(), updateMatrixWorld: () => updated++ } };

    followShadowLight(light, { x: 5, y: 0.1, z: -300 });

    assert.deepEqual([light.position.x, light.position.y, light.position.z], [15, 20, -290]);
    assert.deepEqual([light.target.position.x, light.target.position.y, light.target.position.z], [5, 0, -300]);
    assert.equal(updated, 1);
});

test('a missing light is ignored', () => {
    assert.doesNotThrow(() => followShadowLight(null, { x: 0, y: 0, z: 0 }));
});
