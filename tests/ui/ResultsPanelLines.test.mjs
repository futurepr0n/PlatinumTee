import test from 'node:test';
import assert from 'node:assert/strict';

import { buildResultLines } from '../../js/ui/ResultsPanel.js';

const base = { power: 0.5, accuracy: 0.5, direction: 0, wind: { speed: 12 } };

test('results list the wind for full shots', () => {
    const lines = buildResultLines({ ...base, club: 'driver' }, 200, 1, 0);
    assert.ok(lines.includes('Wind: 12 mph'));
});

test('results omit the wind for putts', () => {
    const lines = buildResultLines({ ...base, club: 'putter' }, 5, 2, 0);
    assert.ok(!lines.some(line => line.startsWith('Wind')));
});
