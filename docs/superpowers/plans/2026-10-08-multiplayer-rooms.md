# Multiplayer Rooms & Phone Controller Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shared "TV" screen hosts a room (`/index.html?host`), 1–4 players join from phones (`/controller.html?room=ABCD`), take turns hitting shots with a swipe gesture, and see whose turn it is plus running scores.

**Architecture:** A small Node server serves the static files and runs a WebSocket **relay** (`/ws`) that owns rooms, player identity and reconnect tokens — it never simulates golf. The **host browser is authoritative**: it runs the existing `gameState`/physics, decides turns (`TurnManager`), and broadcasts `game:update` snapshots. Phones are thin clients that send `ShotIntent`s (the existing intent shape) produced by the existing `interpretTrackballGesture`. One simulation in one place means the frame-rate–dependent physics (audit item C4) cannot desync clients; a server-side headless sim is a later plan.

**Tech Stack:** Node ≥22 (built-in `WebSocket` client used in tests; repo runs v25), `ws@^8.18.0` server, vanilla ES modules in the browser, `node:test`.

**Spec:** No separate spec — this plan implements the "Suggested path" section of the 2026-10-08 audit (conversation). Out of scope: headless/server simulation, host reconnect, Vite build, physics fixes (separate plans).

## Global Constraints

- Server is a relay only: it MUST attach `playerId` itself and never trust a client-supplied player id.
- Max 4 players per room; room codes are 4 chars from `ABCDEFGHJKMNPQRSTUVWXYZ` (no I/L/O).
- Max WebSocket message size 4096 bytes; player shots rate-limited to 1 per 500 ms per connection.
- Player names: 1–16 chars after stripping control chars and `<>`; always rendered with `textContent`, never `innerHTML`.
- Static server must refuse any path segment starting with `.` (protects `.git`, `.env`) and the `server/` and `tests/` folders.
- Single-player (`/index.html` without `?host`) must behave exactly as today; all 27 existing tests keep passing.
- Per `~/.claude/GIT_RULES.md`: every "Commit" step means **ask the user first**; never commit/push without explicit consent.
- New source code: no comments beyond what surrounding code uses; match existing 4-space indent and naming.

## Review Focus

1. **Null/garbage shot intent from a phone** (`intent: null`, string, missing) → host ignores or treats as zero-power, never throws. Test in Task 6.
2. **Current player disconnects mid-turn, or everyone disconnects** → turn passes to next connected player; with nobody connected host shows "waiting" and does not auto-finish the hole. Tests in Tasks 4 & 6.
3. **Player joins mid-hole** → they get a tee ball and play, no crash on `null` ball distance. Test in Task 4.
4. **Request for `/.git/config` or `/../package.json`** → 404. Test in Task 3.
5. **Host presses `M` (cycle control mode) during a remote round** → ignored, otherwise every phone shot is rejected by the source check. Covered by guard in Task 7 + manual check.

---

## File Structure

| File | Responsibility |
|---|---|
| `js/net/protocol.js` (new) | Message type constants, encode/decode, room-code + name validation. Shared by browser and Node. |
| `server/RoomRegistry.js` (new) | Pure room/player/connection bookkeeping incl. reconnect tokens. |
| `server/index.js` (new) | HTTP static server + `ws` relay wiring + LAN address log. |
| `js/net/TurnManager.js` (new) | Pure per-hole turn order ("farthest from hole plays"), per-player ball/strokes, standings. |
| `js/gameState.js` (modify) | `getBallSnapshot` / `loadBallSnapshot`, split `setupAimingFromBall` out of `prepareForNextShot`. |
| `js/shotControls/controlModes.js` (modify) | Add `REMOTE` mode (not in cycle order). |
| `js/net/HostSession.js` (new) | Host-side glue: socket messages ↔ TurnManager ↔ gameState. DOM-free, injectable. |
| `js/ui/LobbyPanel.js` (new) | Host overlay: room code, join URL, roster/scores, Start/Next buttons. |
| `js/gameManager.js` (modify) | Start HostSession when `?host` present; suppress single-player results panel & mode cycling in MP. |
| `js/controller/ControllerClient.js` (new) | Phone-side state machine (join, rejoin, turn, send shot). DOM-free. |
| `controller.html`, `js/controller/controller.js`, `controller.css` (new) | Phone page + DOM glue + swipe pad. |
| `package.json` (modify) | `ws` dependency, `start` script. |

---

### Task 1: Shared protocol module

**Files:**
- Create: `js/net/protocol.js`
- Test: `tests/net/protocol.test.mjs`

**Interfaces:**
- Produces: `MSG` (frozen map below), `MAX_MESSAGE_BYTES = 4096`, `encode(type, payload = {}) → string`, `decode(raw) → {type, payload} | null`, `normalizeRoomCode(code) → string | null`, `sanitizeName(name) → string | null`, `generateRoomCode(isTaken = () => false, random = Math.random) → string`.
- `MSG` values: `HOST_CREATE 'host:create'`, `ROOM_CREATED 'room:created'`, `PLAYER_JOIN 'player:join'`, `PLAYER_REJOIN 'player:rejoin'`, `PLAYER_WELCOME 'player:welcome'`, `ROOM_PLAYERS 'room:players'`, `PLAYER_SHOT 'player:shot'`, `GAME_UPDATE 'game:update'`, `ROOM_CLOSED 'room:closed'`, `ERROR 'error'`.

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    MSG,
    MAX_MESSAGE_BYTES,
    encode,
    decode,
    normalizeRoomCode,
    sanitizeName,
    generateRoomCode
} from '../../js/net/protocol.js';

test('encode/decode round-trips a known message', () => {
    assert.deepEqual(decode(encode(MSG.PLAYER_JOIN, { code: 'ABCD', name: 'Sam' })), {
        type: MSG.PLAYER_JOIN,
        payload: { code: 'ABCD', name: 'Sam' }
    });
});

test('decode rejects malformed, unknown and oversized messages', () => {
    assert.equal(decode('not json'), null);
    assert.equal(decode(JSON.stringify({ type: 'evil:thing', payload: {} })), null);
    assert.equal(decode(JSON.stringify(null)), null);
    assert.equal(decode('x'.repeat(MAX_MESSAGE_BYTES + 1)), null);
});

test('decode replaces non-object payloads with an empty object', () => {
    assert.deepEqual(decode(JSON.stringify({ type: MSG.HOST_CREATE, payload: [1] })).payload, {});
    assert.deepEqual(decode(Buffer.from(JSON.stringify({ type: MSG.HOST_CREATE }))).payload, {});
});

test('normalizeRoomCode uppercases and rejects ambiguous letters', () => {
    assert.equal(normalizeRoomCode(' abcd '), 'ABCD');
    assert.equal(normalizeRoomCode('ABCI'), null);
    assert.equal(normalizeRoomCode('ABC'), null);
    assert.equal(normalizeRoomCode(42), null);
});

test('sanitizeName strips markup and control characters and caps length', () => {
    assert.equal(sanitizeName('  <b>Ann</b>\u0007 '), 'bAnn/b');
    assert.equal(sanitizeName('x'.repeat(40)).length, 16);
    assert.equal(sanitizeName('   '), null);
    assert.equal(sanitizeName(null), null);
});

