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
