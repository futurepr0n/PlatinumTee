import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('GameManager only starts a host session when ?host is present', async () => {
    const source = await readFile(new URL('../../js/gameManager.js', import.meta.url), 'utf8');
    assert.match(source, /new URLSearchParams\(window\.location\.search\)\.has\('host'\)/);
    assert.match(source, /new HostSession\(/);
});

test('remote rounds block control-mode cycling and the single-player results panel', async () => {
    const source = await readFile(new URL('../../js/gameManager.js', import.meta.url), 'utf8');
    const modeHandler = source.slice(source.indexOf("'controlModeChangeRequested'"));
    assert.match(modeHandler.slice(0, 200), /acceptsLocalInput\(\)/);
    const holeHandler = source.slice(source.indexOf('handleHoleComplete(scoreName'));
    assert.match(holeHandler.slice(0, 200), /if \(this\.hostSession\) return;/);
});

test('LobbyPanel renders player names with textContent only', async () => {
    const source = await readFile(new URL('../../js/ui/LobbyPanel.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /innerHTML/);
    assert.match(source, /textContent/);
});

test('every host-local gameplay request handler routes through acceptsLocalInput', async () => {
    const source = await readFile(new URL('../../js/gameManager.js', import.meta.url), 'utf8');
    const from = source.indexOf('setupUIEventListeners() {');
    const body = source.slice(from, source.indexOf('handleStateChange(oldState', from));
    assert.match(body, /const acceptsLocalInput = \(\) => !this\.hostSession && Controls\.areControlsEnabled\(\);/);
    const events = ['swingButtonClicked', 'powerButtonClicked', 'accuracyButtonClicked', 'nextHoleButtonClicked',
        'adjustDirectionRequested', 'clubSelected', 'controlModeChangeRequested', 'trackballShotRequested',
        'simulateSpecificButtonPressRequested'];
    for (const name of events) {
        const start = body.indexOf(`eventBus.on('${name}'`);
        assert.notEqual(start, -1, name);
        const handler = body.slice(start, start + 220);
        assert.match(handler, /if \(!acceptsLocalInput\(\)\) return;/, name);
    }
    assert.doesNotMatch(body, /Controls\.areControlsEnabled\(\)\) return/);
});
