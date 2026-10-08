import { clamp01 } from './shotControls/ShotIntent.js';

function describeShotShape(curve) {
    const magnitude = Math.abs(curve);
    if (magnitude < 0.05) return 'Straight';
    if (curve > 0) return magnitude < 0.4 ? 'Fade' : 'Slice';
    return magnitude < 0.4 ? 'Draw' : 'Hook';
}

function backspinForClub(club, spinInput = 0) {
    if (club.name === 'putter') return 0;
    const loftRank = 1 - club.maxDistance / 400;
    return clamp01(0.1 + loftRank * 0.7 + spinInput * 0.3);
}

export { describeShotShape, backspinForClub };
