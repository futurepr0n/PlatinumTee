// Game state variables
let gameState = 'aiming'; // 'aiming', 'power', 'accuracy', 'in-flight', 'complete'
let direction = 0;
let power = 0;
let accuracy = 0;
let shotInfo = { power: 0, accuracy: 0, direction: 0 };
let currentHole = 1;
let totalHoles = 9;
let strokes = 0;
let scoreCard = [];

// Added this variable to control arrow animation
let isArrowAnimating = false;

// Course settings
let holeDistance = 0; // in yards
let holePar = 0;
let holePosition = { x: 0, z: -20 }; // Default hole position

// Wind settings
let windDirection = 0; // in degrees (0 = North, 90 = East, etc.)
let windSpeed = 0; // in mph

// Distance conversion (1 game unit = 2 yards) - Adjusted for realistic distances
const YARDS_TO_UNITS = 0.5;
const MAX_DRIVE_DISTANCE = 400; // maximum drive distance in yards

// Game objects
let scene, camera, renderer;
let ball, directionArrow, flagpole, flag, hole;
let ballPhysics = null;
let ground, trees = [], bunkers = [];

// Club types and their distances (at 100% power)
const clubTypes = {
    driver: { maxDistance: 400, height: 0.8 },
    wood3: { maxDistance: 300, height: 0.7 },
    hybrid: { maxDistance: 250, height: 0.6 },
    iron5: { maxDistance: 200, height: 0.55 },
    iron7: { maxDistance: 170, height: 0.5 },
    iron9: { maxDistance: 140, height: 0.45 },
    pitchingWedge: { maxDistance: 120, height: 0.4 },
    sandWedge: { maxDistance: 90, height: 0.35 },
    putter: { maxDistance: 20, height: 0.1 }
};

// Current club selection - default to driver
let currentClub = 'driver';

// DOM elements
const container = document.getElementById('container');
const swingBtn = document.getElementById('swing-btn');
const powerBtn = document.getElementById('power-btn');
const accuracyBtn = document.getElementById('accuracy-btn');
const nextHoleBtn = document.getElementById('next-hole-btn');
const powerMeter = document.getElementById('power-meter');
const powerIndicator = document.getElementById('power-indicator');
const accuracyMeter = document.getElementById('accuracy-meter');
const marker = document.getElementById('marker');
const statusEl = document.getElementById('status');
const windInfoEl = document.getElementById('wind-info');
const holeInfoEl = document.getElementById('hole-info');
const resultsEl = document.getElementById('results');
const resultTextEl = document.getElementById('result-text');
const shotInfoEl = document.getElementById('shot-info');
const scoreBodyEl = document.getElementById('score-body');
const totalStrokesEl = document.getElementById('total-strokes');
const totalParEl = document.getElementById('total-par');
const directionIndicator = document.getElementById('direction-indicator');
const targetFlag = document.getElementById('target-flag');
const shotPowerInfo = document.getElementById('shot-power-info');

// Animation references
let animationFrame;
let powerInterval;
let accuracyInterval;

// Initialize the game
function init() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // Sky blue
    
    // Create camera - use a higher angle to see more of the course
    camera = new THREE.PerspectiveCamera(
        60, // Wider field of view
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    // Position camera higher and further back for better view
    camera.position.set(0, 8, 12);
    camera.lookAt(0, 0, -5);
    
    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);
    
    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);
    
    // Create golf ball
    const ballGeometry = new THREE.SphereGeometry(0.2, 32, 32);
    const ballMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
    ball = new THREE.Mesh(ballGeometry, ballMaterial);
    ball.castShadow = true;
    ball.position.set(0, 0.2, 0);
    scene.add(ball);
    
    // Create direction arrow
    const arrowGeometry = new THREE.CylinderGeometry(0.05, 0.15, 3, 8);
    const arrowMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xff0000, 
        transparent: true, 
        opacity: 0.8
    });
    directionArrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
    directionArrow.rotation.x = Math.PI / 2;
    directionArrow.position.set(0, 0.3, -1.5);
    scene.add(directionArrow);
    
    // Create basic course and ground 
    createBasicCourse();
    
    // Generate the first hole
    generateNewHole();
    
    // Start animation loop
    animate();
    
    // Add event listeners
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('keydown', handleKeyDown);
    swingBtn.addEventListener('click', startPowerMeter);
    powerBtn.addEventListener('click', setPower);
    accuracyBtn.addEventListener('click', setAccuracy);
    nextHoleBtn.addEventListener('click', nextHole);
    
    // Club selection with number keys
    window.addEventListener('keydown', handleClubSelection);
    
    // Update info displays
    updateHoleInfo();
    updateWindInfo();
    updateDirectionIndicator();
    updateClubInfo();
}

