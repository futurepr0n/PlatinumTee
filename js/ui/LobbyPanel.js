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

    render({ code, phase, players, currentId, joinHosts = [] }) {
        this.code.textContent = code ? `Room ${code}` : 'Creating room…';
        const { hostname, protocol, origin } = window.location;
        const isLoopback = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname);
        const base = isLoopback && joinHosts[0] ? `${protocol}//${joinHosts[0]}` : origin;
        this.joinUrl.textContent = code ? `${base}/controller.html?room=${code}` : '';
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
