import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function readProjectFile(path) {
    return readFile(new URL(path, root), 'utf8');
}

test('game manager wires selectable shot control events into game state', async () => {
    const source = await readProjectFile('js/gameManager.js');

    assert.match(source, /eventBus\.on\('controlModeChangeRequested', \(controlMode\) => \{[\s\S]*Controls\.areControlsEnabled\(\)[\s\S]*GameState\.setControlMode\(controlMode\);[\s\S]*\}\);/);
    assert.match(source, /eventBus\.on\('trackballShotRequested', \(intent\) => \{[\s\S]*Controls\.areControlsEnabled\(\)[\s\S]*GameState\.takeShotFromIntent\(intent\);[\s\S]*\}\);/);
});

test('keyboard controls cycle control modes with M', async () => {
    const source = await readProjectFile('js/controls.js');

    assert.match(source, /import \{ getNextControlMode \} from '\.\/shotControls\/controlModes\.js';/);
    assert.doesNotMatch(source, /import \{ powerMeter, accuracyMeter,/);
    assert.match(source, /case 'm':[\s\S]*case 'M':[\s\S]*eventBus\.emit\('controlModeChangeRequested', getNextControlMode\(GameState\.getControlMode\(\)\)\);[\s\S]*break;/);
});

test('keyboard advance emits the game manager button simulation event', async () => {
    const controlsSource = await readProjectFile('js/controls.js');
    const gameManagerSource = await readProjectFile('js/gameManager.js');

    assert.doesNotMatch(controlsSource, /simulateButtonPressRequested/);
    assert.match(controlsSource, /eventBus\.emit\('simulateSpecificButtonPressRequested'\)/);
    assert.match(gameManagerSource, /eventBus\.on\('simulateSpecificButtonPressRequested'/);
});