test('generateRoomCode skips taken codes', () => {
    const values = [0, 0, 0, 0, 0.99, 0.99, 0.99, 0.99];
    const random = () => values.shift();
    assert.equal(generateRoomCode(code => code === 'AAAA', random), 'ZZZZ');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/net/protocol.test.mjs`
Expected: FAIL — `Cannot find module '.../js/net/protocol.js'`

- [ ] **Step 3: Write minimal implementation** — `js/net/protocol.js`

```js
const MSG = Object.freeze({
    HOST_CREATE: 'host:create',
    ROOM_CREATED: 'room:created',
    PLAYER_JOIN: 'player:join',
    PLAYER_REJOIN: 'player:rejoin',
    PLAYER_WELCOME: 'player:welcome',
    ROOM_PLAYERS: 'room:players',
    PLAYER_SHOT: 'player:shot',
    GAME_UPDATE: 'game:update',
    ROOM_CLOSED: 'room:closed',
    ERROR: 'error'
});

const MAX_MESSAGE_BYTES = 4096;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const ROOM_CODE_LENGTH = 4;
const MAX_NAME_LENGTH = 16;
const KNOWN_TYPES = new Set(Object.values(MSG));

function encode(type, payload = {}) {
    return JSON.stringify({ type, payload });
}

function decode(raw) {
    const text = typeof raw === 'string' ? raw : String(raw);
    if (text.length > MAX_MESSAGE_BYTES) return null;

    let message;
    try {
        message = JSON.parse(text);
    } catch {
        return null;
    }

    if (!message || typeof message !== 'object' || !KNOWN_TYPES.has(message.type)) return null;

    const { payload } = message;
    const isObject = payload && typeof payload === 'object' && !Array.isArray(payload);
    return { type: message.type, payload: isObject ? payload : {} };
}

function normalizeRoomCode(code) {
    if (typeof code !== 'string') return null;
    const normalized = code.trim().toUpperCase();
    if (normalized.length !== ROOM_CODE_LENGTH) return null;
    return [...normalized].every(char => ROOM_CODE_ALPHABET.includes(char)) ? normalized : null;
}

function sanitizeName(name) {
    if (typeof name !== 'string') return null;
    const cleaned = name.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, MAX_NAME_LENGTH);
    return cleaned.length > 0 ? cleaned : null;
}

function generateRoomCode(isTaken = () => false, random = Math.random) {
    for (let attempt = 0; attempt < 100; attempt++) {
        let code = '';
        for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
            code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)];
        }
        if (!isTaken(code)) return code;
    }
    throw new Error('Room code space exhausted');
}

