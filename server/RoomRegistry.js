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
        if (this.connections.has(connId)) return { error: 'ALREADY_IN_ROOM' };
        if (room.players.size >= this.maxPlayers) {
            const ghost = [...room.players.values()].find(candidate => !candidate.connected);
            if (!ghost) return { error: 'ROOM_FULL' };
            room.players.delete(ghost.id);
        }

        const player = { id: randomUUID(), token: randomUUID(), name, connId, connected: true };
        room.players.set(player.id, player);
        this.connections.set(connId, { code: room.code, role: 'player', playerId: player.id });
        return { room, player };
    }

    rejoinRoom(rawCode, connId, token) {
        const room = this.findRoom(rawCode);
        if (!room) return { error: 'ROOM_NOT_FOUND' };

        if (typeof token !== 'string') return { error: 'INVALID_TOKEN' };
        const player = [...room.players.values()].find(candidate => candidate.token === token);
        if (!player) return { error: 'INVALID_TOKEN' };

        const existing = this.connections.get(connId);
        const isSameSlot = existing?.role === 'player' && existing.playerId === player.id && existing.code === room.code;
        if (existing && !isSameSlot) return { error: 'ALREADY_IN_ROOM' };

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
