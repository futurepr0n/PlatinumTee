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