export {
    MSG,
    MAX_MESSAGE_BYTES,
    encode,
    decode,
    normalizeRoomCode,
    sanitizeName,
    generateRoomCode
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/net/protocol.test.mjs` → Expected: 6 pass.

- [ ] **Step 5: Commit** (ask user first)

```bash
git add js/net/protocol.js tests/net/protocol.test.mjs
git commit -m "feat(net): add shared room protocol module"
```

---

### Task 2: Room registry

**Files:**
- Create: `server/RoomRegistry.js`
- Test: `tests/server/RoomRegistry.test.mjs`

**Interfaces:**
- Consumes: `generateRoomCode`, `normalizeRoomCode`, `sanitizeName` from Task 1.
- Produces: `class RoomRegistry({ maxPlayers = 4, random = Math.random })` with
  - `createRoom(hostConnId) → code | null` (null if conn already in a room)
  - `joinRoom(code, connId, name) → { room, player } | { error }` — errors: `ROOM_NOT_FOUND`, `INVALID_NAME`, `ROOM_FULL`, `ALREADY_IN_ROOM`
  - `rejoinRoom(code, connId, token) → { room, player } | { error }` — errors: `ROOM_NOT_FOUND`, `INVALID_TOKEN`
  - `leave(connId) → { room, role: 'host' } | { room, role: 'player', player } | null`
  - `lookup(connId) → { code, role, playerId?, room } | null`
  - `publicPlayers(room) → [{ id, name, connected }]`
  - room shape: `{ code, hostConnId, players: Map<playerId, { id, token, name, connId, connected }> }`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/server/RoomRegistry.test.mjs` → Expected: FAIL, module not found.

- [ ] **Step 3: Write minimal implementation** — `server/RoomRegistry.js`

```js
import { randomUUID } from 'node:crypto';
import { generateRoomCode, normalizeRoomCode, sanitizeName } from '../js/net/protocol.js';

export class RoomRegistry {
    constructor({ maxPlayers = 4, random = Math.random } = {}) {
        this.maxPlayers = maxPlayers;
        this.random = random;
        this.rooms = new Map();
        this.connections = new Map();
    }

    createRoom(hostConnId) {
        if (this.connections.has(hostConnId)) return null;

        const code = generateRoomCode(candidate => this.rooms.has(candidate), this.random);
        this.rooms.set(code, { code, hostConnId, players: new Map() });
        this.connections.set(hostConnId, { code, role: 'host' });
        return code;
    }

    findRoom(rawCode) {
        const code = normalizeRoomCode(rawCode);
        return code ? this.rooms.get(code) ?? null : null;
    }

    joinRoom(rawCode, connId, rawName) {
        const room = this.findRoom(rawCode);
        if (!room) return { error: 'ROOM_NOT_FOUND' };

        const name = sanitizeName(rawName);
        if (!name) return { error: 'INVALID_NAME' };
        if (room.players.size >= this.maxPlayers) return { error: 'ROOM_FULL' };
        if (this.connections.has(connId)) return { error: 'ALREADY_IN_ROOM' };

        const player = { id: randomUUID(), token: randomUUID(), name, connId, connected: true };
        room.players.set(player.id, player);
        this.connections.set(connId, { code: room.code, role: 'player', playerId: player.id });
        return { room, player };
    }

    rejoinRoom(rawCode, connId, token) {
        const room = this.findRoom(rawCode);
        if (!room) return { error: 'ROOM_NOT_FOUND' };

        const player = [...room.players.values()].find(candidate => candidate.token === token);
        if (!player || typeof token !== 'string') return { error: 'INVALID_TOKEN' };

        if (player.connId) this.connections.delete(player.connId);
        player.connId = connId;
        player.connected = true;
        this.connections.set(connId, { code: room.code, role: 'player', playerId: player.id });
        return { room, player };
    }

    leave(connId) {
        const connection = this.connections.get(connId);
        if (!connection) return null;
        this.connections.delete(connId);

        const room = this.rooms.get(connection.code);
        if (!room) return null;

        if (connection.role === 'host') {
            this.rooms.delete(room.code);
            for (const player of room.players.values()) {
                if (player.connId) this.connections.delete(player.connId);
            }
            return { room, role: 'host' };
        }

        const player = room.players.get(connection.playerId);
        player.connected = false;
        player.connId = null;
        return { room, role: 'player', player };
    }

    lookup(connId) {
        const connection = this.connections.get(connId);
        const room = connection && this.rooms.get(connection.code);
        return room ? { ...connection, room } : null;
    }

    publicPlayers(room) {
        return [...room.players.values()].map(({ id, name, connected }) => ({ id, name, connected }));
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/server/RoomRegistry.test.mjs` → Expected: 5 pass.

- [ ] **Step 5: Commit** (ask user first)

```bash
git add server/RoomRegistry.js tests/server/RoomRegistry.test.mjs
git commit -m "feat(server): add room registry with reconnect tokens"
```

---

### Task 3: HTTP + WebSocket relay server

**Files:**
- Create: `server/index.js`
- Modify: `package.json` (add `"ws": "^8.18.0"` to `dependencies`, add `"start": "node server/index.js"` to `scripts`)
- Test: `tests/server/server.test.mjs`

**Interfaces:**
- Consumes: Task 1 `MSG`, `encode`, `decode`, `MAX_MESSAGE_BYTES`; Task 2 `RoomRegistry`.
- Produces: `resolveStaticPath(root, urlPath) → absolutePath | null`; `createServer({ port = 8000, registry }) → { server, wss, registry, listen(): Promise<port>, close(): Promise<void> }`. WebSocket endpoint path `/ws`.
- Relay rules (what the host and phones can rely on):
  - `host:create` → `room:created {code}` to sender.
  - `player:join {code,name}` / `player:rejoin {code,token}` → `player:welcome {playerId, token, code, name}` to sender, then `room:players {players}` to host. Failures → `error {code}`.
  - `player:shot {intent}` from a player → host receives `player:shot {playerId, intent}` (server-attached id; 500 ms cooldown).
  - `game:update` from host → forwarded verbatim to every connected player in the room.
  - Host socket closes → every player gets `room:closed`. Player socket closes → host gets fresh `room:players`.

- [ ] **Step 1: Install dependency**

Run: `npm install ws@^8.18.0` then add `"start": "node server/index.js"` to `scripts` in `package.json`.
Expected: `package.json` `dependencies` lists `three` and `ws`.

- [ ] **Step 2: Write the failing test**

```js
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
            close: () => ws.close()
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
        const { code } = await host.next(MSG.ROOM_CREATED);

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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test tests/server/server.test.mjs` → Expected: FAIL, module not found.

- [ ] **Step 4: Write implementation** — `server/index.js`

```js
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

import { MSG, MAX_MESSAGE_BYTES, encode, decode } from '../js/net/protocol.js';
import { RoomRegistry } from './RoomRegistry.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BLOCKED_TOP_LEVEL = new Set(['server', 'tests', 'docs']);
const SHOT_COOLDOWN_MS = 500;
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml'
};

export function resolveStaticPath(root, urlPath) {
    let decoded;
    try {
        decoded = decodeURIComponent(urlPath.split('?')[0]);
    } catch {
        return null;
    }
    if (decoded.endsWith('/')) decoded += 'index.html';

    const segments = decoded.split('/').filter(Boolean);
    if (segments.some(segment => segment.startsWith('.'))) return null;
    if (BLOCKED_TOP_LEVEL.has(segments[0])) return null;

    const fullPath = path.resolve(root, ...segments);
    return fullPath.startsWith(root + path.sep) ? fullPath : null;
}

export function createServer({ port = 8000, registry = new RoomRegistry() } = {}) {
    const server = http.createServer(async (req, res) => {
        const filePath = resolveStaticPath(ROOT, req.url);
        if (!filePath) {
            res.writeHead(404).end();
            return;
        }
        try {
            const body = await readFile(filePath);
            res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] ?? 'application/octet-stream' });
            res.end(body);
        } catch {
            res.writeHead(404).end();
        }
    });

    const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_MESSAGE_BYTES });
    const sockets = new Map();

    const send = (connId, type, payload) => {
        const socket = sockets.get(connId);
        if (socket?.readyState === socket?.OPEN) socket.send(encode(type, payload));
    };
    const sendRoster = room => send(room.hostConnId, MSG.ROOM_PLAYERS, { players: registry.publicPlayers(room) });
    const sendToPlayers = (room, type, payload) => {
        for (const player of room.players.values()) {
            if (player.connId) send(player.connId, type, payload);
        }
    };

    const handlers = {
        [MSG.HOST_CREATE]: (connId) => {
            const code = registry.createRoom(connId);
            if (code) send(connId, MSG.ROOM_CREATED, { code });
            else send(connId, MSG.ERROR, { code: 'ALREADY_IN_ROOM' });
        },
        [MSG.PLAYER_JOIN]: (connId, payload) => welcome(connId, registry.joinRoom(payload.code, connId, payload.name)),
        [MSG.PLAYER_REJOIN]: (connId, payload) => welcome(connId, registry.rejoinRoom(payload.code, connId, payload.token)),
        [MSG.PLAYER_SHOT]: (connId, payload, context, connection) => {
            if (context?.role !== 'player') return;
            const now = Date.now();
            if (now - connection.lastShotAt < SHOT_COOLDOWN_MS) return;
            connection.lastShotAt = now;
            send(context.room.hostConnId, MSG.PLAYER_SHOT, { playerId: context.playerId, intent: payload.intent ?? null });
        },
        [MSG.GAME_UPDATE]: (connId, payload, context) => {
            if (context?.role === 'host') sendToPlayers(context.room, MSG.GAME_UPDATE, payload);
        }
    };

    function welcome(connId, result) {
        if (result.error) {
            send(connId, MSG.ERROR, { code: result.error });
            return;
        }
        const { room, player } = result;
        send(connId, MSG.PLAYER_WELCOME, { playerId: player.id, token: player.token, code: room.code, name: player.name });
        sendRoster(room);
    }

    wss.on('connection', (socket) => {
        const connId = randomUUID();
        const connection = { lastShotAt: 0 };
        sockets.set(connId, socket);

        socket.on('message', (raw) => {
            const message = decode(raw);
            const handler = message && handlers[message.type];
            if (!handler) {
                send(connId, MSG.ERROR, { code: 'BAD_MESSAGE' });
                return;
            }
            handler(connId, message.payload, registry.lookup(connId), connection);
        });

        socket.on('close', () => {
            sockets.delete(connId);
            const left = registry.leave(connId);
            if (!left) return;
            if (left.role === 'host') sendToPlayers(left.room, MSG.ROOM_CLOSED, {});
            else sendRoster(left.room);
        });
    });

    return {
        server,
        wss,
        registry,
        listen: () => new Promise(resolve => server.listen(port, () => resolve(server.address().port))),
        close: () => new Promise(resolve => {
            for (const client of wss.clients) client.terminate();
            wss.close();
            server.close(() => resolve());
        })
    };
}

function lanAddresses() {
    return Object.values(os.networkInterfaces())
        .flat()
        .filter(entry => entry && entry.family === 'IPv4' && !entry.internal)
        .map(entry => entry.address);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const app = createServer({ port: Number(process.env.PORT) || 8000 });
    app.listen().then((port) => {
        console.log(`PlatinumTee host screen: http://localhost:${port}/index.html?host`);
        for (const address of lanAddresses()) {
            console.log(`Phones on this network: http://${address}:${port}/controller.html`);
        }
    });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test` → Expected: all prior 27 tests + Task 1–3 tests pass.

- [ ] **Step 6: Manual smoke check**

Run: `npm start`, open `http://localhost:8000/` → single-player game loads exactly as before (importmap still resolves `./node_modules/three/...`). Stop the server.