// Calculate angle from ball to hole
function calculateAngleToHole() {
    // If ball doesn't exist, return 0
    if (!ball) return 0;
    
    // Calculate vector from ball to hole
    const dx = holePosition.x - ball.position.x;
    const dz = holePosition.z - ball.position.z;
    
    // Calculate angle in radians, then convert to degrees
    // atan2 gives angle in the range (-PI, PI)
    // Negative Z is "forward" in Three.js, so we need to adjust our math
    // to make 0 degrees point up/north (negative Z)
    let angle = Math.atan2(dx, -dz) * (180 / Math.PI);
    
    // Return the angle
    return angle;
}

// Handle club selection with number keys
function handleClubSelection(e) {
    if (gameState !== 'aiming') return;
    
    // Number keys 1-9
    if (e.key >= '1' && e.key <= '9') {
        const clubNum = parseInt(e.key);
        
        switch(clubNum) {
            case 1: currentClub = 'driver'; break;
            case 2: currentClub = 'wood3'; break;
            case 3: currentClub = 'hybrid'; break;
            case 4: currentClub = 'iron5'; break;
            case 5: currentClub = 'iron7'; break;
            case 6: currentClub = 'iron9'; break;
            case 7: currentClub = 'pitchingWedge'; break;
            case 8: currentClub = 'sandWedge'; break;
            case 9: currentClub = 'putter'; break;
        }
        
        updateClubInfo();
    }
}

// Update club info display
function updateClubInfo() {
    const club = clubTypes[currentClub];
    const clubName = currentClub.replace(/([A-Z])/g, ' $1')
                           .replace(/^./, function(str) { return str.toUpperCase(); });
    
    // Show club info
    statusEl.textContent = `Club: ${clubName} (${club.maxDistance} yards max) | Direction: ${direction}°`;
    
    // Only show distance to hole if the ball exists
    if (ball) {
        // Show potential distance
        const distanceToHole = Math.sqrt(
            Math.pow(ball.position.x - holePosition.x, 2) +
            Math.pow(ball.position.z - holePosition.z, 2)
        );
        
        const distanceYards = Math.round(distanceToHole / YARDS_TO_UNITS);
        
        if (distanceYards <= club.maxDistance) {
            const powerNeeded = Math.min(1, distanceYards / club.maxDistance);
            shotPowerInfo.textContent = `Recommended Power: ${Math.round(powerNeeded * 100)}% for ${distanceYards} yards`;
            shotPowerInfo.style.display = 'block';
        } else {
            shotPowerInfo.textContent = `Warning: Hole is ${distanceYards} yards away (${club.maxDistance} max)`;
            shotPowerInfo.style.display = 'block';
        }
    } else {
        // If ball doesn't exist yet, just show basic info about the club
        shotPowerInfo.textContent = `Selected: ${clubName} (${club.maxDistance} yards max)`;
        shotPowerInfo.style.display = 'block';
    }
}

// Generate a new hole with random distance
function generateNewHole() {
    // Clear any existing course elements
    clearCourse();
    
    // Generate random par (3, 4, or 5)
    const parOptions = [3, 4, 5];
    holePar = parOptions[Math.floor(Math.random() * parOptions.length)];
    
    // Generate distance based on par
    switch(holePar) {
        case 3:
            holeDistance = Math.floor(Math.random() * (250 - 100) + 100); // 100-250 yards
            break;
        case 4:
            holeDistance = Math.floor(Math.random() * (470 - 250) + 250); // 250-470 yards
            break;
        case 5:
            holeDistance = Math.floor(Math.random() * (650 - 470) + 470); // 470-650 yards
            break;
    }
    
    // Convert yards to game units and set hole position
    const holeDistanceUnits = holeDistance * YARDS_TO_UNITS;
    
    // Add some randomness to hole position (slight left/right variance)
    const xVariance = (Math.random() - 0.5) * 10; // +/- 5 units left/right
    
    // Set hole position
    holePosition = {
        x: xVariance,
        z: -holeDistanceUnits
    };
    
    // Generate random wind
    generateWind();
    
    // Reset strokes for this hole
    strokes = 0;
    
    // Set club based on distance - only if ball exists
    if (ball) {
        autoSelectClub();
    } else {
        // Default to driver for initial shot
        currentClub = 'driver';
    }
    
    // IMPORTANT: Create or update the hole after setting the new position
    createHole();
}

