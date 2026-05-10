import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);

async function readProjectFile(path) {
    return readFile(new URL(path, root), 'utf8');
}

test('index.html places trackball control inside controls after accuracy meter', async () => {
    const html = await readProjectFile('index.html');
    const accuracyIndex = html.indexOf('<div id="accuracy-meter" class="meter">');
    const trackballIndex = html.indexOf('<div id="trackball-control">');
    const swingIndex = html.indexOf('<button id="swing-btn">');

    assert.notEqual(accuracyIndex, -1);
    assert.notEqual(trackballIndex, -1);
    assert.ok(trackballIndex > accuracyIndex);
    assert.ok(trackballIndex < swingIndex);
    assert.match(html, /<div id="trackball-canvas"><\/div>/);
    assert.match(html, /<div id="trackball-guide">Flick forward through the ball<\/div>/);
    assert.match(html, /<div id="trackball-power-preview">Power 0%<\/div>/);
});

test('TrackballControl component renders Three.js control and emits shot requests', async () => {
    const source = await readProjectFile('js/ui/TrackballControl.js');

    assert.match(source, /import \* as THREE from 'three';/);
    assert.match(source, /import \{ eventBus \} from '\.\.\/\.\.\/js\/events\.js';/);
    assert.match(source, /import \{ interpretTrackballGesture \} from '\.\.\/\.\.\/js\/shotControls\/TrackballGesture\.js';/);
    assert.match(source, /new THREE\.WebGLRenderer\(\{ antialias: true, alpha: true \}\)/);
    assert.match(source, /this\.renderer\.setSize\(150, 150\)/);
    assert.match(source, /eventBus\.emit\('trackballShotRequested', result\.intent\)/);
    assert.match(source, /show\(\)/);
    assert.match(source, /hide\(\)/);
    assert.match(source, /reset\(\)/);
});

test('ui.js initializes, toggles, and exports trackball control', async () => {
    const source = await readProjectFile('ui.js');

    assert.match(source, /import \{ TrackballControl \} from '\.\/js\/ui\/TrackballControl\.js';/);
    assert.match(source, /let trackballControl;/);
    assert.match(source, /trackballControl = new TrackballControl\('trackball-control', 'trackball-canvas', 'trackball-power-preview'\);/);
    assert.match(source, /info\.currentControlMode === CONTROL_MODES\.TRACKBALL[\s\S]*trackballControl\.show\(\)/);
    assert.match(source, /trackballControl\.hide\(\)/);
    assert.match(source, /trackballControl\s*\/\/ Export the trackballControl instance/);
});
