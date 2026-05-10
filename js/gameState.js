// gameState.js - Manages game state, scoring, and progression

import { getTerrainData } from './course.js';
import { BallPhysics } from './physics.js';
import { getClub, recommendClub } from './clubs.js';
import * as Camera from './camera.js';
import { eventBus } from './events.js'; // Import eventBus
import logger from './utils/logger.js'; // Import logger
import { createClassicShotIntent, normalizeShotIntent } from './shotControls/ShotIntent.js';
import { CONTROL_MODES } from './shotControls/controlModes.js';

// Game state enum
const GameState = {
    INITIALIZING: 'initializing',
    AIMING: 'aiming',
    POWER: 'power',
    ACCURACY: 'accuracy',
    IN_FLIGHT: 'in-flight',
    EVALUATING: 'evaluating',
    COMPLETE: 'complete'
};

// Centralized game state object
let state = {
    gameState: GameState.INITIALIZING,
    direction: 0,
    power: 0,
    accuracy: 0,
    shotInfo: { power: 0, accuracy: 0, direction: 0, club: '', controlMode: CONTROL_MODES.CLASSIC },
    currentControlMode: CONTROL_MODES.CLASSIC,
    currentHole: 1,
    totalHoles: 9,
    strokes: 0,
    scoreCard: [],
    currentClub: 'driver', // Default to driver
    holeData: {
        position: { x: 0, y: 0, z: -20 },
        par: 3,
        distance: 100
    },
    windData: {
        direction: 0, // in degrees (0 = North, 90 = East, etc.)
        speed: 0      // in mph
    },
    ballPhysics: null,
    ball: null, // Reference to Three.js ball object
    scene: null, // Reference to Three.js scene object
    directionArrow: null // Reference to Three.js direction arrow object
};

/**
 * Initialize the game state module
 * @param {Object} sceneRef - Reference to Three.js scene
 * @param {Object} ballRef - Reference to the ball object
 * @param {Object} arrowRef - Reference to the direction arrow
 */
function initGameState(sceneRef, ballRef, arrowRef) {
    state.scene = sceneRef;
    state.ball = ballRef;
    state.directionArrow = arrowRef;
    
    // Start in aiming state
    setGameState(GameState.AIMING);
    
    // Generate initial wind
    generateWind();
}

/**
 * Set the current game state
 * @param {string} state - New game state
 */
function setGameState(newStateValue) {
    const oldState = state.gameState;
    state.gameState = newStateValue;
    
    eventBus.emit('gameStateChanged', { oldState, newState: newStateValue, fullState: getFullState() });
    
    // Update UI information (this will be handled by event listeners now)
    // updateInfo(); // No longer needed directly here
}

/**
 * Get the current game state
 * @returns {string} Current game state
 */
function getGameState() {
    return state.gameState;
}

/**
 * Set the hole data
 * @param {Object} data - Hole data
 */
function setHoleData(data) {
    state.holeData = { ...data };
    
    // Update camera with hole position
    Camera.setHolePosition(state.holeData.position);
    
    // Reset stroke count for new hole
    state.strokes = 0;
    
    const fullState = getFullState();
    eventBus.emit('holeDataUpdated', { holeData: fullState.holeData, fullState });
    
    // Update UI information (this will be handled by event listeners now)
    // updateInfo(); // No longer needed directly here
}

/**
 * Generate random wind direction and speed
 */
function generateWind() {
    state.windData.direction = Math.floor(Math.random() * 360);
    state.windData.speed = Math.floor(Math.random() * 15); // 0-15 mph
    
    eventBus.emit('windDataUpdated', { windData: state.windData, fullState: getFullState() });
    
    // Update UI information (this will be handled by event listeners now)
    // updateInfo(); // No longer needed directly here
}

/**
 * Adjust shot direction
 * @param {number} amount - Amount to adjust direction in degrees
 */
function adjustDirection(amount) {
    // Only allow direction adjustment in aiming state
    if (state.gameState !== GameState.AIMING) return;
    
    // Limit direction adjustment to -45 to 45 degrees
    state.direction = Math.max(-45, Math.min(45, state.direction + amount));
    
    // Update direction arrow
    updateDirectionArrow();
    
    eventBus.emit('directionUpdated', { direction: state.direction, fullState: getFullState() });
    
    // Update UI information (this will be handled by event listeners now)
    // updateInfo(); // No longer needed directly here
}

/**
 * Set absolute direction value
 * @param {number} value - Direction in degrees
 */
