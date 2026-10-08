import test from 'node:test';
import assert from 'node:assert/strict';

import { disposeObject } from '../../js/utils/dispose.js';

function resource() {
    return { disposed: 0, dispose() { this.disposed++; } };
}

test('disposeObject removes the mesh and frees its own geometry and materials', () => {
    const removed = [];
    const scene = { remove: object => removed.push(object) };
    const mesh = { geometry: resource(), material: [resource(), resource()] };

    disposeObject(scene, mesh);

    assert.deepEqual(removed, [mesh]);
    assert.equal(mesh.geometry.disposed, 1);
    assert.deepEqual(mesh.material.map(m => m.disposed), [1, 1]);
});

test('shared geometry and materials are left alone', () => {
    const scene = { remove() {} };
    const sharedGeometry = resource();
    const sharedMaterial = resource();
    const mesh = { geometry: sharedGeometry, material: sharedMaterial };

    disposeObject(scene, mesh, new Set([sharedGeometry, sharedMaterial]));

    assert.equal(sharedGeometry.disposed, 0);
    assert.equal(sharedMaterial.disposed, 0);
});

test('null objects are ignored', () => {
    assert.doesNotThrow(() => disposeObject({ remove() {} }, null));
});