// Auto-select appropriate club based on distance to hole
function autoSelectClub() {
    // Check if ball exists before accessing its position
    if (!ball) {
        // Default to driver for initial shot
        currentClub = 'driver';
        return;
    }
    
    const distanceToHole = Math.sqrt(
        Math.pow(ball.position.x - holePosition.x, 2) +
        Math.pow(ball.position.z - holePosition.z, 2)
    );
    
    const distanceYards = Math.round(distanceToHole / YARDS_TO_UNITS);
    
    // Select club based on distance
    if (distanceYards > 300) currentClub = 'driver';
    else if (distanceYards > 250) currentClub = 'wood3';
    else if (distanceYards > 200) currentClub = 'hybrid';
    else if (distanceYards > 170) currentClub = 'iron5';
    else if (distanceYards > 140) currentClub = 'iron7';
    else if (distanceYards > 120) currentClub = 'iron9';
    else if (distanceYards > 90) currentClub = 'pitchingWedge';
    else if (distanceYards > 20) currentClub = 'sandWedge';
    else currentClub = 'putter';
    
    updateClubInfo();
}

// Generate random wind direction and speed
function generateWind() {
    windDirection = Math.floor(Math.random() * 360);
    windSpeed = Math.floor(Math.random() * 15); // 0-15 mph
}

// Clear existing course elements
function clearCourse() {
    // Remove trees
    trees.forEach(tree => {
        scene.remove(tree.trunk);
        scene.remove(tree.foliage);
    });
    trees = [];
    
    // Remove bunkers
    bunkers.forEach(bunker => {
        scene.remove(bunker);
    });
    bunkers = [];
    
    // Remove hole elements
    if (hole) scene.remove(hole);
    if (flagpole) scene.remove(flagpole);
    if (flag) scene.remove(flag);
}

// Create a new function to set up the basic course without the hole
function createBasicCourse() {
    // Ground/fairway - large green plane
    const groundGeometry = new THREE.PlaneGeometry(200, 1000);
    const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0x4caf50,
        side: THREE.DoubleSide
    });
    ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    
    // Create some hills for visual interest
    createTerrain();
    
    // Add decorative elements
    addDecorativeElements();
}

// Create terrain with subtle hills
function createTerrain() {
    // Add a few subtle hills
    for (let i = 0; i < 5; i++) {
        const hillGeometry = new THREE.SphereGeometry(30, 20, 20, 0, Math.PI * 2, 0, Math.PI / 2);
        const hillMaterial = new THREE.MeshStandardMaterial({
            color: 0x4caf50,
            side: THREE.DoubleSide,
            flatShading: true
        });
        const hill = new THREE.Mesh(hillGeometry, hillMaterial);
        
        // Flatten the hill
        hill.scale.y = 0.2;
        
        // Position randomly
        hill.position.x = (Math.random() - 0.5) * 100;
        hill.position.y = -5;
        hill.position.z = -Math.random() * 300;
        
        scene.add(hill);
    }
}

// Create or update hole and flag position
function createHole() {
    // Create hole
    const holeGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.1, 32);
    const holeMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
    hole = new THREE.Mesh(holeGeometry, holeMaterial);
    hole.position.set(holePosition.x, 0.05, holePosition.z);
    hole.rotation.x = Math.PI / 2;
    scene.add(hole);
    
    // Create a visible green around the hole
    const greenGeometry = new THREE.CircleGeometry(5, 32);
    const greenMaterial = new THREE.MeshStandardMaterial({
        color: 0x2e7d32, // Darker green
        side: THREE.DoubleSide
    });
    const green = new THREE.Mesh(greenGeometry, greenMaterial);
    green.rotation.x = -Math.PI / 2;
    green.position.set(holePosition.x, 0.06, holePosition.z);
    scene.add(green);
    
    // Create flag
    const flagpoleGeometry = new THREE.CylinderGeometry(0.03, 0.03, 3, 8);
    const flagpoleMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
    flagpole = new THREE.Mesh(flagpoleGeometry, flagpoleMaterial);
    flagpole.position.set(holePosition.x, 1.5, holePosition.z);
    scene.add(flagpole);
    
    const flagGeometry = new THREE.PlaneGeometry(1, 0.6);
    const flagMaterial = new THREE.MeshStandardMaterial({
        color: 0xff0000,
        side: THREE.DoubleSide
    });
    flag = new THREE.Mesh(flagGeometry, flagMaterial);
    flag.position.set(holePosition.x + 0.5, 2.5, holePosition.z);
    scene.add(flag);
}

