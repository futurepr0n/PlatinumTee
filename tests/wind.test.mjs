import test from 'node:test';
import assert from 'node:assert/strict';

import { rollHoleWind, gustWind, WIND_LIMITS } from '../js/wind.js';

function sequence(values) {
    let index = 0;
    return () => values[index++ % values.length];
}

test('hole wind stays inside limits and covers calm, breezy and windy', () => {
    const speeds = [];
    for (let i = 0; i < 2000; i++) {
        const wind = rollHoleWind();
        assert.ok(Number.isInteger(wind.direction) && wind.direction >= 0 && wind.direction < 360);
        assert.ok(Number.isInteger(wind.speed) && wind.speed >= 0 && wind.speed <= WIND_LIMITS.maxSpeed);
        speeds.push(wind.speed);
    }
    assert.ok(speeds.some(s => s <= 3));
    assert.ok(speeds.some(s => s >= 4 && s <= 11));
    assert.ok(speeds.some(s => s >= 12));
});

test('consecutive holes get noticeably different wind', () => {
    let previous = rollHoleWind();
    for (let i = 0; i < 500; i++) {
        const next = rollHoleWind(previous);
        const turn = Math.abs(((next.direction - previous.direction + 540) % 360) - 180);
        assert.ok(turn >= 45 || Math.abs(next.speed - previous.speed) >= 5, JSON.stringify({ previous, next }));
        previous = next;
    }
});

test('gusts vary speed by at most 25 % and direction by at most 15 degrees', () => {
    const base = { direction: 350, speed: 12 };
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
        const gust = gustWind(base, sequence([r, r]));
        assert.ok(gust.speed >= 9 && gust.speed <= 15, `speed ${gust.speed}`);
        const turn = Math.abs(((gust.direction - base.direction + 540) % 360) - 180);
        assert.ok(turn <= 15, `turn ${turn}`);
        assert.ok(gust.direction >= 0 && gust.direction < 360);
    }
    assert.deepEqual(gustWind({ direction: 90, speed: 0 }, sequence([0.9, 0.9])).speed, 0);
});
