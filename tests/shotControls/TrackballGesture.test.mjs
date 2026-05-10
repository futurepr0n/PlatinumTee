import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretTrackballGesture } from '../../js/shotControls/TrackballGesture.js';

test('interpretTrackballGesture rejects tiny gestures', () => {
    const result = interpretTrackballGesture([
        { x: 100, y: 100, t: 0 },
        { x: 106, y: 96, t: 80 }
    ]);

    assert.equal(result.valid, false);
    assert.equal(result.reason, 'gesture-too-small');
});

test('interpretTrackballGesture converts a forward flick into a trackball shot intent', () => {
    const result = interpretTrackballGesture([
        { x: 150, y: 260, t: 0 },
        { x: 154, y: 190, t: 60 },
        { x: 160, y: 110, t: 130 }
    ]);

    assert.equal(result.valid, true);
    assert.equal(result.intent.source, 'trackball');
    assert.ok(result.intent.power > 0.45);
    assert.ok(result.intent.power <= 1);
    assert.ok(result.intent.accuracy > 0.85);
    assert.ok(result.intent.directionOffset > 0);
});

test('interpretTrackballGesture maps side exit angle into curve and direction offset', () => {
    const result = interpretTrackballGesture([
        { x: 150, y: 260, t: 0 },
        { x: 190, y: 180, t: 70 },
        { x: 235, y: 95, t: 140 }
    ]);

    assert.equal(result.valid, true);
    assert.ok(result.intent.directionOffset > 10);
    assert.ok(result.intent.curve > 0.4);
    assert.ok(result.intent.accuracy < 0.9);
});