- [ ] **Step 7: Commit** (ask user first)

```bash
git add server/index.js tests/server/server.test.mjs package.json package-lock.json
git commit -m "feat(server): add static server and room relay over websockets"
```

---

### Task 4: Turn manager

**Files:**
- Create: `js/net/TurnManager.js`
- Test: `tests/net/TurnManager.test.mjs`

**Interfaces:**
- Produces: `class TurnManager({ maxStrokes = 10 })` with
  - `players: Array<{ id, name, connected, ball: {x,y,z}|null, strokes, holed, scores: [{hole, par, strokes}] }>`
  - `currentId: string | null`
  - `syncRoster(list: [{id, name, connected}])` — adds unknown players (giving them a tee ball if a hole is active), updates name/connected.
  - `get(id)`, `current()`, `hasActivePlayers() → bool`
  - `startHole({ hole, par, position: {x,y,z}, tee: {x,y,z} })` — resets every player; does NOT pick a turn.
  - `advance() → player | null` — first connected unfinished player with 0 strokes (join order), otherwise connected unfinished player farthest from the hole.
  - `recordShot(id, { ball, strokes, holed }) → bool` (false if `id !== currentId`)
  - `isHoleComplete() → bool` — true only if there is ≥1 connected player and all connected players are holed or at `maxStrokes`.
  - `finishHole()` — appends a score per player (unfinished players are scored `maxStrokes`).
  - `standings() → [{ id, name, connected, strokes, total, toPar }]`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/net/TurnManager.test.mjs` → Expected: FAIL, module not found.

- [ ] **Step 3: Write minimal implementation** — `js/net/TurnManager.js`

```js
const MAX_STROKES_PER_HOLE = 10;

export class TurnManager {
    constructor({ maxStrokes = MAX_STROKES_PER_HOLE } = {}) {
        this.maxStrokes = maxStrokes;
        this.players = [];
        this.hole = null;
        this.tee = null;
        this.currentId = null;
    }

    syncRoster(list) {
        for (const { id, name, connected } of list) {
            let player = this.get(id);
            if (!player) {
                player = {
                    id,
                    name,
                    connected,
                    ball: this.tee ? { ...this.tee } : null,
                    strokes: 0,
                    holed: false,
                    scores: []
                };
                this.players.push(player);
            }
            player.name = name;
            player.connected = connected;
        }
    }

    get(id) {
        return this.players.find(player => player.id === id) ?? null;
    }

    current() {
        return this.currentId ? this.get(this.currentId) : null;
    }

    hasActivePlayers() {
        return this.players.some(player => player.connected);
    }

    isDone(player) {
        return player.holed || player.strokes >= this.maxStrokes;
    }

    startHole({ hole, par, position, tee }) {
        this.hole = { hole, par, position: { ...position } };
        this.tee = { ...tee };
        this.currentId = null;
        for (const player of this.players) {
            player.ball = { ...tee };
            player.strokes = 0;
            player.holed = false;
        }
    }

    distanceToHole(player) {
        return Math.hypot(player.ball.x - this.hole.position.x, player.ball.z - this.hole.position.z);
    }

    advance() {
        const candidates = this.players.filter(player => player.connected && !this.isDone(player));
        if (candidates.length === 0) {
            this.currentId = null;
            return null;
        }

        const teeing = candidates.find(player => player.strokes === 0);
        const next = teeing ?? candidates.reduce((farthest, player) => (
            this.distanceToHole(player) > this.distanceToHole(farthest) ? player : farthest
        ));
        this.currentId = next.id;
        return next;
    }

    recordShot(id, { ball, strokes, holed }) {
        const player = this.get(id);
        if (!player || id !== this.currentId) return false;

        player.ball = { x: ball.x, y: ball.y, z: ball.z };
        player.strokes = strokes;
        player.holed = holed;
        return true;
    }

    isHoleComplete() {
        const active = this.players.filter(player => player.connected);
        return active.length > 0 && active.every(player => this.isDone(player));
    }

    finishHole() {
        for (const player of this.players) {
            player.scores.push({
                hole: this.hole.hole,
                par: this.hole.par,
                strokes: this.isDone(player) ? player.strokes : this.maxStrokes
            });
        }
    }

