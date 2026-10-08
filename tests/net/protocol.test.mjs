import test from 'node:test';
import assert from 'node:assert/strict';

import {
    MSG,
    MAX_MESSAGE_BYTES,
    encode,
    decode,
    normalizeRoomCode,
    sanitizeName,
    generateRoomCode
} from '../../js/net/protocol.js';

test('encode/decode round-trips a known message', () => {
    assert.deepEqual(decode(encode(MSG.PLAYER_JOIN, { code: 'ABCD', name: 'Sam' })), {
        type: MSG.PLAYER_JOIN,
        payload: { code: 'ABCD', name: 'Sam' }
    });
});

test('decode rejects malformed, unknown and oversized messages', () => {
    assert.equal(decode('not json'), null);
    assert.equal(decode(JSON.stringify({ type: 'evil:thing', payload: {} })), null);
    assert.equal(decode(JSON.stringify(null)), null);
    assert.equal(decode('x'.repeat(MAX_MESSAGE_BYTES + 1)), null);
});

test('decode replaces non-object payloads with an empty object', () => {
    assert.deepEqual(decode(JSON.stringify({ type: MSG.HOST_CREATE, payload: [1] })).payload, {});
    assert.deepEqual(decode(Buffer.from(JSON.stringify({ type: MSG.HOST_CREATE }))).payload, {});
});

test('normalizeRoomCode uppercases and rejects ambiguous letters', () => {
    assert.equal(normalizeRoomCode(' abcd '), 'ABCD');
    assert.equal(normalizeRoomCode('ABCI'), null);
    assert.equal(normalizeRoomCode('ABC'), null);
    assert.equal(normalizeRoomCode(42), null);
});

test('sanitizeName strips markup and control characters and caps length', () => {
    assert.equal(sanitizeName('  <b>Ann</b>\u0007 '), 'bAnn/b');
    assert.equal(sanitizeName('x'.repeat(40)).length, 16);
    assert.equal(sanitizeName('   '), null);
    assert.equal(sanitizeName(null), null);
});

test('generateRoomCode skips taken codes', () => {
    const values = [0, 0, 0, 0, 0.99, 0.99, 0.99, 0.99];
    const random = () => values.shift();
    assert.equal(generateRoomCode(code => code === 'AAAA', random), 'ZZZZ');
});