// Add trees and bunkers
function addDecorativeElements() {
    // Trees - randomly placed around the course
    for (let i = 0; i < 30; i++) {
        const xPos = (Math.random() - 0.5) * 100; // -50 to 50
        const zPos = -Math.random() * 400; // 0 to -400
        
        // Only add trees that aren't directly on the fairway
        if (Math.abs(xPos - holePosition.x) > 10 || Math.random() > 0.7) {
            createTree(xPos, zPos);
        }
    }
    
    // Add a few bunkers
    for (let i = 0; i < 8; i++) {
        const xPos = (Math.random() - 0.5) * 60 + holePosition.x; // Position relative to hole
        // Place bunkers more strategically around the hole
        const zPos = -Math.random() * 300;
        
        // More bunkers near the green
        if (Math.random() < 0.5) {
            const distToHole = Math.random() * 10 + 5;
            const angle = Math.random() * Math.PI * 2;
            const bunkerX = holePosition.x + Math.cos(angle) * distToHole;
            const bunkerZ = holePosition.z + Math.sin(angle) * distToHole;
            createBunker(bunkerX, bunkerZ, 3);
        } else {
            createBunker(xPos, zPos, 2 + Math.random() * 3);
        }
    }
}

// Create a tree at the specified position
function createTree(x, z) {
    const trunkGeometry = new THREE.CylinderGeometry(0.2, 0.2, 1, 8);
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.set(x, 0.5, z);
    trunk.castShadow = true;
    scene.add(trunk);
    
    const foliageGeometry = new THREE.ConeGeometry(1, 2, 8);
    const foliageMaterial = new THREE.MeshStandardMaterial({ color: 0x228B22 });
    const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
    foliage.position.set(x, 2, z);
    foliage.castShadow = true;
    scene.add(foliage);
    
    trees.push({ trunk, foliage });
}

// Create a bunker at the specified position
function createBunker(x, z, size) {
    const bunkerGeometry = new THREE.CircleGeometry(size, 32);
    const bunkerMaterial = new THREE.MeshStandardMaterial({ color: 0xf5deb3 });
    const bunker = new THREE.Mesh(bunkerGeometry, bunkerMaterial);
    bunker.rotation.x = -Math.PI / 2;
    bunker.position.set(x, 0.1, z);
    scene.add(bunker);
    
    bunkers.push(bunker);
}

// Update hole information display
function updateHoleInfo() {
    holeInfoEl.textContent = `Hole #${currentHole} - Par ${holePar} - ${holeDistance} yards`;
}

// Update wind information display
function updateWindInfo() {
    const directionNames = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(windDirection / 45) % 8;
    
    // Create a visual indicator for wind direction
    const arrowChar = '⬆';
    const rotation = windDirection;
    
    windInfoEl.innerHTML = `Wind: ${windSpeed} mph ${directionNames[index]} <span class="wind-direction" style="transform: rotate(${rotation}deg)">${arrowChar}</span>`;
}

// Update the direction indicator (line pointing toward hole)
function updateDirectionIndicator() {
    // Only proceed if in aiming state
    if (gameState !== 'aiming') return;
    
    // Show the direction indicator
    directionIndicator.style.display = 'block';
    
    // Calculate angle to hole in degrees
    const angleToHole = calculateAngleToHole();
    
    // Calculate the final direction (angle to hole + player's direction adjustment)
    const finalDirection = angleToHole + direction;
    
    // Set the indicator direction with the absolute angle
    directionIndicator.style.transform = `translateX(-50%) rotate(${finalDirection}deg)`;
    
    // Also update the 3D arrow direction to match
    if (directionArrow) {
        directionArrow.rotation.x = Math.PI / 2; // Keep pointing forward
        directionArrow.rotation.z = finalDirection * (Math.PI / 180);
    }
    
    // Show target flag
    targetFlag.style.display = 'block';
    
    // Calculate distance to hole
    const distance = Math.sqrt(
        Math.pow(ball.position.x - holePosition.x, 2) + 
        Math.pow(ball.position.z - holePosition.z, 2)
    );
    
    // Calculate flag position based on distance and final direction
    const flagDist = Math.min(distance * 0.4, 150); // Scale flag distance, reduced a bit for better visibility
    const flagRad = finalDirection * (Math.PI / 180);
    const flagX = 50 + Math.sin(flagRad) * flagDist;
    const flagY = 50 - Math.cos(flagRad) * flagDist/4; // Shorter vertical scale
    
    targetFlag.style.left = `${flagX}%`;
    targetFlag.style.bottom = `${flagY}%`;
    
    // Update status text to show the angle to hole and final direction
    const club = clubTypes[currentClub];
    const clubName = currentClub.replace(/([A-Z])/g, ' $1')
                            .replace(/^./, function(str) { return str.toUpperCase(); });
    
    statusEl.textContent = `Club: ${clubName} | Angle to hole: ${Math.round(angleToHole)}° | Aim adjustment: ${direction}°`;
}

