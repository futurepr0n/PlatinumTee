const CONTROL_MODES = Object.freeze({
    CLASSIC: 'classic-meter',
    TRACKBALL: 'trackball',
    REMOTE: 'remote-phone'
});

const CONTROL_MODE_ORDER = Object.freeze([
    CONTROL_MODES.CLASSIC,
    CONTROL_MODES.TRACKBALL
]);

function getNextControlMode(currentMode) {
    const index = CONTROL_MODE_ORDER.indexOf(currentMode);
    const nextIndex = index === -1 ? 0 : (index + 1) % CONTROL_MODE_ORDER.length;
    return CONTROL_MODE_ORDER[nextIndex];
}

export {
    CONTROL_MODES,
    CONTROL_MODE_ORDER,
    getNextControlMode
};
