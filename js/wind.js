const WIND_LIMITS = Object.freeze({
    maxSpeed: 20,
    gustSpeedFraction: 0.25,
    gustDirectionDegrees: 15
});

function rollSpeed(random) {
    const band = random();
    const within = random();
    if (band < 0.25) return Math.floor(within * 4);
    if (band < 0.7) return 4 + Math.floor(within * 8);
    return 12 + Math.floor(within * (WIND_LIMITS.maxSpeed - 11));
}

function directionDelta(a, b) {
    return Math.abs(((b - a + 540) % 360) - 180);
}

function rollOnce(random) {
    return {
        direction: Math.floor(random() * 360) % 360,
        speed: Math.min(WIND_LIMITS.maxSpeed, rollSpeed(random))
    };
}

function rollHoleWind(previous = null, random = Math.random) {
    let wind = rollOnce(random);
    if (!previous) return wind;

    for (let attempt = 0; attempt < 10; attempt++) {
        const different = directionDelta(previous.direction, wind.direction) >= 45 ||
            Math.abs(previous.speed - wind.speed) >= 5;
        if (different) return wind;
        wind = rollOnce(random);
    }
    return { direction: (previous.direction + 90 + Math.floor(random() * 180)) % 360, speed: wind.speed };
}

function gustWind(base, random = Math.random) {
    const speedFactor = 1 + (random() * 2 - 1) * WIND_LIMITS.gustSpeedFraction;
    const turn = (random() * 2 - 1) * WIND_LIMITS.gustDirectionDegrees;
    return {
        direction: Math.round(((base.direction + turn) % 360 + 360) % 360) % 360,
        speed: Math.max(0, Math.round(base.speed * speedFactor * 10) / 10)
    };
}

export { WIND_LIMITS, rollHoleWind, gustWind };