function setDirection(value) {
    // Only allow direction setting in aiming state
    if (state.gameState !== GameState.AIMING) return;
    
    // Limit direction to -45 to 45 degrees
    state.direction = Math.max(-45, Math.min(45, value));
    
    // Update direction arrow
    updateDirectionArrow();
    
    eventBus.emit('directionUpdated', { direction: state.direction, fullState: getFullState() });
    
    // Update UI information (this will be handled by event listeners now)
    // updateInfo(); // No longer needed directly here
}

/**
 * Update the direction arrow based on current direction
 */
function updateDirectionArrow() {
    if (!state.directionArrow) return;
    
    // Calculate angle to hole from ball position
    const angleToHole = calculateAngleToHole();
    
    // Calculate the final direction (angle to hole + player adjustment)
    const finalDirection = angleToHole + state.direction;
    
    // Update arrow rotation
    state.directionArrow.rotation.x = Math.PI / 2; // Keep pointing forward
    state.directionArrow.rotation.z = finalDirection * (Math.PI / 180);
}

/**
 * Calculate angle from ball to hole
 * @returns {number} Angle in degrees
 */
function calculateAngleToHole() {
    // If ball doesn't exist, return 0
    if (!state.ball) return 0;
    
    // Calculate vector from ball to hole
    const dx = state.holeData.position.x - state.ball.position.x;
    const dz = state.holeData.position.z - state.ball.position.z;
    
    // Calculate angle in radians, then convert to degrees
    // atan2 gives angle in the range (-PI, PI)
    // Negative Z is "forward" in Three.js, so we need to adjust our math
    // to make 0 degrees point up/north (negative Z)
    let angle = Math.atan2(dx, -dz) * (180 / Math.PI);
    
    // Return the angle
    return angle;
}

function getDistanceToHole() {
    if (!state.ball || !state.holeData?.position) return 0;

    return Math.sqrt(
        Math.pow(state.ball.position.x - state.holeData.position.x, 2) +
        Math.pow(state.ball.position.z - state.holeData.position.z, 2)
    );
}

function getFullState() {
    return {
        ...state,
        distanceToHole: getDistanceToHole(),
        holeData: {
            ...state.holeData,
            currentHole: state.currentHole
        }
    };
}

function updateInfo() {
    eventBus.emit('gameStateChanged', {
        oldState: state.gameState,
        newState: state.gameState,
        fullState: getFullState()
    });
}

/**
 * Start the power meter for a shot
 */
function startPowerMeter() {
    // Only allow starting power meter in aiming state
    if (state.gameState !== GameState.AIMING) return false;
    if (state.currentControlMode !== CONTROL_MODES.CLASSIC) return false;
    
    // Change game state
    setGameState(GameState.POWER);
    
    // Reset power
    state.power = 0;
    return true;
}

/**
 * Set the shot power
 * @param {number} value - Power value (0-1)
 */
function setPower(value) {
    // Only allow setting power in power state
    if (state.gameState !== GameState.POWER) return;
    
    // Clamp power between 0 and 1
    state.power = Math.max(0, Math.min(1, value));
    
    // Change game state to accuracy
    setGameState(GameState.ACCURACY);
    
    // Reset accuracy
    state.accuracy = 0;
}

/**
 * Set the shot accuracy
 * @param {number} value - Accuracy value (0-1)
 */
function setAccuracy(value) {
    // Only allow setting accuracy in accuracy state
    if (state.gameState !== GameState.ACCURACY) return;
    
    // Clamp accuracy between 0 and 1
    state.accuracy = Math.max(0, Math.min(1, value));
    
    // Increment stroke count
    state.strokes++;
    
    // Take the shot
    takeShot(createClassicShotIntent({
        directionOffset: state.direction,
        power: state.power,
        accuracy: state.accuracy
    }));
}

/**
 * Take a shot with the current power, accuracy, and direction
 */
function takeShot(intentData) {
    const intent = normalizeShotIntent(intentData);
    state.power = intent.power;
    state.accuracy = intent.accuracy;

    const accuracyEffect = (intent.accuracy - 0.5) * 2;
    const angleToHole = calculateAngleToHole();
    const curveEffect = intent.curve * 20;
    const finalDirection = angleToHole + intent.directionOffset + (accuracyEffect * 45) + curveEffect;
    
    // Store shot info
    state.shotInfo = {
        power: state.power.toFixed(2),
        accuracy: state.accuracy.toFixed(2),
        direction: finalDirection.toFixed(2),
        club: state.currentClub,
        controlMode: intent.source
    };
    
    // Update game state
    setGameState(GameState.IN_FLIGHT);
    
    // Hide direction arrow during flight
    if (state.directionArrow) {
        state.directionArrow.visible = false;
    }
    
    // Get current club properties
    const club = getClub(state.currentClub);
    
    // Initialize ball physics - now with hole position
    state.ballPhysics = new BallPhysics(
        {
            x: state.ball.position.x,
            y: state.ball.position.y,
            z: state.ball.position.z
        },
        finalDirection,
        state.power,
        club,
        { 
            direction: state.windData.direction, 
            speed: state.windData.speed 
        },
        state.holeData.position // Pass hole position for better collision detection
    );
    
    // DEBUG: Log shot parameters
    logger.debug(`Shot: club=${state.currentClub}, power=${state.power.toFixed(2)}, direction=${finalDirection.toFixed(1)}°`);
    
    // Update camera to follow the ball
    Camera.setFollowMode(state.ball.position);
    
    // Update UI information
    updateInfo();
}

