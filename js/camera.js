// camera.js - Manages camera positioning and movement

// Camera reference
let camera = null;

const FOLLOW_DISTANCE = 6;
const FOLLOW_HEIGHT = 2;
const FOLLOW_MIN_HEIGHT = 1;
const FOLLOW_SMOOTHING = 0.1;
const FOLLOW_TURN_RATE = 0.08;
const FOLLOW_MIN_MOVE = 0.0001;

// Camera state
let cameraState = {
    mode: 'overview', // 'overview', 'aiming', 'following', 'result'
    target: null,
    holePosition: null,
    transitionSpeed: 0.1,
    distance: 10,
    height: 5,
    heading: { x: 0, z: -1 },
    lastBallPosition: null,
    currentLookAt: { x: 0, y: 0, z: 0 }
};

/**
 * Initialize the camera module
 * @param {Object} cameraRef - Reference to Three.js camera
 */
function initCamera(cameraRef) {
    camera = cameraRef;
    
    // Set initial camera position
    setOverviewMode();
}

/**
 * Set the hole position for the camera to reference
 * @param {Object} position - {x, y, z} position of the hole
 */
function setHolePosition(position) {
    cameraState.holePosition = { ...position };
}

/**
 * Set camera to overview mode (view of the entire hole)
 */
function setOverviewMode() {
    if (!camera) return;
    
    cameraState.mode = 'overview';
    
    // Position camera high above and behind the tee
    camera.position.set(0, 20, 20);
    camera.lookAt(0, 0, -100);
    
    // Update currentLookAt for smooth transitions
    cameraState.currentLookAt = { x: 0, y: 0, z: -100 };
}

/**
 * Set camera to aiming mode (behind the ball looking at direction)
 * @param {Object} ballPosition - {x, y, z} position of the ball
 * @param {number} direction - Direction angle in degrees
 */
function setAimingMode(ballPosition, direction) {
    if (!camera || !ballPosition) return;
    
    cameraState.mode = 'aiming';
    cameraState.target = { ...ballPosition };
    
    // Convert direction to radians
    const dirRadians = direction * (Math.PI / 180);
    
    // Position camera behind the ball based on direction
    const distFromBall = 8; // Keep camera closer to ball for better visibility
    const cameraX = ballPosition.x - Math.sin(dirRadians) * distFromBall;
    const cameraZ = ballPosition.z + Math.cos(dirRadians) * distFromBall;
    
    // Set camera position slightly elevated for better view
    camera.position.set(cameraX, ballPosition.y + 3, cameraZ);
    
    // Look at the ball plus a bit ahead in the shot direction
    const lookAtX = ballPosition.x + Math.sin(dirRadians) * 10;
    const lookAtZ = ballPosition.z - Math.cos(dirRadians) * 10;
    camera.lookAt(lookAtX, ballPosition.y, lookAtZ);
    
    // Update currentLookAt for smooth transitions
    cameraState.currentLookAt = { x: lookAtX, y: ballPosition.y, z: lookAtZ };
}

/**
 * Set camera to a lower putting view that emphasizes the green and cup.
 * @param {Object} ballPosition - {x, y, z} position of the ball
 * @param {number} direction - Direction angle in degrees
 * @param {Object} holePosition - {x, y, z} position of the hole
 */
function setPuttingMode(ballPosition, direction, holePosition) {
    if (!camera || !ballPosition) return;

    cameraState.mode = 'putting';
    cameraState.target = { ...ballPosition };

    const dirRadians = direction * (Math.PI / 180);
    const distFromBall = 5.5;
    const cameraX = ballPosition.x - Math.sin(dirRadians) * distFromBall;
    const cameraZ = ballPosition.z + Math.cos(dirRadians) * distFromBall;

    camera.position.set(cameraX, ballPosition.y + 1.25, cameraZ);

    const lookDistance = holePosition ? Math.min(10, Math.max(4, Math.hypot(
        holePosition.x - ballPosition.x,
        holePosition.z - ballPosition.z
    ))) : 7;
    const lookAtX = ballPosition.x + Math.sin(dirRadians) * lookDistance;
    const lookAtZ = ballPosition.z - Math.cos(dirRadians) * lookDistance;
    camera.lookAt(lookAtX, ballPosition.y + 0.05, lookAtZ);

    cameraState.currentLookAt = { x: lookAtX, y: ballPosition.y + 0.05, z: lookAtZ };
}

function setShotSetupMode(ballPosition, direction, clubName, holePosition) {
    if (clubName === 'putter') {
        setPuttingMode(ballPosition, direction, holePosition);
        return;
    }

    setAimingMode(ballPosition, direction);
}

/**
 * Set camera to follow the ball in flight
 * @param {Object} ballPosition - Current position of the ball
 */
