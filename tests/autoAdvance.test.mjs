import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createAutoAdvance, HOLE_AUTO_ADVANCE_MS } from '../js/autoAdvance.js';
import { HostSession } from '../js/net/HostSession.js';
import { MSG, encode } from '../js/net/protocol.js';

function fakeTimers() {
    const pending = new Map();
    let nextId = 1;
    return {
        pending,
        setTimer: (fn, ms) => { const id = nextId++; pending.set(id, { fn, ms }); return id; },
        clearTimer: id => pending.delete(id),
        fire() { const [id, { fn }] = pending.entries().next().value; pending.delete(id); fn(); }
    };
}

test('auto advance fires once after the delay and can be cancelled', () => {
    const timers = fakeTimers();
    let advanced = 0;
    const auto = createAutoAdvance({ onAdvance: () => advanced++, setTimer: timers.setTimer, clearTimer: timers.clearTimer });

    auto.schedule();
    auto.schedule();
    assert.equal(timers.pending.size, 1);
    assert.equal([...timers.pending.values()][0].ms, HOLE_AUTO_ADVANCE_MS);
    timers.fire();
    assert.equal(advanced, 1);

    auto.schedule();
    auto.cancel();
    assert.equal(timers.pending.size, 0);
    assert.equal(advanced, 1);
});

test('single player shows the next-hole button, auto-advances, and hides results when moving on', async () => {
    const manager = await readFile(new URL('../js/gameManager.js', import.meta.url), 'utf8');
    const results = await readFile(new URL('../js/ui/ResultsPanel.js', import.meta.url), 'utf8');

    const holeHandler = manager.slice(manager.indexOf('handleHoleComplete(scoreName'));
    assert.match(holeHandler.slice(0, 900), /this\.autoAdvance\.schedule\(\)/);
    const nextHandler = manager.slice(manager.indexOf("eventBus.on('nextHoleButtonClicked'"));
    assert.match(nextHandler.slice(0, 700), /this\.autoAdvance\.cancel\(\)/);
    assert.match(nextHandler.slice(0, 700), /UI\.resultsPanel\.hide\(\)/);
    const display = results.slice(results.indexOf('displayResults('));
    assert.match(display.slice(0, 900), /next-hole-btn/);
});

function hostWithTimers() {
    const timers = fakeTimers();
    const handlers = {};
    const bus = { on(e, f) { (handlers[e] ??= []).push(f); }, emit(e, d) { (handlers[e] ?? []).forEach(f => f(d)); } };
    let snapshot = { x: 0, y: 0.1, z: 0, strokes: 0, holed: false };
    let holes = 1;
    const game = {
        setControlMode: () => true,
        loadBallSnapshot: s => { snapshot = { ...snapshot, ...s, holed: false }; return true; },
        takeShotFromIntent: () => true,
        getBallSnapshot: () => ({ ...snapshot }),
        nextHole: () => holes++ < 9,
        land: s => { snapshot = { ...snapshot, ...s }; }
    };
    const session = new HostSession({
        socket: { send() {} },
        game,
        bus,
        requestNewHole: () => bus.emit('holeDataUpdated', { holeData: { currentHole: holes, par: 4, position: { x: 0, y: 0, z: -100 } } }),
        setTimer: timers.setTimer,
        clearTimer: timers.clearTimer
    });
    bus.emit('holeDataUpdated', { holeData: { currentHole: 1, par: 4, position: { x: 0, y: 0, z: -100 } } });
    session.handleMessage(encode(MSG.ROOM_PLAYERS, { players: [{ id: 'a', name: 'Ann', connected: true }] }));
    session.startRound();
    return { session, game, bus, timers };
}

test('the host moves to the next hole automatically after everyone holes out', async () => {
    const { session, game, bus, timers } = hostWithTimers();

    session.handleMessage(encode(MSG.PLAYER_SHOT, { playerId: 'a', intent: { power: 1 } }));
    game.land({ x: 0, z: -100, strokes: 1, holed: true });
    bus.emit('holeComplete', {});
    await Promise.resolve();

    assert.equal(session.phase, 'hole-complete');
    assert.equal(timers.pending.size, 1);
    timers.fire();
    assert.equal(session.phase, 'aiming');
    assert.equal(session.view().players.length, 1);
});

test('pressing NEXT HOLE on the host cancels the pending automatic advance', async () => {
    const { session, game, bus, timers } = hostWithTimers();

    session.handleMessage(encode(MSG.PLAYER_SHOT, { playerId: 'a', intent: { power: 1 } }));
    game.land({ x: 0, z: -100, strokes: 1, holed: true });
    bus.emit('holeComplete', {});
    await Promise.resolve();

    session.nextHole();
    assert.equal(timers.pending.size, 0);
    assert.equal(session.phase, 'aiming');
});
