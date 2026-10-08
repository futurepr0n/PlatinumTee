import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createClassicShotIntent,
    normalizeShotIntent
} from '../../js/shotControls/ShotIntent.js';

test('normalizeShotIntent clamps numeric fields and preserves source', () => {
    const intent = normalizeShotIntent({
        directionOffset: 90,
        power: 2,
        accuracy: -1,
        curve: 5,
        spin: -4,
        launchModifier: 3,
        source: 'trackball'
    });

    assert.deepEqual(intent, {
        directionOffset: 45,
        power: 1,
        accuracy: 0,
        curve: 1,
        spin: -1,
        launchModifier: 2,
        source: 'trackball'
    });
});

test('createClassicShotIntent uses classic meter defaults', () => {
    const intent = createClassicShotIntent({
        directionOffset: -12,
        power: 0.64,
        accuracy: 0.52
    });

    assert.deepEqual(intent, {
        directionOffset: -12,
        power: 0.64,
        accuracy: 0.52,
        curve: 0,
        spin: 0,
        launchModifier: 1,
        source: 'classic-meter'
    });
});
