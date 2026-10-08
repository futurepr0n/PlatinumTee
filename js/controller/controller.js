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
