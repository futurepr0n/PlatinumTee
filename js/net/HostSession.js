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
