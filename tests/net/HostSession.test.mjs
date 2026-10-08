import test from 'node:test';
import assert from 'node:assert/strict';

import { HostSession } from '../../js/net/HostSession.js';
import { MSG, encode } from '../../js/net/protocol.js';
import { CONTROL_MODES } from '../../js/shotControls/controlModes.js';

function fakeBus() {
    const handlers = {};
    return {
        on(event, fn) { (handlers[event] ??= []).push(fn); },
        emit(event, data) { (handlers[event] ?? []).forEach(fn => fn(data)); }
    };
}

function fakeGame() {
    let snapshot = { x: 0, y: 0.1, z: 0, strokes: 0, holed: false };
    return {
        calls: [],
        land(next) { snapshot = { ...snapshot, ...next }; },
        setControlMode(mode) { this.calls.push(['mode', mode]); return true; },
        loadBallSnapshot(next) { this.calls.push(['load', next]); snapshot = { ...snapshot, ...next, holed: false }; return true; },
        takeShotFromIntent(intent) { this.calls.push(['shot', intent]); return true; },
        getBallSnapshot: () => ({ ...snapshot }),
        nextHole: () => true
    };
}

function setup() {
    const sent = [];
    const bus = fakeBus();
    const game = fakeGame();
    const session = new HostSession({
        socket: { send: raw => sent.push(JSON.parse(raw)) },
        game,
        bus,
        requestNewHole: () => bus.emit('holeDataUpdated', { holeData: { currentHole: 2, par: 3, position: { x: 0, y: 0, z: -50 } } })
    });
    bus.emit('holeDataUpdated', { holeData: { currentHole: 1, par: 4, position: { x: 0, y: 0, z: -100 } } });
    const roster = players => session.handleMessage(encode(MSG.ROOM_PLAYERS, { players }));
    const shot = (playerId, intent) => session.handleMessage(encode(MSG.PLAYER_SHOT, { playerId, intent }));
    const lastUpdate = () => sent.filter(m => m.type === MSG.GAME_UPDATE).at(-1)?.payload;
    const finishShot = async (event, landing) => {
        game.land(landing);
        bus.emit(event, {});
        await Promise.resolve();
    };
    return { session, game, sent, roster, shot, lastUpdate, finishShot };
}

const A = { id: 'a', name: 'Ann', connected: true };
const B = { id: 'b', name: 'Bob', connected: true };

test('open asks the server for a room', () => {
    const { session, sent } = setup();
    session.open();
    assert.deepEqual(sent[0], { type: MSG.HOST_CREATE, payload: {} });
});

test('startRound switches to remote control and gives the first player the tee', () => {
    const { session, game, roster, lastUpdate } = setup();
    roster([A, B]);
    assert.equal(session.startRound(), true);

    assert.deepEqual(game.calls[0], ['mode', CONTROL_MODES.REMOTE]);
    assert.equal(game.calls[1][0], 'load');
    assert.equal(lastUpdate().phase, 'aiming');
    assert.equal(lastUpdate().turnPlayerId, 'a');
    assert.equal(lastUpdate().turnPlayerName, 'Ann');
});

test('only the current player can shoot, and garbage intents do not throw', () => {
    const { session, game, roster, shot } = setup();
    roster([A, B]);
    session.startRound();

    shot('b', { power: 1 });
    assert.equal(game.calls.some(([kind]) => kind === 'shot'), false);

    assert.doesNotThrow(() => shot('a', null));
    const fired = game.calls.find(([kind]) => kind === 'shot')[1];
    assert.equal(fired.source, CONTROL_MODES.REMOTE);
    assert.equal(fired.power, 0);
});

test('after a shot lands the next player tees off, and holing out by all ends the hole', async () => {
    const { session, roster, shot, lastUpdate, finishShot } = setup();
    roster([A, B]);
    session.startRound();

    shot('a', { power: 0.8 });
    assert.equal(lastUpdate().phase, 'in-flight');
    await finishShot('holeComplete', { x: 0, z: -100, strokes: 1, holed: true });
    assert.equal(lastUpdate().turnPlayerId, 'b');

    shot('b', { power: 0.8 });
    await finishShot('holeComplete', { x: 0, z: -100, strokes: 1, holed: true });
    assert.equal(lastUpdate().phase, 'hole-complete');
    assert.deepEqual(lastUpdate().standings.map(s => s.toPar), [-3, -3]);
});

test('turn passes on when the current player drops; empty room waits then resumes', () => {
    const { session, roster, lastUpdate } = setup();
    roster([A, B]);
    session.startRound();

    roster([{ ...A, connected: false }, B]);
    assert.equal(lastUpdate().turnPlayerId, 'b');

    roster([{ ...A, connected: false }, { ...B, connected: false }]);
    assert.equal(lastUpdate().phase, 'waiting');

    roster([A, { ...B, connected: false }]);
    assert.equal(lastUpdate().phase, 'aiming');
    assert.equal(lastUpdate().turnPlayerId, 'a');
});

test('nextHole starts the following hole, or ends the round after the last one', async () => {
    const { session, game, roster, shot, lastUpdate, finishShot } = setup();
    roster([A]);
    session.startRound();
    shot('a', { power: 1 });
    await finishShot('holeComplete', { x: 0, z: -100, strokes: 1, holed: true });

    session.nextHole();
    assert.equal(lastUpdate().hole, 2);
    assert.equal(lastUpdate().phase, 'aiming');

    shot('a', { power: 1 });
    await finishShot('holeComplete', { x: 0, z: -50, strokes: 1, holed: true });
    game.nextHole = () => false;
    session.nextHole();
    assert.equal(lastUpdate().phase, 'round-complete');
});

test('startRound needs at least one connected player and only works from the lobby', () => {
    const { session, roster } = setup();
    assert.equal(session.startRound(), false);
    roster([A]);
    assert.equal(session.startRound(), true);
    assert.equal(session.startRound(), false);
});

test('removing the current shooter from the roster passes the turn', () => {
    const { session, roster, lastUpdate } = setup();
    roster([A, B]);
    session.startRound();
    assert.equal(lastUpdate().turnPlayerId, 'a');
    roster([B]);
    assert.equal(lastUpdate().phase, 'aiming');
    assert.equal(lastUpdate().turnPlayerId, 'b');
});

test('room:created joinHosts are exposed in the view', () => {
    const { session } = setup();
    session.handleMessage(encode(MSG.ROOM_CREATED, { code: 'ABCD', joinHosts: ['192.168.1.5:8000'] }));
    assert.deepEqual(session.view().joinHosts, ['192.168.1.5:8000']);
    assert.equal(session.view().code, 'ABCD');
});

test('a throw while beginning the next turn parks the session in waiting', async () => {
    const { session, game, roster, shot, lastUpdate, finishShot } = setup();
    roster([A, B]);
    session.startRound();
    shot('a', { power: 1 });
    const original = game.loadBallSnapshot;
    let thrown = false;
    game.loadBallSnapshot = function (...args) {
        if (!thrown) { thrown = true; throw new Error('boom'); }
        return original.apply(this, args);
    };
    const realError = console.error;
    console.error = () => {};
    try {
        await finishShot('shotComplete', { x: 0, z: -30, strokes: 1, holed: false });
    } finally {
        console.error = realError;
    }
    assert.equal(lastUpdate().phase, 'waiting');
    roster([A, B]);
    assert.equal(lastUpdate().phase, 'aiming');
});