    standings() {
        return this.players.map(player => ({
            id: player.id,
            name: player.name,
            connected: player.connected,
            strokes: player.strokes,
            total: player.scores.reduce((sum, score) => sum + score.strokes, 0),
            toPar: player.scores.reduce((sum, score) => sum + score.strokes - score.par, 0)
        }));
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/net/TurnManager.test.mjs` → Expected: 5 pass.

- [ ] **Step 5: Commit** (ask user first)

```bash
git add js/net/TurnManager.js tests/net/TurnManager.test.mjs
git commit -m "feat(net): add turn manager with away-player ordering"
```

---

### Task 5: gameState ball snapshots + REMOTE control mode

**Files:**
- Modify: `js/shotControls/controlModes.js:1-4` (add `REMOTE`; leave `CONTROL_MODE_ORDER` unchanged)
- Modify: `js/gameState.js:465-497` (`prepareForNextShot`), add two functions, extend export list `:663-686`
- Test: `tests/gameStateSnapshots.test.mjs`

**Interfaces:**
- Produces: `CONTROL_MODES.REMOTE === 'remote-phone'`; `GameState.getBallSnapshot() → { x, y, z, strokes, holed }` (`holed` true iff game state is `COMPLETE`); `GameState.loadBallSnapshot({ x, y, z, strokes }) → bool` (false while `IN_FLIGHT`; on success state is `AIMING`, club auto-selected, **no** `shotComplete` emitted).

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import * as GameState from '../js/gameState.js';
import { eventBus } from '../js/events.js';
import { CONTROL_MODES, CONTROL_MODE_ORDER } from '../js/shotControls/controlModes.js';

function makeVector(x = 0, y = 0.2, z = 0) {
    return {
        x,
        y,
        z,
        set(nextX, nextY, nextZ) {
            this.x = nextX;
            this.y = nextY;
            this.z = nextZ;
        }
    };
}

function setupGame() {
    const ball = { position: makeVector(), rotation: makeVector(0, 0, 0) };
    const arrow = { position: makeVector(0, 0.3, -1.5), rotation: makeVector(0, 0, 0), visible: true };
    GameState.initGameState({}, ball, arrow);
    GameState.setHoleData({ position: { x: 0, y: 0, z: -100 }, par: 4, distance: 200 });
    GameState.setControlMode(CONTROL_MODES.CLASSIC);
    return { ball, arrow };
}

test('REMOTE is a valid control mode but not part of the keyboard cycle', () => {
    setupGame();
    assert.equal(CONTROL_MODE_ORDER.includes(CONTROL_MODES.REMOTE), false);
    assert.equal(GameState.setControlMode(CONTROL_MODES.REMOTE), true);
});

test('loadBallSnapshot restores a player ball without announcing a finished shot', () => {
    const { ball, arrow } = setupGame();
    let shotCompleteCount = 0;
    const listener = () => shotCompleteCount++;
    eventBus.on('shotComplete', listener);

    assert.equal(GameState.loadBallSnapshot({ x: 3, y: 0.2, z: -40, strokes: 2 }), true);
    eventBus.off('shotComplete', listener);

    assert.deepEqual([ball.position.x, ball.position.z], [3, -40]);
    assert.deepEqual([arrow.position.x, arrow.position.z], [3, -40]);
    assert.equal(GameState.getGameState(), GameState.GameState.AIMING);
    assert.deepEqual(GameState.getBallSnapshot(), { x: 3, y: 0.2, z: -40, strokes: 2, holed: false });
    assert.equal(shotCompleteCount, 0);
});

test('remote shots count strokes and the ball cannot be swapped mid-flight', () => {
    setupGame();
    GameState.loadBallSnapshot({ x: 0, y: 0.2, z: 0, strokes: 0 });
    GameState.setControlMode(CONTROL_MODES.REMOTE);

    assert.equal(GameState.takeShotFromIntent({ source: CONTROL_MODES.REMOTE, power: 0.5 }), true);
    assert.equal(GameState.getGameState(), GameState.GameState.IN_FLIGHT);
    assert.equal(GameState.getBallSnapshot().strokes, 1);
    assert.equal(GameState.loadBallSnapshot({ x: 9, y: 0.2, z: -9, strokes: 0 }), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/gameStateSnapshots.test.mjs` → Expected: FAIL — `setControlMode(undefined)` returns false / `loadBallSnapshot is not a function`.

- [ ] **Step 3: Add REMOTE mode** — in `js/shotControls/controlModes.js`

```js
const CONTROL_MODES = Object.freeze({
    CLASSIC: 'classic-meter',
    TRACKBALL: 'trackball',
    REMOTE: 'remote-phone'
});
```

- [ ] **Step 4: Split `prepareForNextShot` and add snapshot functions** — replace `prepareForNextShot` in `js/gameState.js` with:

```js
function setupAimingFromBall() {
    state.direction = 0;

    if (state.directionArrow) {
        state.directionArrow.position.set(state.ball.position.x, 0.3, state.ball.position.z);
        state.directionArrow.visible = true;
    }

    autoSelectClub();
    updateDirectionArrow();
    updateShotSetupCamera();
    setGameState(GameState.AIMING);
}

/**
 * Prepare for the next shot
 */
function prepareForNextShot() {
    setupAimingFromBall();

    eventBus.emit('shotComplete', {
        distanceToHole: getDistanceToHole(),
        strokes: state.strokes,
        fullState: getFullState()
    });
}

function getBallSnapshot() {
    return {
        x: state.ball.position.x,
        y: state.ball.position.y,
        z: state.ball.position.z,
        strokes: state.strokes,
        holed: state.gameState === GameState.COMPLETE
    };
}

function loadBallSnapshot({ x, y, z, strokes }) {
    if (state.gameState === GameState.IN_FLIGHT) return false;

    state.ball.position.set(x, y, z);
    state.ball.rotation.set(0, 0, 0);
    state.strokes = strokes;
    setupAimingFromBall();
    return true;
}
```

Add `getBallSnapshot, loadBallSnapshot` to the export block at the bottom of `js/gameState.js`.

- [ ] **Step 5: Run full suite**

Run: `npm test` → Expected: all pass (including existing `gameStateControlModes.test.mjs`).

- [ ] **Step 6: Commit** (ask user first)

```bash
git add js/gameState.js js/shotControls/controlModes.js tests/gameStateSnapshots.test.mjs
git commit -m "feat(game): add per-player ball snapshots and remote control mode"
```

---

### Task 6: HostSession (host-side orchestration)

**Files:**
- Create: `js/net/HostSession.js`
- Test: `tests/net/HostSession.test.mjs`

**Interfaces:**
- Consumes: Task 1 `MSG/encode/decode`; Task 4 `TurnManager`; Task 5 `getBallSnapshot`, `loadBallSnapshot`, `CONTROL_MODES.REMOTE`; existing `GameState.setControlMode`, `GameState.takeShotFromIntent`, `GameState.nextHole`, `normalizeShotIntent`; eventBus events `holeDataUpdated {holeData}`, `shotComplete`, `holeComplete`.
- Produces: `class HostSession({ socket: {send(string)}, game, bus, requestNewHole: () => void, onChange: (view) => void, turns = new TurnManager() })` with `open()`, `handleMessage(raw)`, `startRound() → bool`, `nextHole()`, `view() → { code, phase, players: standings(), currentId }`.
- `phase` ∈ `'lobby' | 'aiming' | 'in-flight' | 'waiting' | 'hole-complete' | 'round-complete'`.
- Broadcast payload (`game:update`): `{ phase, hole, par, turnPlayerId, turnPlayerName, standings }`.

- [ ] **Step 1: Write the failing test**

```js
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
    let snapshot = { x: 0, y: 0.2, z: 0, strokes: 0, holed: false };
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/net/HostSession.test.mjs` → Expected: FAIL, module not found.

- [ ] **Step 3: Write implementation** — `js/net/HostSession.js`

```js
import { MSG, encode, decode } from './protocol.js';
import { TurnManager } from './TurnManager.js';
import { normalizeShotIntent } from '../shotControls/ShotIntent.js';
import { CONTROL_MODES } from '../shotControls/controlModes.js';

const TEE_POSITION = Object.freeze({ x: 0, y: 0.2, z: 0 });

export class HostSession {
    constructor({ socket, game, bus, requestNewHole, onChange = () => {}, turns = new TurnManager() }) {
        this.socket = socket;
        this.game = game;
        this.requestNewHole = requestNewHole;
        this.onChange = onChange;
        this.turns = turns;
        this.code = null;
        this.phase = 'lobby';
        this.holeInfo = null;

        bus.on('holeDataUpdated', ({ holeData }) => { this.holeInfo = holeData; });
        bus.on('shotComplete', () => this.handleShotFinished());
        bus.on('holeComplete', () => this.handleShotFinished());
    }

    open() {
        this.socket.send(encode(MSG.HOST_CREATE));
    }

    handleMessage(raw) {
        const message = decode(raw);
        if (!message) return;

        if (message.type === MSG.ROOM_CREATED) this.code = message.payload.code;
        if (message.type === MSG.ROOM_PLAYERS) this.handleRoster(message.payload.players);
        if (message.type === MSG.PLAYER_SHOT) this.handleShot(message.payload.playerId, message.payload.intent);
        this.onChange(this.view());
    }

    handleRoster(players) {
        this.turns.syncRoster(Array.isArray(players) ? players : []);

        const current = this.turns.current();
        const lostShooter = this.phase === 'aiming' && !current?.connected;
        if (lostShooter || this.phase === 'waiting') this.beginTurn();
        else this.broadcast();
    }

    startRound() {
        if (this.phase !== 'lobby' || !this.turns.hasActivePlayers()) return false;

        this.game.setControlMode(CONTROL_MODES.REMOTE);
        this.startHole();
        return true;
    }

    startHole() {
        const { currentHole, par, position } = this.holeInfo;
        this.turns.startHole({ hole: currentHole, par, position, tee: TEE_POSITION });
        this.beginTurn();
    }

    beginTurn() {
        const player = this.turns.advance();
        if (!player) {
            if (this.turns.isHoleComplete()) this.finishHole();
            else this.setPhase('waiting');
            return;
        }

        this.game.loadBallSnapshot({ ...player.ball, strokes: player.strokes });
        this.setPhase('aiming');
    }

    handleShot(playerId, intent) {
        if (this.phase !== 'aiming' || playerId !== this.turns.currentId) return;

        const safeIntent = intent && typeof intent === 'object' ? intent : {};
        const fired = this.game.takeShotFromIntent({
            ...normalizeShotIntent(safeIntent),
            source: CONTROL_MODES.REMOTE
        });
        if (fired) this.setPhase('in-flight');
    }

    handleShotFinished() {
        if (this.phase !== 'in-flight') return;

        const snapshot = this.game.getBallSnapshot();
        this.turns.recordShot(this.turns.currentId, {
            ball: snapshot,
            strokes: snapshot.strokes,
            holed: snapshot.holed
        });
        this.phase = 'settling';
        queueMicrotask(() => this.beginTurn());
    }

    finishHole() {
        this.turns.finishHole();
        this.setPhase('hole-complete');
    }

    nextHole() {
        if (this.phase !== 'hole-complete') return;

        if (!this.game.nextHole()) {
            this.setPhase('round-complete');
            return;
        }
        this.requestNewHole();
        this.startHole();
    }

    setPhase(phase) {
        this.phase = phase;
        this.broadcast();
    }

    broadcast() {
        const current = this.turns.current();
        this.socket.send(encode(MSG.GAME_UPDATE, {
            phase: this.phase,
            hole: this.holeInfo?.currentHole ?? null,
            par: this.holeInfo?.par ?? null,
            turnPlayerId: current?.id ?? null,
            turnPlayerName: current?.name ?? null,
            standings: this.turns.standings()
        }));
        this.onChange(this.view());
    }

    view() {
        return {
            code: this.code,
            phase: this.phase,
            players: this.turns.standings(),
            currentId: this.turns.currentId
        };
    }
}
```

Note: `queueMicrotask` defers loading the next player's ball until after `gameState.updateBallPhysics` finishes its frame (it calls `Camera.updateCamera` and `updateInfo` after `evaluateShot`).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/net/HostSession.test.mjs` → Expected: 7 pass. Then `npm test` → all pass.

- [ ] **Step 5: Commit** (ask user first)

```bash
git add js/net/HostSession.js tests/net/HostSession.test.mjs
git commit -m "feat(net): add host session orchestrating turns over the relay"
```

---

### Task 7: Host lobby UI and GameManager wiring

**Files:**
- Create: `js/ui/LobbyPanel.js`
- Modify: `js/gameManager.js` (imports; `start()`; `setupUIEventListeners()` `controlModeChangeRequested` handler; `handleHoleComplete()`)
- Modify: `style.css` (append lobby styles)
- Test: `tests/ui/LobbyPanelWiring.test.mjs` (source-level wiring checks, matching the style of `tests/ui/TrackballControlUI.test.mjs`)

**Interfaces:**
- Consumes: Task 6 `HostSession` and its `view()` shape.
- Produces: `class LobbyPanel({ onStart, onNextHole, root = document.body })` with `render({ code, phase, players, currentId })`. `phase === 'disconnected'` is a UI-only value set by GameManager when the host socket closes.

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('GameManager only starts a host session when ?host is present', async () => {
    const source = await readFile(new URL('../../js/gameManager.js', import.meta.url), 'utf8');
    assert.match(source, /new URLSearchParams\(window\.location\.search\)\.has\('host'\)/);
    assert.match(source, /new HostSession\(/);
});

test('remote rounds block control-mode cycling and the single-player results panel', async () => {
    const source = await readFile(new URL('../../js/gameManager.js', import.meta.url), 'utf8');
    const modeHandler = source.slice(source.indexOf("'controlModeChangeRequested'"));
    assert.match(modeHandler.slice(0, 200), /this\.hostSession/);
    const holeHandler = source.slice(source.indexOf('handleHoleComplete(scoreName'));
    assert.match(holeHandler.slice(0, 200), /if \(this\.hostSession\) return;/);
});

test('LobbyPanel renders player names with textContent only', async () => {
    const source = await readFile(new URL('../../js/ui/LobbyPanel.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /innerHTML/);
    assert.match(source, /textContent/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ui/LobbyPanelWiring.test.mjs` → Expected: FAIL (file missing / no match).

- [ ] **Step 3: Create `js/ui/LobbyPanel.js`**

```js
const PHASE_TITLES = {
    lobby: 'Scan or type the link on your phone to join',
    waiting: 'Waiting for a player to reconnect…',
    'hole-complete': 'Hole complete',
    'round-complete': 'Round complete!',
    disconnected: 'Lost connection to the room server. Reload to start a new room.'
};

function makeButton(label, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
}

function formatToPar(toPar) {
    if (toPar === 0) return 'E';
    return toPar > 0 ? `+${toPar}` : String(toPar);
}

export class LobbyPanel {
    constructor({ onStart, onNextHole, root = document.body }) {
        this.el = document.createElement('div');
        this.el.id = 'lobby-panel';
        this.code = document.createElement('div');
        this.code.className = 'lobby-code';
        this.joinUrl = document.createElement('div');
        this.joinUrl.className = 'lobby-url';
        this.status = document.createElement('div');
        this.status.className = 'lobby-status';
        this.list = document.createElement('ol');
        this.startButton = makeButton('START ROUND', onStart);
        this.nextButton = makeButton('NEXT HOLE', onNextHole);

        this.el.append(this.code, this.joinUrl, this.status, this.list, this.startButton, this.nextButton);
        root.appendChild(this.el);
    }

    render({ code, phase, players, currentId }) {
        this.code.textContent = code ? `Room ${code}` : 'Creating room…';
        this.joinUrl.textContent = code ? `${window.location.origin}/controller.html?room=${code}` : '';
        this.status.textContent = PHASE_TITLES[phase] ?? '';

        this.list.replaceChildren(...players.map((player) => {
            const item = document.createElement('li');
            const marker = player.id === currentId ? '▶ ' : '';
            const offline = player.connected ? '' : ' (reconnecting)';
            item.textContent = `${marker}${player.name}${offline} — ${player.strokes} this hole · ${formatToPar(player.toPar)}`;
            return item;
        }));

        this.startButton.hidden = phase !== 'lobby';
        this.nextButton.hidden = phase !== 'hole-complete';
        this.el.classList.toggle('compact', phase === 'aiming' || phase === 'in-flight');
    }
}
```

- [ ] **Step 4: Wire into `js/gameManager.js`**

Add imports at top:

```js
import { HostSession } from './net/HostSession.js';
import { LobbyPanel } from './ui/LobbyPanel.js';
```

In the constructor add `this.hostSession = null;`.

In `start()`, insert immediately before `this.generateNewHole();` (HostSession must exist before the first `holeDataUpdated` fires):

```js
        if (new URLSearchParams(window.location.search).has('host')) {
            this.startHostSession();
        }
```

Add the method:

```js
    startHostSession() {
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
        const lobby = new LobbyPanel({
            onStart: () => this.hostSession.startRound(),
            onNextHole: () => this.hostSession.nextHole()
        });

        this.hostSession = new HostSession({
            socket: { send: data => socket.readyState === WebSocket.OPEN && socket.send(data) },
            game: GameState,
            bus: eventBus,
            requestNewHole: () => this.generateNewHole(),
            onChange: view => lobby.render(view)
        });

        socket.addEventListener('open', () => this.hostSession.open());
        socket.addEventListener('message', event => this.hostSession.handleMessage(event.data));
        socket.addEventListener('close', () => lobby.render({ ...this.hostSession.view(), phase: 'disconnected' }));
        lobby.render(this.hostSession.view());
    }
```

Change the `controlModeChangeRequested` handler to:

```js
        eventBus.on('controlModeChangeRequested', (controlMode) => {
            if (this.hostSession) return;
            if (!Controls.areControlsEnabled()) return;
            GameState.setControlMode(controlMode);
        });
```

Make the first line of `handleHoleComplete(...)`:

```js
        if (this.hostSession) return;
```

- [ ] **Step 5: Append styles to `style.css`**

```css
#lobby-panel {
    position: absolute;
    top: 16px;
    right: 16px;
    z-index: 20;
    min-width: 260px;
    max-width: min(420px, calc(100vw - 32px));
    padding: 16px;
    border-radius: 12px;
    background: rgba(10, 30, 20, 0.85);
    color: #fff;
    font-family: inherit;
}

#lobby-panel .lobby-code {
    font-size: 2rem;
    font-weight: 700;
    letter-spacing: 0.15em;
}

#lobby-panel .lobby-url {
    font-size: 0.85rem;
    opacity: 0.8;
    word-break: break-all;
}

#lobby-panel ol {
    margin: 12px 0;
    padding-left: 20px;
}

#lobby-panel button {
    margin-right: 8px;
    padding: 8px 16px;
}

#lobby-panel.compact .lobby-url,
#lobby-panel.compact .lobby-status {
    display: none;
}
```

- [ ] **Step 6: Run tests**

Run: `npm test` → Expected: all pass.

- [ ] **Step 7: Manual check**

Run `npm start`. Open `http://localhost:8000/index.html` → no lobby panel, single-player works. Open `http://localhost:8000/index.html?host` → panel shows `Room XXXX` and a controller URL; pressing `M` does nothing.

- [ ] **Step 8: Commit** (ask user first)

```bash
git add js/ui/LobbyPanel.js js/gameManager.js style.css tests/ui/LobbyPanelWiring.test.mjs
git commit -m "feat(host): add room lobby panel and host session wiring"
```

---

### Task 8: Phone controller

**Files:**
- Create: `js/controller/ControllerClient.js`, `js/controller/controller.js`, `controller.html`, `controller.css`
- Test: `tests/controller/ControllerClient.test.mjs`

**Interfaces:**
- Consumes: Task 1 `MSG/encode/decode`; Task 6 `game:update` payload; existing `interpretTrackballGesture(points: [{x,y,t}]) → { valid, intent }`.
- Produces: `class ControllerClient({ storage, onChange = () => {} })` with `attach(socket: {send})`, `handleOpen()`, `handleMessage(raw)`, `handleDisconnect()`, `join(code, name)`, `isMyTurn() → bool`, `sendShot(intent) → bool`, `state: { status, playerId, name, code, update, error }`. `status` ∈ `'connecting' | 'joining' | 'joined' | 'reconnecting' | 'closed'`. Session saved under storage key `platinumtee:session` as JSON `{ code, token }`.

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { ControllerClient } from '../../js/controller/ControllerClient.js';
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/controller/ControllerClient.test.mjs` → Expected: FAIL, module not found.

- [ ] **Step 3: Implement `js/controller/ControllerClient.js`**

```js
import { MSG, encode, decode } from '../net/protocol.js';

const SESSION_KEY = 'platinumtee:session';

export class ControllerClient {
    constructor({ storage, onChange = () => {} }) {
        this.storage = storage;
        this.onChange = onChange;
        this.socket = null;
        this.state = { status: 'connecting', playerId: null, name: null, code: null, update: null, error: null };
    }

    attach(socket) {
        this.socket = socket;
    }

    set(patch) {
        this.state = { ...this.state, ...patch };
        this.onChange(this.state);
    }

    readSession() {
        try {
            const saved = JSON.parse(this.storage?.getItem(SESSION_KEY) ?? 'null');
            return saved?.code && saved?.token ? saved : null;
        } catch {
            return null;
        }
    }

    writeSession(session) {
        try {
            if (session) this.storage?.setItem(SESSION_KEY, JSON.stringify(session));
            else this.storage?.removeItem(SESSION_KEY);
        } catch {
            return;
        }
    }

    handleOpen() {
        const saved = this.readSession();
        if (saved) this.socket.send(encode(MSG.PLAYER_REJOIN, saved));
        else this.set({ status: 'joining' });
    }

    handleDisconnect() {
        if (this.state.status !== 'closed') this.set({ status: 'reconnecting' });
    }

    join(code, name) {
        this.socket.send(encode(MSG.PLAYER_JOIN, { code, name }));
    }

    handleMessage(raw) {
        const message = decode(raw);
        if (!message) return;
        const { payload } = message;

        if (message.type === MSG.PLAYER_WELCOME) {
            this.writeSession({ code: payload.code, token: payload.token });
            this.set({ status: 'joined', playerId: payload.playerId, name: payload.name, code: payload.code, error: null });
        } else if (message.type === MSG.GAME_UPDATE) {
            this.set({ update: payload });
        } else if (message.type === MSG.ROOM_CLOSED) {
            this.writeSession(null);
            this.set({ status: 'closed', update: null });
        } else if (message.type === MSG.ERROR && this.state.status !== 'joined') {
            this.writeSession(null);
            this.set({ status: 'joining', error: payload.code ?? 'UNKNOWN' });
        }
    }

    isMyTurn() {
        const { update, playerId } = this.state;
        return this.state.status === 'joined' && update?.phase === 'aiming' && update.turnPlayerId === playerId;
    }

    sendShot(intent) {
        if (!intent || !this.isMyTurn()) return false;

        this.socket.send(encode(MSG.PLAYER_SHOT, { intent }));
        this.set({ update: { ...this.state.update, phase: 'in-flight' } });
        return true;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/controller/ControllerClient.test.mjs` → Expected: 5 pass.

- [ ] **Step 5: Create `controller.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>PlatinumTee Controller</title>
    <link rel="stylesheet" href="controller.css">
</head>
<body>
    <main id="controller">
        <form id="join-form" hidden>
            <h1>PlatinumTee</h1>
            <label>Room code <input id="room-input" maxlength="4" autocomplete="off" autocapitalize="characters" required></label>
            <label>Your name <input id="name-input" maxlength="16" autocomplete="nickname" required></label>
            <button type="submit">JOIN</button>
            <p id="join-error" role="alert"></p>
        </form>
        <section id="play" hidden>
            <p id="turn-status" aria-live="polite"></p>
            <div id="swipe-pad">Pull back, then flick forward</div>
            <ol id="standings"></ol>
        </section>
        <p id="connection-status"></p>
    </main>
    <script type="module" src="js/controller/controller.js"></script>
</body>
</html>
```

- [ ] **Step 6: Create `controller.css`**

```css
:root {
    --bg: #0e2a1c;
    --fg: #ffffff;
    --accent: #f59e0b;
}

* {
    box-sizing: border-box;
}

body {
    margin: 0;
    min-height: 100vh;
    background: var(--bg);
    color: var(--fg);
    font-family: system-ui, sans-serif;
}

#controller {
    padding: 16px;
    max-width: 480px;
    margin: 0 auto;
}

#join-form label {
    display: block;
    margin-bottom: 12px;
}

#join-form input,
#join-form button {
    width: 100%;
    padding: 12px;
    font-size: 1.2rem;
}

#swipe-pad {
    height: 55vh;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px dashed rgba(255, 255, 255, 0.4);
    border-radius: 16px;
    touch-action: none;
    user-select: none;
    opacity: 0.4;
}

