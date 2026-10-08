import test from 'node:test';
import assert from 'node:assert/strict';

import { describeShotShape, backspinForClub } from '../js/shotShape.js';
import { getClub } from '../js/clubs.js';

test('shot shapes follow right-handed conventions', () => {
    assert.equal(describeShotShape(0), 'Straight');
    assert.equal(describeShotShape(0.04), 'Straight');
    assert.equal(describeShotShape(0.2), 'Fade');
    assert.equal(describeShotShape(0.7), 'Slice');
    assert.equal(describeShotShape(-0.2), 'Draw');
    assert.equal(describeShotShape(-0.7), 'Hook');
});

test('backspin rises with loft and is zero for the putter', () => {
    const driver = backspinForClub(getClub('driver'));
    const iron = backspinForClub(getClub('iron7'));
    const wedge = backspinForClub(getClub('sandWedge'));
    assert.ok(driver < iron && iron < wedge);
    assert.equal(backspinForClub(getClub('putter'), 1), 0);
    assert.ok(backspinForClub(getClub('sandWedge'), 1) <= 1);
});