/**
 * Update the ball physics for the current frame
 * @returns {boolean} True if the ball is still in motion
 */
function updateBallPhysics() {
    if (state.gameState !== GameState.IN_FLIGHT || !state.ballPhysics || !state.ballPhysics.isInFlight) {
        return false;
    }
    
    // Get terrain data for collision detection
    const terrain = getTerrainData();
    
    // Update physics and apply to ball
    const isStillMoving = state.ballPhysics.update(state.ball, terrain);
    
    // If ball has stopped, evaluate the shot
    if (!isStillMoving) {
        evaluateShot();
    }
    
    // Update camera to follow ball
    Camera.updateCamera(state.ball.position);
    
    // Update UI information with current distance
    updateInfo();
    
    return isStillMoving;
}

/**
 * Evaluate the shot result
 */
function evaluateShot() {
    // Change game state
    setGameState(GameState.EVALUATING);
    
    // Calculate distance to hole
    const distanceToHole = Math.sqrt(
        Math.pow(state.ball.position.x - state.holeData.position.x, 2) +
        Math.pow(state.ball.position.z - state.holeData.position.z, 2)
    );
    
    // Check if ball is in hole - either via physics detection or position check
    if (state.ballPhysics.inHole || distanceToHole < 0.15) {
        // Ball in hole - ensure proper positioning for visual effect
        state.ball.position.x = state.holeData.position.x;
        state.ball.position.z = state.holeData.position.z;
        state.ball.position.y = state.holeData.position.y - 0.05; // Slightly below hole level
        
        logger.info("HOLE COMPLETE! Ball is in the hole.");
        
        // Complete the hole
        completeHole();
    } else {
        // Ball is not in hole - set up for next shot
        prepareForNextShot();
    }
}

/**
 * Complete the current hole
 */
function completeHole() {
    // Calculate score relative to par
    const relativeToPar = state.strokes - state.holeData.par;
    
    // Update score card
    state.scoreCard.push({
        hole: state.currentHole,
        par: state.holeData.par,
        distance: state.holeData.distance,
        strokes: state.strokes,
        toPar: relativeToPar
    });
    
    // Set game state to complete
    setGameState(GameState.COMPLETE);
    
    // Set camera to show result
    Camera.setResultMode(state.ball.position, state.holeData.position);
    
    // Determine score name
    let scoreName;
    if (relativeToPar === -3) scoreName = "Albatross";
    else if (relativeToPar === -2) scoreName = "Eagle";
    else if (relativeToPar === -1) scoreName = "Birdie";
    else if (relativeToPar === 0) scoreName = "Par";
    else if (relativeToPar === 1) scoreName = "Bogey";
    else if (relativeToPar === 2) scoreName = "Double Bogey";
    else if (relativeToPar >= 3) scoreName = "Triple+ Bogey";
    
    // Emit hole complete event
    eventBus.emit('holeComplete', {
        scoreName,
        strokes: state.strokes,
        relativeToPar,
        shotInfo: { ...state.shotInfo },
        scoreCard: state.scoreCard,
        fullState: getFullState()
    });
}

/**
 * Prepare for the next shot
 */
function prepareForNextShot() {
    // Reset direction
    state.direction = 0;
    
    // Make direction arrow visible again
    if (state.directionArrow) {
        // Position the arrow at the ball
        state.directionArrow.position.set(state.ball.position.x, 0.3, state.ball.position.z);
        state.directionArrow.visible = true;
    }
    
    // Auto-select appropriate club based on distance
    autoSelectClub();
    
    // Update direction arrow
    updateDirectionArrow();
    
    // Set camera to aiming mode
    Camera.setAimingMode(state.ball.position, calculateAngleToHole());
    
    // Set game state back to aiming
    setGameState(GameState.AIMING);
    
    // Emit shot complete event
    const distanceToHole = Math.sqrt(
        Math.pow(state.ball.position.x - state.holeData.position.x, 2) +
        Math.pow(state.ball.position.z - state.holeData.position.z, 2)
    );
    eventBus.emit('shotComplete', {
        distanceToHole,
        strokes: state.strokes,
        fullState: getFullState()
    });
}

