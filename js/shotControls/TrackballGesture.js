import { clamp, clamp01, normalizeShotIntent } from './ShotIntent.js';

const MIN_FLICK_DISTANCE = 24;
const MIN_FORWARD_RATIO = 0.25;
const MIN_STRIKE_DISTANCE = 28;
const MAX_POWER_DISTANCE = 170;
const MAX_POWER_VELOCITY = 1.3;
const MAX_ROLLBACK_DISTANCE = 95;
const SIDE_DEADZONE_DEGREES = 8;
const MAX_SIDE_ANGLE_DEGREES = 30;
const POWER_CALIBRATION_MULTIPLIER = 2.25;

function getSideRatio(dx, forward) {
    const angle = Math.atan2(dx, Math.max(forward, 1)) * (180 / Math.PI);
    const magnitude = Math.abs(angle);
    if (magnitude <= SIDE_DEADZONE_DEGREES) return 0;

    const adjusted = (magnitude - SIDE_DEADZONE_DEGREES) / (MAX_SIDE_ANGLE_DEGREES - SIDE_DEADZONE_DEGREES);
    return Math.sign(angle) * clamp(adjusted, 0, 1);
}

function getForwardGestureVector(points) {
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

function getRollbackApex(points) {
    const start = points[0];
    return points.reduce((apex, point, index) => {
        const rollback = point.y - start.y;
        return rollback > apex.rollback ? { point, index, rollback } : apex;
    }, { point: start, index: 0, rollback: 0 });
}

function getStrikeVector(points) {
    const { point: rollbackPoint, index: rollbackIndex, rollback } = getRollbackApex(points);
    const end = points[points.length - 1];
    const dx = end.x - rollbackPoint.x;
    const dy = end.y - rollbackPoint.y;
    const dt = Math.max(1, end.t - rollbackPoint.t);
    const distance = Math.hypot(dx, dy);
    const forward = Math.max(0, -dy);
    const velocity = distance / dt;
    const sideRatio = getSideRatio(dx, forward);

    return {
        dx,
        dy,
        dt,
        distance,
        forward,
        velocity,
        rollback: Math.max(0, rollback),
        rollbackIndex,
        sideRatio
    };
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

    const strike = getStrikeVector(points);
    const fallback = getForwardGestureVector(points);
    const forwardRatio = strike.forward / Math.max(strike.distance, 1);

    if (fallback.distance < MIN_FLICK_DISTANCE || strike.distance < MIN_STRIKE_DISTANCE || forwardRatio < MIN_FORWARD_RATIO) {
        return { valid: false, reason: 'gesture-too-small' };
    }

    const distancePower = strike.forward / MAX_POWER_DISTANCE;
    const velocityPower = strike.velocity / MAX_POWER_VELOCITY;
    const rollbackCharge = clamp01(strike.rollback / MAX_ROLLBACK_DISTANCE);
    const sideRatio = strike.sideRatio;
    const directionOffset = clamp(sideRatio * 10, -10, 10);
    const curve = Math.sign(sideRatio) * Math.abs(sideRatio) ** 1.5;
    const rawPower = distancePower * 0.5 + velocityPower * 0.25 + rollbackCharge * 0.25;
    const power = clamp01(rawPower * POWER_CALIBRATION_MULTIPLIER);
    const accuracy = 0.5;
    const strikeQuality = clamp01(1 - Math.abs(sideRatio) * 0.7);

    return {
        valid: true,
        intent: normalizeShotIntent({
            directionOffset,
            power,
            accuracy,
            curve,
            spin: clamp(rollbackCharge * 0.65 + distancePower * 0.35, -1, 1),
            launchModifier: 1,
            source: 'trackball'
        }),
        metrics: {
            distance: fallback.distance,
            forward: strike.forward,
            velocity: strike.velocity,
            rollback: strike.rollback,
            rollbackCharge,
            rawPower,
            calibratedPower: power,
            strikeDistance: strike.distance,
            strikeQuality,
            rollbackIndex: strike.rollbackIndex,
            sideRatio
        }
    };
}

export {
    interpretTrackballGesture
};
