// camera.js - Manages camera positioning and movement

// Camera reference
let camera = null;

// Camera state
let cameraState = {
    mode: 'overview', // 'overview', 'aiming', 'following', 'result'
    target: null,
    holePosition: null,
    transitionSpeed: 0.1,
    distance: 10,
    height: 5,
    offset: { x: 0, y: 0, z: 0 },
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
 * Set camera to follow the ball in flight
 * @param {Object} ballPosition - Current position of the ball
 */
function setFollowMode(ballPosition) {
    if (!camera || !ballPosition) return;
    
    cameraState.mode = 'following';
    cameraState.target = { ...ballPosition };
    
    // Calculate camera offset from ball - This prevents obstruction from terrain
    const idealOffset = { 
        x: 3,  // Offset to the right
        y: 2,  // Above the ball
        z: 6   // Behind the ball
    };
    
    // Set camera position offset from ball
    camera.position.set(
        ballPosition.x + idealOffset.x,
        ballPosition.y + idealOffset.y,
        ballPosition.z + idealOffset.z
    );
    
    // Look at the ball
    camera.lookAt(ballPosition.x, ballPosition.y, ballPosition.z);
    
    // Update currentLookAt
    cameraState.currentLookAt = { ...ballPosition };
    
    // Save the current offset for smooth transitions
    cameraState.offset = { ...idealOffset };
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
        case 'following':
            if (!ballPosition) return;
            
            // Smoothly follow the ball
            let targetPosition = {
                x: ballPosition.x + cameraState.offset.x,
                y: Math.max(ballPosition.y + cameraState.offset.y, 1), // Keep camera above ground
                z: ballPosition.z + cameraState.offset.z
            };
            
            // Smooth transition to new position
            camera.position.x += (targetPosition.x - camera.position.x) * 0.1;
            camera.position.y += (targetPosition.y - camera.position.y) * 0.1;
            camera.position.z += (targetPosition.z - camera.position.z) * 0.1;
            
            // Look at the ball
            camera.lookAt(ballPosition.x, ballPosition.y, ballPosition.z);
            
            // Update currentLookAt
            cameraState.currentLookAt = { ...ballPosition };
            break;
            
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
    setFollowMode,
    setResultMode,
    updateCamera,
    highlightHole,
    getCameraState
};