/**
 * Move to the next hole
 * @returns {boolean} True if there are more holes, false if the round is complete
 */
function nextHole() {
    // Check if we've finished all holes
    if (state.currentHole === state.totalHoles) {
        // Round complete
        return false;
    }
    
    // Increment hole number
    state.currentHole++;
    
    // Reset ball position
    if (state.ball) {
        state.ball.position.set(0, 0.2, 0);
        state.ball.rotation.set(0, 0, 0);
    }
    
    // Reset direction arrow
    if (state.directionArrow) {
        state.directionArrow.position.set(0, 0.3, -1.5);
        state.directionArrow.rotation.x = Math.PI / 2;
        state.directionArrow.rotation.z = 0;
        state.directionArrow.visible = true;
    }
    
    // Reset game variables
    state.direction = 0;
    state.power = 0;
    state.accuracy = 0;
    state.shotInfo = { power: 0, accuracy: 0, direction: 0, club: '', controlMode: CONTROL_MODES.CLASSIC };
    state.currentClub = 'driver'; // Default to driver for tee shot
    
    // Set camera to overview mode
    Camera.setOverviewMode();
    
    // Reset game state
    setGameState(GameState.AIMING);
    
    return true;
}

/**
 * Auto-select appropriate club based on distance to hole
 */
function autoSelectClub() {
    // Calculate distance to hole
    const distanceToHole = Math.sqrt(
        Math.pow(state.ball.position.x - state.holeData.position.x, 2) +
        Math.pow(state.ball.position.z - state.holeData.position.z, 2)
    );
    
    // Get recommended club
    state.currentClub = recommendClub(distanceToHole);
}

/**
 * Set the current club
 * @param {string} clubName - Name of the club
 */
function setCurrentClub(clubName) {
    state.currentClub = clubName;
    
    eventBus.emit('clubSelected', { clubName: state.currentClub, fullState: getFullState() });
    
    // Update UI information (this will be handled by event listeners now)
    // updateInfo(); // No longer needed directly here
}

/**
 * Get the current club
 * @returns {string} Current club name
 */
function getCurrentClub() {
    return state.currentClub;
}



/**
 * Get current score card data
 * @returns {Array} Score card data
 */
function getScoreCard() {
    return [...state.scoreCard];
}

/**
 * Reset the entire game
 */
function resetGame() {
    // Reset to first hole
    state.currentHole = 1;
    
    // Clear score card
    state.scoreCard = [];
    
    // Reset ball position
    if (state.ball) {
        state.ball.position.set(0, 0.2, 0);
        state.ball.rotation.set(0, 0, 0);
    }
    
    // Reset direction arrow
    if (state.directionArrow) {
        state.directionArrow.position.set(0, 0.3, -1.5);
        state.directionArrow.rotation.x = Math.PI / 2;
        state.directionArrow.rotation.z = 0;
        state.directionArrow.visible = true;
    }
    
    // Reset game variables
    state.direction = 0;
    state.power = 0;
    state.accuracy = 0;
    state.shotInfo = { power: 0, accuracy: 0, direction: 0, club: '', controlMode: CONTROL_MODES.CLASSIC };
    state.currentClub = 'driver';
    
    // Set camera to overview mode
    Camera.setOverviewMode();
    
    // Reset game state
    setGameState(GameState.AIMING);
}

function takeShotFromIntent(intentData) {
    if (state.gameState !== GameState.AIMING) return false;

    const intent = normalizeShotIntent(intentData);
    if (intent.source !== state.currentControlMode) return false;

    state.strokes++;
    takeShot(normalizeShotIntent({
        ...intent,
        directionOffset: state.direction + intent.directionOffset
    }));
    return true;
}

function setControlMode(controlMode) {
    if (state.gameState !== GameState.AIMING) return false;
    if (!Object.values(CONTROL_MODES).includes(controlMode)) return false;

    state.currentControlMode = controlMode;
    eventBus.emit('controlModeChanged', { controlMode, fullState: getFullState() });
    updateInfo();
    return true;
}

function getControlMode() {
    return state.currentControlMode;
}

function getShotInfo() {
    return { ...state.shotInfo };
}

// Export the module functions
export {
    GameState,
    initGameState,
    setGameState,
    getGameState,
    setHoleData,
    generateWind,
    adjustDirection,
    setDirection,
    startPowerMeter,
    setPower,
    setAccuracy,
    updateBallPhysics,
    nextHole,
    setCurrentClub,
    getCurrentClub,
    // registerCallbacks removed
    getScoreCard,
    resetGame,
    takeShotFromIntent,
    setControlMode,
    getControlMode,
    getShotInfo
};
