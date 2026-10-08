import test from 'node:test';
import assert from 'node:assert/strict';

const frames = new Map();
let nextId = 1;
globalThis.window = { devicePixelRatio: 1, setTimeout, clearTimeout };
globalThis.performance ??= { now: () => Date.now() };
globalThis.requestAnimationFrame = (fn) => { const id = nextId++; frames.set(id, fn); return id; };
globalThis.cancelAnimationFrame = (id) => { frames.delete(id); };
const container = { style: {}, addEventListener() {} };
globalThis.document = { getElementById: id => (id === 'trackball-control' ? container : null) };

const { TrackballControl } = await import('../../js/ui/TrackballControl.js');

function runFrame() {
    const [id, fn] = frames.entries().next().value;
    frames.delete(id);
    fn();
}

test('no render loop runs until the control is shown', () => {
    frames.clear();
    new TrackballControl('trackball-control', 'trackball-canvas', 'trackball-power-preview');
    assert.equal(frames.size, 0);
});

test('show starts exactly one loop and hide stops it', () => {
    frames.clear();
    const control = new TrackballControl('trackball-control', 'trackball-canvas', 'trackball-power-preview');

    control.show();
    control.show();
    assert.equal(frames.size, 1);

    runFrame();
    assert.equal(frames.size, 1);

    control.hide();
    assert.equal(frames.size, 0);
});
