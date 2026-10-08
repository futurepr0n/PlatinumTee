import test from 'node:test';
import assert from 'node:assert/strict';

import * as Course from '../js/course.js';

function trackingScene() {
    const objects = new Set();
    return {
        objects,
        add(object) { objects.add(object); },
        remove(object) { objects.delete(object); }
    };
}

function disposedFlag(resource) {
    const state = { disposed: false };
    resource.addEventListener('dispose', () => { state.disposed = true; });
    return state;
}

test('replacing a hole frees the old hole meshes but keeps shared decor resources', () => {
    const scene = trackingScene();
    Course.initCourse(scene);
    Course.generateNewHole();

    const first = [...scene.objects];
    const treeMeshes = first.filter(o => o.geometry?.type === 'ConeGeometry');
    assert.ok(treeMeshes.length > 1);
    assert.ok(treeMeshes.every(o => o.geometry === treeMeshes[0].geometry));

    const uniqueGeometries = first
        .filter(o => (['CylinderGeometry', 'PlaneGeometry'].includes(o.geometry?.type) && o.geometry.parameters?.radiusTop !== 0.2)
            || (o.geometry?.type === 'CircleGeometry' && o.geometry.parameters?.radius !== 1))
        .map(o => ({ o, flag: disposedFlag(o.geometry) }));
    const sharedFlag = disposedFlag(treeMeshes[0].geometry);

    Course.generateNewHole();

    assert.ok(uniqueGeometries.length >= 4);
    assert.ok(uniqueGeometries.every(({ flag }) => flag.disposed));
    assert.equal(sharedFlag.disposed, false);
    assert.ok(uniqueGeometries.every(({ o }) => !scene.objects.has(o)));
});
