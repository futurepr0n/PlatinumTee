import test from 'node:test';
import assert from 'node:assert/strict';

import { TurnManager } from '../../js/net/TurnManager.js';

const HOLE = { hole: 1, par: 4, position: { x: 0, y: 0, z: -100 }, tee: { x: 0, y: 0.2, z: 0 } };

function setup(names = ['a', 'b'], options) {
    const turns = new TurnManager(options);
    turns.syncRoster(names.map(id => ({ id, name: id.toUpperCase(), connected: true })));
    turns.startHole(HOLE);
    return turns;
}

test('everyone tees off in join order, then the farthest ball plays', () => {
    const turns = setup();
    assert.equal(turns.advance().id, 'a');
    turns.recordShot('a', { ball: { x: 0, y: 0, z: -80 }, strokes: 1, holed: false });
    assert.equal(turns.advance().id, 'b');
    turns.recordShot('b', { ball: { x: 0, y: 0, z: -60 }, strokes: 1, holed: false });
    assert.equal(turns.advance().id, 'b');
});

test('recordShot ignores players who are not on the tee', () => {
    const turns = setup();
    turns.advance();
    assert.equal(turns.recordShot('b', { ball: { x: 0, y: 0, z: -99 }, strokes: 1, holed: true }), false);
});

test('hole completes when every connected player holes out or hits the stroke cap', () => {
    const turns = setup(['a', 'b'], { maxStrokes: 2 });
    turns.advance();
    turns.recordShot('a', { ball: HOLE.position, strokes: 1, holed: true });
    turns.advance();
    turns.recordShot('b', { ball: { x: 0, y: 0, z: -50 }, strokes: 1, holed: false });
    assert.equal(turns.isHoleComplete(), false);
    turns.advance();
    turns.recordShot('b', { ball: { x: 0, y: 0, z: -60 }, strokes: 2, holed: false });
    assert.equal(turns.isHoleComplete(), true);
    assert.equal(turns.advance(), null);

    turns.finishHole();
    assert.deepEqual(turns.standings().map(({ id, total, toPar }) => ({ id, total, toPar })), [
        { id: 'a', total: 1, toPar: -3 },
        { id: 'b', total: 2, toPar: -2 }
    ]);
});

test('disconnected players are skipped and an empty room never completes the hole', () => {
    const turns = setup();
    turns.syncRoster([{ id: 'a', name: 'A', connected: false }]);
    assert.equal(turns.advance().id, 'b');

    turns.syncRoster([{ id: 'b', name: 'B', connected: false }]);
    assert.equal(turns.advance(), null);
    assert.equal(turns.hasActivePlayers(), false);
    assert.equal(turns.isHoleComplete(), false);
});

test('a player who joins mid-hole gets a tee ball and plays next', () => {
    const turns = setup(['a']);
    turns.advance();
    turns.recordShot('a', { ball: { x: 0, y: 0, z: -90 }, strokes: 1, holed: false });

    turns.syncRoster([{ id: 'c', name: 'C', connected: true }]);
    assert.deepEqual(turns.get('c').ball, HOLE.tee);
    assert.equal(turns.advance().id, 'c');
});