#swipe-pad.active {
    opacity: 1;
    border-color: var(--accent);
}

#turn-status {
    font-size: 1.3rem;
    font-weight: 700;
}

#join-error {
    color: #fca5a5;
}
```

- [ ] **Step 7: Create `js/controller/controller.js`**

```js
import { ControllerClient } from './ControllerClient.js';
import { interpretTrackballGesture } from '../shotControls/TrackballGesture.js';

const RECONNECT_DELAY_MS = 1500;
const ERROR_TEXT = {
    ROOM_NOT_FOUND: 'No room with that code.',
    ROOM_FULL: 'That room is full.',
    INVALID_NAME: 'Please enter a name.',
    INVALID_TOKEN: 'Your previous seat expired. Join again.'
};
const PHASE_TEXT = {
    lobby: 'Waiting for the host to start…',
    waiting: 'Waiting for players to reconnect…',
    'hole-complete': 'Hole complete!',
    'round-complete': 'Round complete!'
};

const els = {
    form: document.getElementById('join-form'),
    room: document.getElementById('room-input'),
    name: document.getElementById('name-input'),
    error: document.getElementById('join-error'),
    play: document.getElementById('play'),
    turn: document.getElementById('turn-status'),
    pad: document.getElementById('swipe-pad'),
    standings: document.getElementById('standings'),
    connection: document.getElementById('connection-status')
};