// Animation loop
function animate() {
    animationFrame = requestAnimationFrame(animate);
    
    if (gameState === 'in-flight' && ballPhysics && ballPhysics.isInFlight) {
        updateBallPhysics();
    }
    
    if (gameState === 'aiming') {
        // Slowly rotate the direction arrow for visual effect when not actively aiming
        if (!isArrowAnimating) {
            const time = Date.now() * 0.001;
            const angle = Math.sin(time * 0.5) * 0.1; // Reduced rotation amount
            
            // Calculate the absolute angle (angle to hole + player adjustments)
            const angleToHole = calculateAngleToHole();
            const finalDirection = (angleToHole + direction) * (Math.PI / 180);
            
            // Apply gentle wobble to the final direction
            directionArrow.rotation.z = finalDirection + angle;
        }
        
        // Update direction indicator
        updateDirectionIndicator();
    }
    
    renderer.render(scene, camera);
}

// Handle window resize
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Handle keyboard input for direction
function handleKeyDown(e) {
    if (gameState !== 'aiming') return;
    
    let directionChanged = false;
    
    if (e.key === 'ArrowLeft') {
        direction = Math.max(direction - 5, -45);
        directionChanged = true;
    } else if (e.key === 'ArrowRight') {
        direction = Math.min(direction + 5, 45);
        directionChanged = true;
    }
    
    if (directionChanged) {
        // Clear any automatic animation
        isArrowAnimating = true;
        
        // Calculate absolute angle to hole
        const angleToHole = calculateAngleToHole();
        
        // Calculate the final direction (angle to hole + player's direction adjustment)
        const finalDirection = angleToHole + direction;
        
        // Update arrow rotation with the final direction
        directionArrow.rotation.x = Math.PI / 2; // Keep pointing forward
        directionArrow.rotation.z = finalDirection * (Math.PI / 180);
        
        // Update direction indicator
        updateDirectionIndicator();
        
        // Update club info - now also shows the updated direction
        updateClubInfo();
    }
}

// Update direction arrow
function updateDirection() {
    // Clear any automatic animation
    isArrowAnimating = true;
    
    // Calculate angle to hole
    const angleToHole = calculateAngleToHole();
    
    // Calculate final direction
    const finalDirection = angleToHole + direction;
    
    // Update arrow rotation
    directionArrow.rotation.x = Math.PI / 2; // Keep pointing forward
    directionArrow.rotation.z = finalDirection * (Math.PI / 180);
    
    // Update club info
    updateClubInfo();
    
    // Update direction indicator
    updateDirectionIndicator();
}

// Start power meter
function startPowerMeter() {
    if (gameState !== 'aiming') return;
    
    // Change buttons
    swingBtn.style.display = 'none';
    powerBtn.style.display = 'inline-block';
    powerMeter.style.display = 'block';
    
    // Hide direction indicator and target flag
    directionIndicator.style.display = 'none';
    targetFlag.style.display = 'none';
    shotPowerInfo.style.display = 'none';
    
    // Update game state
    gameState = 'power';
    
    // Start power meter animation
    let powerVal = 0;
    let increasing = true;
    
    powerInterval = setInterval(() => {
        if (increasing) {
            powerVal += 0.01; // Slower movement for power
            if (powerVal >= 1) {
                increasing = false;
            }
        } else {
            powerVal -= 0.01; // Slower movement for power
            if (powerVal <= 0) {
                increasing = true;
            }
        }
        
        power = powerVal;
        powerIndicator.style.width = `${power * 100}%`;
    }, 20);
}

// Set power and start accuracy meter
function setPower() {
    if (gameState !== 'power') return;
    
    // Stop power meter animation
    clearInterval(powerInterval);
    
    // Change buttons and meters
    powerBtn.style.display = 'none';
    accuracyBtn.style.display = 'inline-block';
    powerMeter.style.display = 'none';
    accuracyMeter.style.display = 'block';
    
    // Update game state
    gameState = 'accuracy';
    
    // Start accuracy meter animation - slower than before
    let accuracyVal = 0;
    let increasing = true;
    
    accuracyInterval = setInterval(() => {
        if (increasing) {
            accuracyVal += 0.02; // Slower movement for accuracy
            if (accuracyVal >= 1) {
                increasing = false;
            }
        } else {
            accuracyVal -= 0.02; // Slower movement for accuracy
            if (accuracyVal <= 0) {
                increasing = true;
            }
        }
        
        accuracy = accuracyVal;
        marker.style.left = `${accuracy * 300}px`;
    }, 25); // Even slower interval
}

// Set accuracy and take shot
function setAccuracy() {
    if (gameState !== 'accuracy') return;
    
    // Stop accuracy meter animation
    clearInterval(accuracyInterval);
    
    // Change UI
    accuracyBtn.style.display = 'none';
    accuracyMeter.style.display = 'none';
    
    // Increment stroke count
    strokes++;
    
    // Take the shot
    takeShot();
}