function setFollowMode(ballPosition, direction = 0) {
    if (!camera || !ballPosition) return;

    const dirRadians = direction * (Math.PI / 180);
    cameraState.mode = 'following';
    cameraState.heading = { x: Math.sin(dirRadians), z: -Math.cos(dirRadians) };
    cameraState.lastBallPosition = { x: ballPosition.x, y: ballPosition.y, z: ballPosition.z };

    camera.position.set(
        ballPosition.x - cameraState.heading.x * FOLLOW_DISTANCE,
        Math.max(ballPosition.y + FOLLOW_HEIGHT, FOLLOW_MIN_HEIGHT),
        ballPosition.z - cameraState.heading.z * FOLLOW_DISTANCE
    );
    camera.lookAt(ballPosition.x, ballPosition.y, ballPosition.z);
    cameraState.currentLookAt = { ...ballPosition };
}

/**
 * Set camera to show the result of a shot
 * @param {Object} ballPosition - Final position of the ball
 * @param {Object} holePosition - Position of the hole
 */
function setResultMode(ballPosition, holePosition) {
    if (!camera || !ballPosition) return;
    
    cameraState.mode = 'result';
    
    // Calculate vector from ball to hole
    const toHole = {
        x: holePosition.x - ballPosition.x,
        z: holePosition.z - ballPosition.z
    };
    
    // Normalize this vector
    const distance = Math.sqrt(toHole.x * toHole.x + toHole.z * toHole.z);
    
    // If ball is far from hole, show both
    if (distance > 5) {
        // Calculate a position that shows both ball and hole
        const midPoint = {
            x: (ballPosition.x + holePosition.x) / 2,
            y: Math.max(ballPosition.y, holePosition.y) + 1,
            z: (ballPosition.z + holePosition.z) / 2
        };
        
        // Position camera above and to the side of the midpoint
        camera.position.set(
            midPoint.x + 5,
            midPoint.y + 5,
            midPoint.z + 5
        );
        
        // Look at midpoint
        camera.lookAt(midPoint.x, midPoint.y, midPoint.z);
        
        // Update currentLookAt
        cameraState.currentLookAt = { ...midPoint };
    } else {
        // Ball is close to hole, show close-up of ball and hole
        const normalizedAngle = Math.atan2(toHole.x, toHole.z);
        
        // Position camera at an angle to see both ball and hole
        camera.position.set(
            ballPosition.x + Math.sin(normalizedAngle + Math.PI/4) * 3,
            ballPosition.y + 1.5,
            ballPosition.z + Math.cos(normalizedAngle + Math.PI/4) * 3
        );
        
        // Look at ball
        camera.lookAt(ballPosition.x, ballPosition.y, ballPosition.z);
        
        // Update currentLookAt
        cameraState.currentLookAt = { ...ballPosition };
    }
}

/**
 * Update camera position for the current frame
 * @param {Object} ballPosition - Current position of the ball
 */
function updateCamera(ballPosition) {
    if (!camera) return;
    
    // Handle different camera modes
    switch (cameraState.mode) {
        case 'following': {
            if (!ballPosition) return;

            const last = cameraState.lastBallPosition ?? ballPosition;
            const moveX = ballPosition.x - last.x;
            const moveZ = ballPosition.z - last.z;
            const moved = Math.hypot(moveX, moveZ);
            if (moved > FOLLOW_MIN_MOVE) {
                const blendedX = cameraState.heading.x + (moveX / moved - cameraState.heading.x) * FOLLOW_TURN_RATE;
                const blendedZ = cameraState.heading.z + (moveZ / moved - cameraState.heading.z) * FOLLOW_TURN_RATE;
                const length = Math.hypot(blendedX, blendedZ) || 1;
                cameraState.heading = { x: blendedX / length, z: blendedZ / length };
            }
            cameraState.lastBallPosition = { x: ballPosition.x, y: ballPosition.y, z: ballPosition.z };

            const targetX = ballPosition.x - cameraState.heading.x * FOLLOW_DISTANCE;
            const targetY = Math.max(ballPosition.y + FOLLOW_HEIGHT, FOLLOW_MIN_HEIGHT);
            const targetZ = ballPosition.z - cameraState.heading.z * FOLLOW_DISTANCE;
            camera.position.x += (targetX - camera.position.x) * FOLLOW_SMOOTHING;
            camera.position.y += (targetY - camera.position.y) * FOLLOW_SMOOTHING;
            camera.position.z += (targetZ - camera.position.z) * FOLLOW_SMOOTHING;

            camera.lookAt(ballPosition.x, ballPosition.y, ballPosition.z);
            cameraState.currentLookAt = { ...ballPosition };
            break;
        }
            
        // Add additional camera mode updates if needed
        default:
            // Other modes use fixed positions set when entering the mode
            break;
    }
}

/**
 * Improve visibility of the hole by highlighting the flag
 */
function highlightHole() {
    // This function would apply visual effects to make the hole more visible
    // This might involve adding a marker above the hole or adjusting lighting
    
    // Since this requires modifying the scene, this would typically be
    // implemented through a callback to the main scene manager
    console.log("Hole highlighting - would be implemented through scene manager");
}

/**
 * Get the current camera state
 * @returns {Object} Current camera state
 */
function getCameraState() {
    return { ...cameraState };
}

export {
    initCamera,
    setHolePosition,
    setOverviewMode,
    setAimingMode,
    setPuttingMode,
    setShotSetupMode,
    setFollowMode,
    setResultMode,
    updateCamera,
    highlightHole,
    getCameraState
};