function safeSessionStorage() {
    try {
        return window.sessionStorage;
    } catch {
        return null;
    }
}

const client = new ControllerClient({ storage: safeSessionStorage(), onChange: render });
els.room.value = new URLSearchParams(window.location.search).get('room') ?? '';

function turnText(state) {
    const update = state.update;
    if (client.isMyTurn()) return 'Your shot!';
    if (!update) return PHASE_TEXT.lobby;
    if (update.phase === 'in-flight') return `${update.turnPlayerName ?? 'Ball'} in flight…`;
    if (update.phase === 'aiming') return `Waiting for ${update.turnPlayerName}`;
    return PHASE_TEXT[update.phase] ?? '';
}

function render(state) {
    els.form.hidden = state.status !== 'joining';
    els.play.hidden = state.status !== 'joined';
    els.error.textContent = state.error ? ERROR_TEXT[state.error] ?? 'Could not join.' : '';
    els.connection.textContent = {
        connecting: 'Connecting…',
        reconnecting: 'Reconnecting…',
        closed: 'The host closed the room.'
    }[state.status] ?? '';

    els.turn.textContent = turnText(state);
    els.pad.classList.toggle('active', client.isMyTurn());
    els.standings.replaceChildren(...(state.update?.standings ?? []).map((player) => {
        const item = document.createElement('li');
        item.textContent = `${player.name}: ${player.total} (${player.toPar >= 0 ? '+' : ''}${player.toPar})`;
        return item;
    }));
}

