import test from 'node:test';
import assert from 'node:assert/strict';

import * as GameState from '../js/gameState.js';
import { eventBus } from '../js/events.js';
import { CONTROL_MODES } from '../js/shotControls/controlModes.js';

function makeVector(x = 0, y = 0.1, z = 0) {
    return { x, y, z, set(a, b, c) { this.x = a; this.y = b; this.z = c; } };
}

test('each new hole announces a different wind and each shot records its gust', () => {
    const ball = { position: makeVector(), rotation: makeVector(0, 0, 0) };
    const arrow = { position: makeVector(0, 0.3, -1.5), rotation: makeVector(0, 0, 0), visible: true };
    const winds = [];
    const listener = data => winds.push({ ...data.windData });
    eventBus.on('windDataUpdated', listener);

    GameState.initGameState({}, ball, arrow);
    GameState.generateWind();
    GameState.generateWind();
    eventBus.off('windDataUpdated', listener);

    const [a, b] = winds.slice(-2);
    const turn = Math.abs(((b.direction - a.direction + 540) % 360) - 180);
    assert.ok(turn >= 45 || Math.abs(b.speed - a.speed) >= 5);

    GameState.setHoleData({ position: { x: 0, y: 0, z: -100 }, par: 4, distance: 200 });
    GameState.setControlMode(CONTROL_MODES.TRACKBALL);
    GameState.takeShotFromIntent({ source: CONTROL_MODES.TRACKBALL, power: 0.5 });
    const shotWind = GameState.getShotInfo().wind;
    assert.equal(typeof shotWind.speed, 'number');
    assert.ok(Math.abs(shotWind.speed - b.speed) <= b.speed * 0.25 + 0.05);
});
