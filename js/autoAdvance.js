const HOLE_AUTO_ADVANCE_MS = 5000;

function createAutoAdvance({
    onAdvance,
    delayMs = HOLE_AUTO_ADVANCE_MS,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = id => clearTimeout(id)
}) {
    let pending = null;

    function cancel() {
        if (pending === null) return;
        clearTimer(pending);
        pending = null;
    }

    function schedule() {
        cancel();
        pending = setTimer(() => {
            pending = null;
            onAdvance();
        }, delayMs);
    }

    return { schedule, cancel };
}

export { HOLE_AUTO_ADVANCE_MS, createAutoAdvance };
