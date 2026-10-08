import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';

import * as Camera from '../js/camera.js';
import * as GameState from '../js/gameState.js';

function onScreen(camera, x, y, z) {
    camera.updateMatrixWorld();
    const projected = new THREE.Vector3(x, y, z).project(camera);
    return Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1 && projected.z < 1;
}

function setupTee() {
    const camera = new THREE.PerspectiveCamera(60, 1669 / 1320, 0.1, 1000);
    Camera.initCamera(camera);
    const ball = new THREE.Object3D();
    ball.position.set(0, 0.1, 0);
    const arrow = new THREE.Object3D();
    arrow.position.set(0, 0.3, -1.5);
    GameState.initGameState({}, ball, arrow);
    return { camera, ball, arrow };
}

test('a new hole frames the ball and aim arrow from behind the tee', () => {
    const { camera, ball, arrow } = setupTee();

    GameState.setHoleData({ position: { x: 3, y: 0, z: -302 }, par: 5, distance: 605 });

    assert.ok(onScreen(camera, ball.position.x, ball.position.y, ball.position.z), 'ball must be visible');
    assert.ok(onScreen(camera, arrow.position.x, arrow.position.y, arrow.position.z), 'aim arrow must be visible');
    assert.equal(Camera.getCameraState().mode, 'aiming');
});

test('the next hole also starts from the behind-the-ball view', () => {
    const { camera, ball } = setupTee();
    GameState.setHoleData({ position: { x: 0, y: 0, z: -100 }, par: 3, distance: 200 });

    GameState.nextHole();
    GameState.setHoleData({ position: { x: -4, y: 0, z: -220 }, par: 4, distance: 440 });

    assert.ok(onScreen(camera, ball.position.x, ball.position.y, ball.position.z));
});

test('the page has no fake 2D flag or direction line overlays', async () => {
    const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    assert.doesNotMatch(html, /id="target-flag"/);
    assert.doesNotMatch(html, /id="direction-indicator"/);
});

test('the instructions bar sits below the club bar instead of under it', async () => {
    const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');
    const infoTop = Number(css.match(/#info\s*\{[^}]*top:\s*(\d+)px/)[1]);
    const clubTop = Number(css.match(/#club-select\s*\{[^}]*top:\s*(\d+)px/)[1]);
    assert.ok(infoTop >= clubTop + 36, `#info top ${infoTop}px must clear #club-select at ${clubTop}px`);
});