// Take the shot
function takeShot() {
    // Accuracy now directly controls the deviation from the intended direction
    // 0.5 = perfect accuracy (center of meter)
    // 0 or 1 = max deviation (±45 degrees)
    const accuracyEffect = (accuracy - 0.5) * 2; // -1 to 1
    
    // Calculate angle to hole first
    const angleToHole = calculateAngleToHole();
    
    // Calculate final direction - adding deviation to the intended direction
    // The closer to 0.5 on the accuracy meter, the closer to the intended direction
    const finalDirection = angleToHole + direction + (accuracyEffect * 45);
    
    // Store shot info
// Store shot info
shotInfo = {
    power: power.toFixed(2),
    accuracy: accuracy.toFixed(2),
    direction: finalDirection.toFixed(2),
    club: currentClub
};

// Update status
statusEl.textContent = `Shot in progress... Power: ${shotInfo.power}, Accuracy: ${shotInfo.accuracy}, Direction: ${shotInfo.direction}°`;

// Update game state
gameState = 'in-flight';

// Hide direction arrow during flight
directionArrow.visible = false;

// Convert direction from degrees to radians
const dirRadians = finalDirection * (Math.PI / 180);

// Get club properties
const club = clubTypes[currentClub];

// Calculate distance based on power and selected club
// Adjusted for more realistic distances
const maxShotDistance = club.maxDistance * power;

// Scale velocity based on club and power
// Using a more conservative scaling factor
const shotPower = 0.2 + (power * 1.0); // Reduced from 2.2 to 1.0

// Set up ball physics
ballPhysics = {
    velocity: new THREE.Vector3(
        Math.sin(dirRadians) * shotPower, // X velocity (left/right)
        0.1 + (power * club.height), // Y velocity (height) based on club
        -Math.cos(dirRadians) * shotPower // Z velocity (forward)
    ),
    initialPower: power,
    isInFlight: true,
    club: currentClub,
    targetDistance: maxShotDistance
};

// Adjust camera to follow the ball
followBall();
}

// Make camera follow the ball in flight
function followBall() {
// Transition camera to follow the ball
camera.position.set(ball.position.x + 2, 4, ball.position.z + 6);
camera.lookAt(ball.position);
}

// Update ball physics during flight
function updateBallPhysics() {
// Apply gravity
ballPhysics.velocity.y -= 0.015;

// Apply wind effect
const windRadians = windDirection * (Math.PI / 180);
const windEffect = windSpeed * 0.0003; // Scale wind effect

ballPhysics.velocity.x += Math.sin(windRadians) * windEffect;
ballPhysics.velocity.z += -Math.cos(windRadians) * windEffect;

// Update position
ball.position.x += ballPhysics.velocity.x;
ball.position.y += ballPhysics.velocity.y;
ball.position.z += ballPhysics.velocity.z;

// Ball rotation effect
ball.rotation.x -= ballPhysics.velocity.z * 0.5;
ball.rotation.z -= ballPhysics.velocity.x * 0.5;

// Update camera to follow ball
camera.position.set(ball.position.x + 2, ball.position.y + 3, ball.position.z + 6);
camera.lookAt(ball.position);

// Calculate distance from tee
const distanceFromTee = Math.sqrt(
    Math.pow(ball.position.x, 2) +
    Math.pow(ball.position.z, 2)
);

// Convert to yards for display
const distanceYards = Math.abs(Math.round(distanceFromTee / YARDS_TO_UNITS));

// Calculate distance to hole
const distanceToHole = Math.sqrt(
    Math.pow(ball.position.x - holePosition.x, 2) +
    Math.pow(ball.position.z - holePosition.z, 2)
);

const distanceToHoleYards = Math.round(distanceToHole / YARDS_TO_UNITS);

// Update status with distance
statusEl.textContent = `Distance: ${distanceYards} yards | To hole: ${distanceToHoleYards} yards`;

// Ground collision
if (ball.position.y < 0.2) {
    ball.position.y = 0.2;
    
    // Bounce with friction
    ballPhysics.velocity.y = -ballPhysics.velocity.y * (0.3 + ballPhysics.initialPower * 0.1);
    ballPhysics.velocity.x *= 0.75;
    ballPhysics.velocity.z *= 0.75;
    
    // Stop if moving too slow
    if (Math.abs(ballPhysics.velocity.y) < 0.03) {
        ballPhysics.velocity.y = 0;
    }
    
    const speed = Math.sqrt(
        ballPhysics.velocity.x * ballPhysics.velocity.x +
        ballPhysics.velocity.z * ballPhysics.velocity.z
    );
    
    if (speed < 0.03) {
        ballPhysics.isInFlight = false;
        evaluateShot();
    }
}

// Check if ball fell in hole
if (distanceToHole < 0.3 && Math.abs(ballPhysics.velocity.x) < 0.1 &&
    Math.abs(ballPhysics.velocity.z) < 0.1 && ball.position.y <= 0.3) {
    // Ball in hole!
    ballPhysics.isInFlight = false;
    ball.position.y -= 0.05;
    showResultsWithScore('HOLE IN ONE! 🎉');
}
}