function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
    client.attach({ send: data => socket.readyState === WebSocket.OPEN && socket.send(data) });

    socket.addEventListener('open', () => client.handleOpen());
    socket.addEventListener('message', event => client.handleMessage(event.data));
    socket.addEventListener('close', () => {
        client.handleDisconnect();
        if (client.state.status !== 'closed') setTimeout(connect, RECONNECT_DELAY_MS);
    });
}

els.form.addEventListener('submit', (event) => {
    event.preventDefault();
    client.join(els.room.value, els.name.value);
});

let points = [];
els.pad.addEventListener('pointerdown', (event) => {
    if (!client.isMyTurn()) return;
    els.pad.setPointerCapture(event.pointerId);
    points = [{ x: event.clientX, y: event.clientY, t: event.timeStamp }];
});
els.pad.addEventListener('pointermove', (event) => {
    if (points.length) points.push({ x: event.clientX, y: event.clientY, t: event.timeStamp });
});
els.pad.addEventListener('pointerup', () => {
    const result = interpretTrackballGesture(points);
    points = [];
    if (result.valid) client.sendShot(result.intent);
});
els.pad.addEventListener('pointercancel', () => { points = []; });

render(client.state);
connect();
```

- [ ] **Step 8: Run full suite**

Run: `npm test` → Expected: all pass.

- [ ] **Step 9: End-to-end manual test**

1. `npm start`; note the `Phones on this network` URL it prints.
2. Laptop: `http://localhost:8000/index.html?host` → note room code.
3. Phone A + phone B (or two browser windows with the device toolbar) → open the LAN controller URL, enter code + names → both appear in the host lobby.
4. Press START ROUND → phone A shows "Your shot!", phone B shows "Waiting for A".
5. Swipe on phone A → ball flies on host; afterwards phone B gets the turn.
6. Lock phone B mid-turn → host turn moves to A within a few seconds; unlock B → B rejoins (no join form) and reappears connected.
7. Play until both hole out → host shows NEXT HOLE; phones show "Hole complete!" with standings.
8. Close the host tab → phones show "The host closed the room."

- [ ] **Step 10: Commit** (ask user first)

```bash
git add controller.html controller.css js/controller tests/controller
git commit -m "feat(controller): add phone controller page with swipe shots"
```

---

## Follow-up plans (not in this plan)

1. **Headless simulation** — fixed-timestep physics, decouple `gameState` from `Camera`/Three.js, move authority to the server (fixes audit C4/C5, enables host reconnect).
2. **Host reconnect & room persistence** — keep the room alive for N seconds after the host drops.
3. **QR code on the lobby panel** and HTTPS (needed for phone `DeviceMotionEvent` swing input on iOS).
4. **Per-player scorecard UI on the host** replacing the single-player `ResultsPanel`.
