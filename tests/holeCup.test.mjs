import test from 'node:test';
import assert from 'node:assert/strict';

import * as Course from '../js/course.js';

test('the cup is a flat dark disc sitting just above the green surface', () => {
    const added = [];
    Course.initCourse({ add: object => added.push(object), remove() {} });
    Course.createHole({ x: 2, z: -120 }, 4, 300);

    const cup = added.find(o => o.geometry?.type === 'CircleGeometry' && o.geometry.parameters.radius === Course.HOLE_RADIUS_VISUAL);
    const green = added.find(o => o.geometry?.type === 'CircleGeometry' && o.geometry.parameters.radius > 5);

    assert.ok(cup, 'cup should be a flat circle, not a cylinder');
    assert.equal(cup.rotation.x, -Math.PI / 2);
    assert.ok(cup.position.y > green.position.y, 'cup must render above the green to avoid z-fighting');
    assert.ok(cup.position.y - green.position.y < 0.01, 'cup must be flush with the green');
    assert.ok(!added.some(o => o.geometry?.type === 'CylinderGeometry' && o.geometry.parameters.radiusTop === Course.HOLE_RADIUS_VISUAL));
});
