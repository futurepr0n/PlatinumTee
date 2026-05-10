// js/utils/logger.js - Centralized logging utility

const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    NONE: 4
};

let currentLogLevel = LOG_LEVELS.INFO; // Default log level

export function setLogLevel(level) {
    if (LOG_LEVELS[level.toUpperCase()] !== undefined) {
        currentLogLevel = LOG_LEVELS[level.toUpperCase()];
        console.log(`Log level set to: ${level.toUpperCase()}`);
    } else {
        console.warn(`Invalid log level: ${level}. Using current level: ${Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === currentLogLevel)}`);
    }
}

export function debug(message, ...args) {
    if (currentLogLevel <= LOG_LEVELS.DEBUG) {
        console.log(`[DEBUG] ${message}`, ...args);
    }
}

export function info(message, ...args) {
    if (currentLogLevel <= LOG_LEVELS.INFO) {
        console.info(`[INFO] ${message}`, ...args);
    }
}

export function warn(message, ...args) {
    if (currentLogLevel <= LOG_LEVELS.WARN) {
        console.warn(`[WARN] ${message}`, ...args);
    }
}

export function error(message, ...args) {
    if (currentLogLevel <= LOG_LEVELS.ERROR) {
        console.error(`[ERROR] ${message}`, ...args);
    }
}

// Optionally, export a default instance for convenience
export default {
    debug,
    info,
    warn,
    error,
    setLogLevel
};
