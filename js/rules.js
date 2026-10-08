const MAX_STROKES_PER_HOLE = 10;

const COURSE_BOUNDS = Object.freeze({
    halfWidth: 100,
    minZ: -500,
    maxZ: 500
});

function isOutOfBounds({ x, z }) {
    return Math.abs(x) > COURSE_BOUNDS.halfWidth || z < COURSE_BOUNDS.minZ || z > COURSE_BOUNDS.maxZ;
}

export {
    MAX_STROKES_PER_HOLE,
    COURSE_BOUNDS,
    isOutOfBounds
};
