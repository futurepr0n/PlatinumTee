import test from 'node:test';
import assert from 'node:assert/strict';

import { getCameraState, initCamera, setShotSetupMode } from '../js/camera.js';

function makeCamera() {
    return {
        position: {
            x: 0,
            y: 0,
            z: 0,
            set(x, y, z) {
                this.x = x;
                this.y = y;
                this.z = z;
            }
        },
        lookAt(x, y, z) {
            this.lookAtTarget = { x, y, z };
        }
    };
}

test('putter setup uses lower putting camera mode', () => {
    const camera = makeCamera();
    initCamera(camera);

    setShotSetupMode(
        { x: 0, y: 0.2, z: 0 },
        0,
        'putter',
        { x: 0, y: 0, z: -15 }
    );

    assert.equal(getCameraState().mode, 'putting');
    assert.ok(camera.position.y < 2);
});

test('non-putter setup keeps regular aiming camera mode', () => {
    const camera = makeCamera();
    initCamera(camera);

    setShotSetupMode(
        { x: 0, y: 0.2, z: 0 },
        0,
        'driver',
        { x: 0, y: 0, z: -150 }
    );

    assert.equal(getCameraState().mode, 'aiming');
    assert.ok(camera.position.y > 3);
});
