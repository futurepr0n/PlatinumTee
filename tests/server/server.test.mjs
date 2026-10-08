import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { createServer, resolveStaticPath } from '../../server/index.js';
import { MSG } from '../../js/net/protocol.js';

function connect(port) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${port}/ws`);
        const inbox = [];
        const waiters = [];

        ws.addEventListener('message', (event) => {
            const message = JSON.parse(event.data);
            const index = waiters.findIndex(waiter => waiter.type === message.type);
            if (index >= 0) waiters.splice(index, 1)[0].resolve(message.payload);
            else inbox.push(message);
        });
        ws.addEventListener('error', reject);
        ws.addEventListener('open', () => resolve({
            send: (type, payload = {}) => ws.send(JSON.stringify({ type, payload })),
            next: (type) => {
                const index = inbox.findIndex(message => message.type === type);
                if (index >= 0) return Promise.resolve(inbox.splice(index, 1)[0].payload);
                return new Promise(done => waiters.push({ type, resolve: done }));
            },
            close: () => ws.close(),
            raw: ws
        }));
    });
}

async function withServer(run) {
    const app = createServer({ port: 0 });
    const port = await app.listen();
    try {
        await run(port);
    } finally {
        await app.close();
    }
}

test('resolveStaticPath blocks dotfiles, traversal and server/test folders', () => {
    const root = path.resolve('/srv/app');
    assert.equal(resolveStaticPath(root, '/'), path.join(root, 'index.html'));
    assert.equal(resolveStaticPath(root, '/js/main.js?v=1'), path.join(root, 'js/main.js'));
    assert.equal(resolveStaticPath(root, '/.git/config'), null);
    assert.equal(resolveStaticPath(root, '/../package.json'), null);
    assert.equal(resolveStaticPath(root, '/%2e%2e/package.json'), null);
    assert.equal(resolveStaticPath(root, '/server/index.js'), null);
    assert.equal(resolveStaticPath(root, '/%E0%A4%A'), null);
});

test('serves index.html and refuses .git over HTTP', async () => {
    await withServer(async (port) => {
        const ok = await fetch(`http://localhost:${port}/index.html`);
        assert.equal(ok.status, 200);
        assert.match(ok.headers.get('content-type'), /text\/html/);
        assert.equal((await fetch(`http://localhost:${port}/.git/config`)).status, 404);
    });
});

test('host creates a room, player joins, shots are relayed with a server-assigned id', async () => {
    await withServer(async (port) => {
        const host = await connect(port);
        host.send(MSG.HOST_CREATE);
        const created = await host.next(MSG.ROOM_CREATED);
        const { code } = created;
        assert.ok(Array.isArray(created.joinHosts));
        for (const entry of created.joinHosts) assert.match(entry, new RegExp(`:${port}$`));

        const phone = await connect(port);
        phone.send(MSG.PLAYER_JOIN, { code, name: 'Ann' });
        const welcome = await phone.next(MSG.PLAYER_WELCOME);
        const roster = await host.next(MSG.ROOM_PLAYERS);
        assert.deepEqual(roster.players, [{ id: welcome.playerId, name: 'Ann', connected: true }]);

        phone.send(MSG.PLAYER_SHOT, { playerId: 'spoofed', intent: { power: 0.7 } });
        const shot = await host.next(MSG.PLAYER_SHOT);
        assert.equal(shot.playerId, welcome.playerId);
        assert.deepEqual(shot.intent, { power: 0.7 });

        host.send(MSG.GAME_UPDATE, { phase: 'aiming', turnPlayerId: welcome.playerId });
        assert.equal((await phone.next(MSG.GAME_UPDATE)).turnPlayerId, welcome.playerId);

        phone.close();
        host.close();
    });
});

test('bad room code yields an error and host disconnect closes the room for players', async () => {
    await withServer(async (port) => {
        const stray = await connect(port);
        stray.send(MSG.PLAYER_JOIN, { code: 'ZZZZ', name: 'Bob' });
        assert.equal((await stray.next(MSG.ERROR)).code, 'ROOM_NOT_FOUND');

        const host = await connect(port);
        host.send(MSG.HOST_CREATE);
        const { code } = await host.next(MSG.ROOM_CREATED);
        stray.send(MSG.PLAYER_JOIN, { code, name: 'Bob' });
        await stray.next(MSG.PLAYER_WELCOME);

        host.close();
        await stray.next(MSG.ROOM_CLOSED);
        stray.close();
    });
});

test('players cannot forge game updates', async () => {
    await withServer(async (port) => {
        const host = await connect(port);
        host.send(MSG.HOST_CREATE);
        const { code } = await host.next(MSG.ROOM_CREATED);
        const a = await connect(port);
        const b = await connect(port);
        a.send(MSG.PLAYER_JOIN, { code, name: 'A' });
        b.send(MSG.PLAYER_JOIN, { code, name: 'B' });
        await a.next(MSG.PLAYER_WELCOME);
        await b.next(MSG.PLAYER_WELCOME);

        a.send(MSG.GAME_UPDATE, { phase: 'forged' });
        host.send(MSG.GAME_UPDATE, { phase: 'real' });
        assert.equal((await b.next(MSG.GAME_UPDATE)).phase, 'real');

        [a, b, host].forEach(client => client.close());
    });
});

test('resolveStaticPath blocks blocked folders regardless of case', () => {
    const root = path.resolve('/srv/app');
    assert.equal(resolveStaticPath(root, '/SERVER/index.js'), null);
    assert.equal(resolveStaticPath(root, '/Tests/x'), null);
});

test('oversize frame disconnects that client and server keeps serving', async () => {
    await withServer(async (port) => {
        const flood = await connect(port);
        const closed = new Promise(resolve => flood.raw.addEventListener('close', resolve));
        flood.raw.send('x'.repeat(5000));
        await closed;

        const host = await connect(port);
        host.send(MSG.HOST_CREATE);
        assert.match((await host.next(MSG.ROOM_CREATED)).code, /^[A-Z]{4}$/);
        host.close();
    });
});
