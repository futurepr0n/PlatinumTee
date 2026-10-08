import test from 'node:test';
import assert from 'node:assert/strict';

import { RoomRegistry } from '../../server/RoomRegistry.js';

function setup(options) {
    const registry = new RoomRegistry(options);
    const code = registry.createRoom('host-conn');
    return { registry, code };
}

test('players join a room by code and appear in the public roster', () => {
    const { registry, code } = setup();
    const result = registry.joinRoom(code.toLowerCase(), 'p1-conn', 'Ann');

    assert.equal(result.player.name, 'Ann');
    assert.deepEqual(registry.publicPlayers(result.room), [
        { id: result.player.id, name: 'Ann', connected: true }
    ]);
    assert.equal(registry.lookup('p1-conn').role, 'player');
});

test('join rejects unknown rooms, bad names, full rooms and duplicate connections', () => {
    const { registry, code } = setup({ maxPlayers: 1 });
    assert.deepEqual(registry.joinRoom('ZZZZ', 'x', 'Ann'), { error: 'ROOM_NOT_FOUND' });
    assert.deepEqual(registry.joinRoom(code, 'x', '  '), { error: 'INVALID_NAME' });
    registry.joinRoom(code, 'p1', 'Ann');
    assert.deepEqual(registry.joinRoom(code, 'p2', 'Bob'), { error: 'ROOM_FULL' });
    assert.equal(registry.createRoom('p1'), null);
});

test('a dropped player keeps their slot and can rejoin with their token', () => {
    const { registry, code } = setup();
    const { player } = registry.joinRoom(code, 'p1-old', 'Ann');

    const left = registry.leave('p1-old');
    assert.equal(left.role, 'player');
    assert.equal(player.connected, false);

    assert.deepEqual(registry.rejoinRoom(code, 'p1-new', 'wrong'), { error: 'INVALID_TOKEN' });
    const rejoined = registry.rejoinRoom(code, 'p1-new', player.token);
    assert.equal(rejoined.player.id, player.id);
    assert.equal(rejoined.player.connected, true);
    assert.equal(registry.lookup('p1-new').playerId, player.id);
});

test('a late close from a replaced connection does not disconnect the player', () => {
    const { registry, code } = setup();
    const { player } = registry.joinRoom(code, 'old', 'Ann');
    registry.rejoinRoom(code, 'new', player.token);

    assert.equal(registry.leave('old'), null);
    assert.equal(player.connected, true);
});

test('host leaving deletes the room and forgets every player connection', () => {
    const { registry, code } = setup();
    registry.joinRoom(code, 'p1', 'Ann');

    assert.equal(registry.leave('host-conn').role, 'host');
    assert.equal(registry.lookup('p1'), null);
    assert.deepEqual(registry.joinRoom(code, 'p2', 'Bob'), { error: 'ROOM_NOT_FOUND' });
});

test('a connection already in a room cannot rejoin another slot', () => {
    const { registry, code } = setup();
    const { player: ann } = registry.joinRoom(code, 'p1', 'Ann');
    const { player: bob } = registry.joinRoom(code, 'p2', 'Bob');

    assert.deepEqual(registry.rejoinRoom(code, 'p2', ann.token), { error: 'ALREADY_IN_ROOM' });
    assert.equal(bob.connected, true);
    assert.equal(bob.connId, 'p2');
    assert.equal(ann.connId, 'p1');

    assert.deepEqual(registry.rejoinRoom(code, 'host-conn', ann.token), { error: 'ALREADY_IN_ROOM' });
    assert.equal(registry.leave('host-conn').role, 'host');
    assert.equal(registry.lookup('p1'), null);
});

test('joinRoom rejects a connection that is already in a room', () => {
    const { registry, code } = setup();
    registry.joinRoom(code, 'p1', 'Ann');
    assert.deepEqual(registry.joinRoom(code, 'p1', 'Ann again'), { error: 'ALREADY_IN_ROOM' });
});

test('a full room evicts a disconnected player for a newcomer and voids the old token', () => {
    const { registry, code } = setup({ maxPlayers: 2 });
    const { player: ann } = registry.joinRoom(code, 'p1', 'Ann');
    registry.joinRoom(code, 'p2', 'Bob');
    registry.leave('p1');

    const result = registry.joinRoom(code, 'p3', 'Cy');
    assert.equal(result.player.name, 'Cy');
    assert.deepEqual(registry.publicPlayers(result.room).map(p => p.name), ['Bob', 'Cy']);
    assert.deepEqual(registry.rejoinRoom(code, 'p4', ann.token), { error: 'INVALID_TOKEN' });
});

test('a full room with every seat connected still returns ROOM_FULL', () => {
    const { registry, code } = setup({ maxPlayers: 2 });
    registry.joinRoom(code, 'p1', 'Ann');
    registry.joinRoom(code, 'p2', 'Bob');
    assert.deepEqual(registry.joinRoom(code, 'p3', 'Cy'), { error: 'ROOM_FULL' });
});
