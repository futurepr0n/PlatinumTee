import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import * as Camera from '../js/camera.js';

function relativeToPath(camera, ball, heading) {
    const offX = camera.position.x - ball.x;
    const offZ = camera.position.z - ball.z;
    return {
        along: offX * heading.x + offZ * heading.z,
        sideways: offX * -heading.z + offZ * heading.x
    };
}

function headingFor(degrees) {
    const radians = degrees * Math.PI / 180;
    return { x: Math.sin(radians), z: -Math.cos(radians) };
}

function fly(directionDegrees, stepFor) {
    const camera = new THREE.PerspectiveCamera(60, 1.6, 0.1, 1000);
    Camera.initCamera(camera);
    const ball = { x: 0, y: 0.1, z: 0 };
    Camera.setFollowMode(ball, directionDegrees);
    for (let i = 1; i <= 300; i++) {
        const step = stepFor(i);
        ball.x += step.x;
        ball.z += step.z;
        ball.y = Math.max(0.1, 10 * Math.sin(Math.PI * i / 300));
        Camera.updateCamera(ball);
    }
    return { camera, ball };
}

for (const direction of [0, 30, -45]) {
    test(`camera chases directly behind a ball flying ${direction} degrees`, () => {
        const heading = headingFor(direction);
        const { camera, ball } = fly(direction, () => ({ x: heading.x * 0.4, z: heading.z * 0.4 }));
        const { along, sideways } = relativeToPath(camera, ball, heading);

        assert.ok(along < -4, `camera should be behind the ball (along ${along})`);
        assert.ok(Math.abs(sideways) < 0.5, `camera should be on the path line (sideways ${sideways})`);
    });
}

test('camera turns with a curving ball instead of keeping the launch line', () => {
    let angle = 0;
    const { camera, ball } = fly(0, () => {
        angle += 0.15;
        const heading = headingFor(angle);
        return { x: heading.x * 0.4, z: heading.z * 0.4 };
    });
    const finalHeading = headingFor(angle);
    const { along, sideways } = relativeToPath(camera, ball, finalHeading);

    assert.ok(along < -4, `along ${along}`);
    assert.ok(Math.abs(sideways) < 1.5, `sideways ${sideways} after curving ${angle.toFixed(0)} degrees`);
});

test('the camera never dips below head height above the ground', () => {
    const heading = headingFor(0);
    const { camera } = fly(0, () => ({ x: heading.x * 0.4, z: heading.z * 0.4 }));
    assert.ok(camera.position.y >= 1);
});
