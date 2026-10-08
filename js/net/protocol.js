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
