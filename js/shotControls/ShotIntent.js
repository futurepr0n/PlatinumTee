const DEFAULT_SOURCE = 'classic-meter';

function clamp(value, min, max) {
    const numericValue = Number.isFinite(value) ? value : min;
    return Math.max(min, Math.min(max, numericValue));
}

function clamp01(value) {
    return clamp(value, 0, 1);
}

function normalizeSource(source) {
    return typeof source === 'string' && source.length > 0 ? source : DEFAULT_SOURCE;
}

function normalizeShotIntent(intent = {}) {
    return {
        directionOffset: clamp(intent.directionOffset ?? 0, -45, 45),
        power: clamp01(intent.power ?? 0),
        accuracy: clamp01(intent.accuracy ?? 0.5),
        curve: clamp(intent.curve ?? 0, -1, 1),
        spin: clamp(intent.spin ?? 0, -1, 1),
        launchModifier: clamp(intent.launchModifier ?? 1, 0.5, 2),
        source: normalizeSource(intent.source)
    };
}

function createClassicShotIntent({ directionOffset = 0, power = 0, accuracy = 0.5 } = {}) {
    return normalizeShotIntent({
        directionOffset,
        power,
        accuracy,
        curve: 0,
        spin: 0,
        launchModifier: 1,
        source: DEFAULT_SOURCE
    });
}

export {
    clamp,
    clamp01,
    createClassicShotIntent,
    normalizeShotIntent
};