// Evaluate the shot
function evaluateShot() {
// Calculate distance to hole
const distanceToHole = Math.sqrt(
    Math.pow(ball.position.x - holePosition.x, 2) +
    Math.pow(ball.position.z - holePosition.z, 2)
);

// Convert to yards
const distanceYards = Math.round(distanceToHole / YARDS_TO_UNITS);

let result;

if (distanceToHole < 0.3) {
    // Ball in hole
    let strokeName;
    const relativeToPar = strokes - holePar;
    
    if (relativeToPar === -3) strokeName = "Albatross";
    else if (relativeToPar === -2) strokeName = "Eagle";
    else if (relativeToPar === -1) strokeName = "Birdie";
    else if (relativeToPar === 0) strokeName = "Par";
    else if (relativeToPar === 1) strokeName = "Bogey";
    else if (relativeToPar === 2) strokeName = "Double Bogey";
    else if (relativeToPar >= 3) strokeName = "Triple+ Bogey";
    
    result = `${strokeName}! (${strokes} strokes)`;
} else if (distanceToHole < 1) {
    if (strokes === 1) {
        result = `Great shot! ${distanceYards} yards from the hole.`;
    } else {
        result = `So close! Tap in for ${strokes + 1}.`;
    }
} else if (distanceToHole < 3) {
    result = `Nice approach! ${distanceYards} yards from the hole.`;
} else if (distanceToHole < 20) {
    result = `On the green! ${distanceYards} yards from the hole.`;
} else {
    result = `On the fairway! ${distanceYards} yards from the hole.`;
}

// Check if we need another shot or end the hole
if (distanceToHole < 0.3) {
    showResultsWithScore(result);
} else {
    // Set up for next shot
    gameState = 'aiming';
    directionArrow.visible = true;
    
    // Position the arrow at the ball
    directionArrow.position.set(ball.position.x, 0.3, ball.position.z);
    
    // IMPORTANT: Reset direction adjustment to 0 for next shot
    direction = 0;
    
    // Calculate angle to hole
    const angleToHole = calculateAngleToHole();
    
    // Apply the rotation to the arrow - setting initial aim directly at hole
    directionArrow.rotation.x = Math.PI / 2; // Ensure arrow points forward
    directionArrow.rotation.z = angleToHole * (Math.PI / 180);
    
    isArrowAnimating = false; // Allow animation to resume
    
    // Select appropriate club for the remaining distance
    autoSelectClub();
    
    // Update direction indicator and other UI
    updateDirectionIndicator();
    
    // Update camera position to focus on the ball from behind
    const cameraAngle = angleToHole * (Math.PI / 180);
    const distFromBall = 10;
    const cameraX = ball.position.x - Math.sin(cameraAngle) * distFromBall;
    const cameraZ = ball.position.z + Math.cos(cameraAngle) * distFromBall;
    camera.position.set(cameraX, 5, cameraZ);
    camera.lookAt(ball.position.x, 0, ball.position.z);
    
    // Reset buttons
    swingBtn.style.display = 'inline-block';
    
    // Show a temporary message
    const tempMessage = document.createElement('div');
    tempMessage.style.position = 'absolute';
    tempMessage.style.top = '50%';
    tempMessage.style.left = '50%';
    tempMessage.style.transform = 'translate(-50%, -50%)';
    tempMessage.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    tempMessage.style.color = 'white';
    tempMessage.style.padding = '15px';
    tempMessage.style.borderRadius = '5px';
    tempMessage.style.fontSize = '18px';
    tempMessage.style.zIndex = '200';
    tempMessage.textContent = result;
    document.body.appendChild(tempMessage);
    
    setTimeout(() => {
        document.body.removeChild(tempMessage);
    }, 2000);
}
}

// Show results screen with score
function showResultsWithScore(resultText) {
    gameState = 'complete';
    
    // Calculate distance from tee
    const distanceFromTee = Math.sqrt(
        Math.pow(ball.position.x, 2) +
        Math.pow(ball.position.z, 2)
    );
    
    // Convert to yards
    const distanceYards = Math.abs(Math.round(distanceFromTee / YARDS_TO_UNITS));
    
    resultTextEl.textContent = resultText;
    shotInfoEl.innerHTML = `
        <p>Club: ${shotInfo.club}</p>
        <p>Power: ${shotInfo.power}</p>
        <p>Accuracy: ${shotInfo.accuracy}</p>
        <p>Direction: ${shotInfo.direction}°</p>
        <p>Distance: ${distanceYards} yards</p>
        <p>Strokes: ${strokes}</p>
        <p>To Par: ${strokes - holePar > 0 ? "+" : ""}${strokes - holePar}</p>
    `;
    
    // Update score card
    updateScoreCard();
    
    resultsEl.style.display = 'block';
}

