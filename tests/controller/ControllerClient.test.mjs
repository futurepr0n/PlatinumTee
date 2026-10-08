import test from 'node:test';
import assert from 'node:assert/strict';

import { ControllerClient, SHOT_ACK_TIMEOUT_MS } from '../../js/controller/ControllerClient.js';
import { MSG, encode } from '../../js/net/protocol.js';

function memoryStorage() {
    const data = new Map();
    return {
        getItem: key => data.get(key) ?? null,
        setItem: (key, value) => data.set(key, value),
        removeItem: key => data.delete(key)
    };
}

function setup(storage = memoryStorage()) {
    const sent = [];
    const client = new ControllerClient({ storage });
    client.attach({ send: raw => sent.push(JSON.parse(raw)) });
    const receive = (type, payload) => client.handleMessage(encode(type, payload));
    return { client, sent, storage, receive };
}

test('fresh phone shows the join form, joins, and remembers its token', () => {
    const { client, sent, storage, receive } = setup();
    client.handleOpen();
    assert.equal(client.state.status, 'joining');

    client.join('abcd', 'Ann');
    assert.deepEqual(sent[0], { type: MSG.PLAYER_JOIN, payload: { code: 'abcd', name: 'Ann' } });

    receive(MSG.PLAYER_WELCOME, { playerId: 'p1', token: 't1', code: 'ABCD', name: 'Ann' });
    assert.equal(client.state.status, 'joined');
    assert.deepEqual(JSON.parse(storage.getItem('platinumtee:session')), { code: 'ABCD', token: 't1' });
});

test('a phone with a saved session rejoins automatically, and falls back to the form if rejected', () => {
    const storage = memoryStorage();
    storage.setItem('platinumtee:session', JSON.stringify({ code: 'ABCD', token: 't1' }));
    const { client, sent, receive } = setup(storage);

    client.handleOpen();
    assert.deepEqual(sent[0], { type: MSG.PLAYER_REJOIN, payload: { code: 'ABCD', token: 't1' } });

    receive(MSG.ERROR, { code: 'INVALID_TOKEN' });
    assert.equal(client.state.status, 'joining');
    assert.equal(client.state.error, 'INVALID_TOKEN');
    assert.equal(storage.getItem('platinumtee:session'), null);
});

test('shots are only sent on my turn and only once per turn', () => {
    const { client, sent, receive } = setup();
    receive(MSG.PLAYER_WELCOME, { playerId: 'p1', token: 't1', code: 'ABCD', name: 'Ann' });

    receive(MSG.GAME_UPDATE, { phase: 'aiming', turnPlayerId: 'p2' });
    assert.equal(client.sendShot({ power: 1 }), false);

    receive(MSG.GAME_UPDATE, { phase: 'aiming', turnPlayerId: 'p1' });
    assert.equal(client.isMyTurn(), true);
    assert.equal(client.sendShot({ power: 1 }), true);
    assert.equal(client.sendShot({ power: 1 }), false);
    assert.equal(sent.filter(m => m.type === MSG.PLAYER_SHOT).length, 1);
});

test('room closing clears the saved session and disconnects mark reconnecting', () => {
    const { client, storage, receive } = setup();
    receive(MSG.PLAYER_WELCOME, { playerId: 'p1', token: 't1', code: 'ABCD', name: 'Ann' });

    client.handleDisconnect();
    assert.equal(client.state.status, 'reconnecting');

    receive(MSG.ROOM_CLOSED, {});
    assert.equal(client.state.status, 'closed');
    assert.equal(storage.getItem('platinumtee:session'), null);
    client.handleDisconnect();
    assert.equal(client.state.status, 'closed');
});

test('works when storage is unavailable', () => {
    const client = new ControllerClient({ storage: null });
    client.attach({ send: () => {} });
    assert.doesNotThrow(() => client.handleOpen());
    assert.doesNotThrow(() => client.handleMessage(encode(MSG.PLAYER_WELCOME, { playerId: 'p', token: 't', code: 'ABCD', name: 'A' })));
});

function timedSetup() {
    const timers = [];
    const cleared = [];
    const sent = [];
    const client = new ControllerClient({
        storage: memoryStorage(),
        setTimer: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; },
        clearTimer: timer => cleared.push(timer)
    });
    client.attach({ send: raw => sent.push(JSON.parse(raw)) });
    const receive = (type, payload) => client.handleMessage(encode(type, payload));
    receive(MSG.PLAYER_WELCOME, { playerId: 'p1', token: 't1', code: 'ABCD', name: 'Ann' });
    receive(MSG.GAME_UPDATE, { phase: 'aiming', turnPlayerId: 'p1' });
    return { client, sent, timers, cleared, receive };
}

test('an unacknowledged shot restores my turn when the ack timer fires', () => {
    const { client, timers, receive } = timedSetup();
    assert.equal(client.sendShot({ power: 1 }), true);
    assert.equal(client.isMyTurn(), false);
    assert.equal(timers.length, 1);
    assert.equal(timers[0].ms, SHOT_ACK_TIMEOUT_MS);

    timers[0].fn();
    assert.equal(client.isMyTurn(), true);
    assert.equal(client.sendShot({ power: 1 }), true);
    receive(MSG.GAME_UPDATE, { phase: 'aiming', turnPlayerId: 'p1' });
});

test('a game update acknowledges the shot and clears the ack timer', () => {
    const { client, timers, cleared, receive } = timedSetup();
    client.sendShot({ power: 1 });
    receive(MSG.GAME_UPDATE, { phase: 'in-flight', turnPlayerId: 'p1' });
    assert.deepEqual(cleared, [timers[0]]);

    timers[0].fn();
    assert.equal(client.state.update.phase, 'in-flight');
    assert.equal(client.isMyTurn(), false);
});

test('room close and disconnect clear the pending ack timer', () => {
    const { client, timers, cleared, receive } = timedSetup();
    client.sendShot({ power: 1 });
    client.handleDisconnect();
    assert.deepEqual(cleared, [timers[0]]);

    timers[0].fn();
    assert.equal(client.state.update.phase, 'in-flight');
});
