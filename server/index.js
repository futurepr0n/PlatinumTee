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
