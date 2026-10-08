import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as GameState from '../js/gameState.js';

const src = readFileSync(new URL('../js/gameManager.js', import.meta.url), 'utf8');

test('getTotalHoles returns the configured round length', () => {
    assert.equal(GameState.getTotalHoles(), 9);
});

test('keyboard handler compares against GameState.GameState enum', () => {
    for (const k of ['AIMING', 'POWER', 'ACCURACY', 'COMPLETE']) {
        assert.ok(src.includes(`gameState === GameState.GameState.${k}`), k);
        assert.ok(!src.includes(`gameState === GameState.${k}`), `bare ${k}`);
    }
});

test('new round redraws scorecard with total holes', () => {
    const m = src.match(/if \(this\.roundSummaryShown\) \{[\s\S]*?return;/);
    assert.match(m[0], /updateScoreCard\(GameState\.getScoreCard\(\), GameState\.getTotalHoles\(\)\)/);
    assert.match(src, /updateScoreCard\(scoreCard, GameState\.getTotalHoles\(\)\)/);
});

test('OOB toast skipped at stroke cap', () => {
    assert.match(src, /import \{ MAX_STROKES_PER_HOLE \} from '\.\/rules\.js'/);
    assert.match(src, /data\.strokes < MAX_STROKES_PER_HOLE/);
});
