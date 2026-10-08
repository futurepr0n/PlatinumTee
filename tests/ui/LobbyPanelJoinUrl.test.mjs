import test from 'node:test';
import assert from 'node:assert/strict';

function fakeEl() {
    return {
        children: [], classList: { toggle() {} }, addEventListener() {}, textContent: '',
        append(...c) { this.children.push(...c); },
        appendChild(c) { this.children.push(c); },
        replaceChildren() {}
    };
}

async function render(location, joinHosts) {
    globalThis.document = { createElement: fakeEl };
    globalThis.window = { location };
    const { LobbyPanel } = await import('../../js/ui/LobbyPanel.js');
    const panel = new LobbyPanel({ onStart() {}, onNextHole() {}, root: fakeEl() });
    panel.render({ code: 'ABCD', phase: 'lobby', players: [], currentId: null, joinHosts });
    return panel.joinUrl.textContent;
}

test('localhost host screens advertise the LAN address to phones', async () => {
    const url = await render({ hostname: 'localhost', protocol: 'http:', origin: 'http://localhost:8000' }, ['192.168.1.5:8000']);
    assert.equal(url, 'http://192.168.1.5:8000/controller.html?room=ABCD');
});

test('non-loopback origins and missing joinHosts keep the current origin', async () => {
    assert.equal(
        await render({ hostname: '192.168.1.9', protocol: 'http:', origin: 'http://192.168.1.9:8000' }, ['10.0.0.2:8000']),
        'http://192.168.1.9:8000/controller.html?room=ABCD'
    );
    assert.equal(
        await render({ hostname: 'localhost', protocol: 'http:', origin: 'http://localhost:8000' }, []),
        'http://localhost:8000/controller.html?room=ABCD'
    );
});
