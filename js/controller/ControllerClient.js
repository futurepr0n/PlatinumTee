import { MSG, encode, decode } from '../net/protocol.js';

const SESSION_KEY = 'platinumtee:session';
export const SHOT_ACK_TIMEOUT_MS = 2000;

export class ControllerClient {
    constructor({
        storage,
        onChange = () => {},
        setTimer = (fn, ms) => setTimeout(fn, ms),
        clearTimer = id => clearTimeout(id)
    }) {
        this.storage = storage;
        this.onChange = onChange;
        this.setTimer = setTimer;
        this.clearTimer = clearTimer;
        this.pendingAck = null;
        this.socket = null;
        this.state = { status: 'connecting', playerId: null, name: null, code: null, update: null, error: null };
    }

    clearPendingAck() {
        if (!this.pendingAck) return;
        this.clearTimer(this.pendingAck.timer);
        this.pendingAck = null;
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
        this.clearPendingAck();
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
            this.clearPendingAck();
            this.set({ update: payload });
        } else if (message.type === MSG.ROOM_CLOSED) {
            this.clearPendingAck();
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

        this.clearPendingAck();
        const previous = this.state.update;
        const pending = { timer: null, previous };
        this.pendingAck = pending;
        this.socket.send(encode(MSG.PLAYER_SHOT, { intent }));
        this.set({ update: { ...previous, phase: 'in-flight' } });
        pending.timer = this.setTimer(() => {
            if (this.pendingAck !== pending) return;
            this.pendingAck = null;
            this.set({ update: pending.previous });
        }, SHOT_ACK_TIMEOUT_MS);
        return true;
    }
}
