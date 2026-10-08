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

test('interpretTrackballGesture rejects malformed gesture points', () => {
    const result = interpretTrackballGesture([
        { x: 150, y: 260, t: 0 },
        { x: Number.NaN, y: 120, t: 90 }
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
    assert.equal(result.intent.power, 1);
    assert.ok(result.intent.power <= 1);
    assert.equal(result.intent.accuracy, 0.5);
    assert.equal(result.intent.directionOffset, 0);
    assert.equal(result.intent.curve, 0);
});

test('interpretTrackballGesture calibrates modest cabinet motion above raw power', () => {
    const result = interpretTrackballGesture([
        { x: 150, y: 260, t: 0 },
        { x: 150, y: 285, t: 90 },
        { x: 150, y: 250, t: 160 },
        { x: 150, y: 230, t: 250 }
    ]);

    assert.equal(result.valid, true);
    assert.ok(result.metrics.rawPower < 0.33);
    assert.ok(result.intent.power > 0.6);
    assert.ok(result.metrics.calibratedPower > result.metrics.rawPower * 2);
});

test('interpretTrackballGesture keeps small side drift neutral for straight shots', () => {
    const result = interpretTrackballGesture([
        { x: 150, y: 260, t: 0 },
        { x: 156, y: 330, t: 80 },
        { x: 159, y: 210, t: 145 },
        { x: 161, y: 115, t: 210 }
    ]);

    assert.equal(result.valid, true);
    assert.equal(result.intent.accuracy, 0.5);
    assert.equal(result.intent.directionOffset, 0);
    assert.equal(result.intent.curve, 0);
});

test('interpretTrackballGesture rewards rollback charge before the forward strike', () => {
    const noRollback = interpretTrackballGesture([
        { x: 150, y: 260, t: 0 },
        { x: 150, y: 215, t: 70 },
        { x: 150, y: 170, t: 145 }
    ]);

    const withRollback = interpretTrackballGesture([
        { x: 150, y: 260, t: 0 },
        { x: 148, y: 310, t: 110 },
        { x: 150, y: 235, t: 170 },
        { x: 150, y: 170, t: 235 }
    ]);

    assert.equal(noRollback.valid, true);
    assert.equal(withRollback.valid, true);
    assert.ok(withRollback.intent.power > noRollback.intent.power);
    assert.ok(withRollback.metrics.rollback >= 50);
    assert.ok(withRollback.metrics.rollbackCharge > 0.5);
});

test('interpretTrackballGesture maps side exit angle into curve and direction offset', () => {
    const result = interpretTrackballGesture([
        { x: 150, y: 260, t: 0 },
        { x: 152, y: 330, t: 80 },
        { x: 190, y: 205, t: 140 },
        { x: 235, y: 95, t: 205 }
    ]);

    assert.equal(result.valid, true);
    assert.ok(result.intent.directionOffset > 10);
    assert.ok(result.intent.curve > 0.4);
    assert.equal(result.intent.accuracy, 0.5);
    assert.ok(result.metrics.strikeQuality < 0.9);
});
