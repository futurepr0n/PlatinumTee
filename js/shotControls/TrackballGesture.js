import { clamp, clamp01, normalizeShotIntent } from './ShotIntent.js';

const MIN_FLICK_DISTANCE = 24;
const MIN_FORWARD_RATIO = 0.25;
const MAX_POWER_DISTANCE = 260;
const MAX_POWER_VELOCITY = 1.6;
const MAX_SIDE_DRIFT = 160;

function getGestureVector(points) {
    const start = points[0];
    const end = points[points.length - 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dt = Math.max(1, end.t - start.t);
    const distance = Math.hypot(dx, dy);
    const forward = Math.max(0, -dy);
    const velocity = distance / dt;

    return { dx, dy, dt, distance, forward, velocity };
}

function hasFiniteGesturePoints(points) {
    return points.every(({ x, y, t }) => (
        Number.isFinite(x) &&
        Number.isFinite(y) &&
        Number.isFinite(t)
    ));
}

function interpretTrackballGesture(points) {
    if (!Array.isArray(points) || points.length < 2) {
        return { valid: false, reason: 'gesture-too-small' };
    }

    if (!hasFiniteGesturePoints(points)) {
        return { valid: false, reason: 'gesture-too-small' };
    }

    const { dx, distance, forward, velocity } = getGestureVector(points);
    const forwardRatio = forward / Math.max(distance, 1);

    if (distance < MIN_FLICK_DISTANCE || forwardRatio < MIN_FORWARD_RATIO) {
        return { valid: false, reason: 'gesture-too-small' };
    }

    const distancePower = distance / MAX_POWER_DISTANCE;
    const velocityPower = velocity / MAX_POWER_VELOCITY;
    const sideRatio = clamp(dx / MAX_SIDE_DRIFT, -1, 1);
    const directionOffset = clamp(sideRatio * 35, -35, 35);
    const power = clamp01(distancePower * 0.65 + velocityPower * 0.35);
    const accuracy = clamp01(1 - Math.abs(sideRatio) * 0.7);

    return {
        valid: true,
        intent: normalizeShotIntent({
            directionOffset,
            power,
            accuracy,
            curve: sideRatio,
            spin: clamp(forward / MAX_POWER_DISTANCE, -1, 1),
            launchModifier: 1,
            source: 'trackball'
        }),
        metrics: {
            distance,
            forward,
            velocity,
            sideRatio
        }
    };
}

export {
    interpretTrackballGesture
};