// Update the score card
function updateScoreCard() {
    // Add hole to score card
    scoreCard.push({
        hole: currentHole,
        par: holePar,
        distance: holeDistance,
        strokes: strokes,
        toPar: strokes - holePar
    });
    
    // Clear existing rows
    scoreBodyEl.innerHTML = '';
    
    // Add rows for each hole
    let totalStrokes = 0;
    let totalToPar = 0;
    
    scoreCard.forEach(score => {
        const row = document.createElement('tr');
        
        const holeCell = document.createElement('td');
        holeCell.textContent = score.hole;
        row.appendChild(holeCell);
        
        const parCell = document.createElement('td');
        parCell.textContent = score.par;
        row.appendChild(parCell);
        
        const distanceCell = document.createElement('td');
        distanceCell.textContent = score.distance;
        row.appendChild(distanceCell);
        
        const strokesCell = document.createElement('td');
        strokesCell.textContent = score.strokes;
        row.appendChild(strokesCell);
        
        const toParCell = document.createElement('td');
        toParCell.textContent = score.toPar > 0 ? "+" + score.toPar : score.toPar;
        row.appendChild(toParCell);
        
        scoreBodyEl.appendChild(row);
        
        totalStrokes += score.strokes;
        totalToPar += score.toPar;
    });
    
    // Update totals
    totalStrokesEl.textContent = totalStrokes;
    totalParEl.textContent = totalToPar > 0 ? "+" + totalToPar : totalToPar;
    
    // Update next hole button text for last hole
    if (currentHole === totalHoles) {
        nextHoleBtn.textContent = 'FINISH ROUND';
    }
}

// Move to the next hole
function nextHole() {
    // Check if we've finished all holes
    if (currentHole === totalHoles) {
        // Show final score and reset game
        alert(`Round complete! Final score: ${totalParEl.textContent}`);
        resetGame();
        return;
    }
    
    // Increment hole number
    currentHole++;
    
    // Generate new hole
    generateNewHole();
    
    // Reset ball position
    ball.position.set(0, 0.2, 0);
    ball.rotation.set(0, 0, 0);
    
    // Reset direction arrow
    directionArrow.position.set(0, 0.3, -1.5);
    directionArrow.rotation.x = Math.PI / 2;
    directionArrow.rotation.z = 0;
    directionArrow.visible = true;
    
    // Reset camera
    camera.position.set(0, 8, 12);
    camera.lookAt(0, 0, -5);
    
    // Reset variables
    direction = 0;
    power = 0;
    accuracy = 0;
    shotInfo = { power: 0, accuracy: 0, direction: 0 };
    ballPhysics = null;
    isArrowAnimating = false;
    
    // Reset UI
    resultsEl.style.display = 'none';
    swingBtn.style.display = 'inline-block';
    
    // Update hole info
    updateHoleInfo();
    updateWindInfo();
    updateDirectionIndicator();
    updateClubInfo();
    
    // Reset game state
    gameState = 'aiming';
}

// Reset the entire game
function resetGame() {
    // Reset to first hole
    currentHole = 1;
    
    // Clear score card
    scoreCard = [];
    
    // Generate new first hole
    generateNewHole();
    
    // Reset ball position
    ball.position.set(0, 0.2, 0);
    ball.rotation.set(0, 0, 0);
    
    // Reset direction arrow
    directionArrow.position.set(0, 0.3, -1.5);
    directionArrow.rotation.x = Math.PI / 2;
    directionArrow.rotation.z = 0;
    directionArrow.visible = true;
    
    // Reset camera
    camera.position.set(0, 8, 12);
    camera.lookAt(0, 0, -5);
    
    // Reset variables
    direction = 0;
    power = 0;
    accuracy = 0;
    shotInfo = { power: 0, accuracy: 0, direction: 0 };
    ballPhysics = null;
    isArrowAnimating = false;
    currentClub = 'driver';
    
    // Reset UI
    resultsEl.style.display = 'none';
    swingBtn.style.display = 'inline-block';
    nextHoleBtn.textContent = 'NEXT HOLE';
    
    // Update hole info
    updateHoleInfo();
    updateWindInfo();
    updateDirectionIndicator();
    updateClubInfo();
    
    // Reset game state
    gameState = 'aiming';
}

// Start the game
init();