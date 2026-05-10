// course.js - Handles course generation, terrain, and obstacles

import * as THREE from 'three';
// Conversion constants (from physics.js)
import { YARDS_TO_UNITS } from './physics.js';
import logger from './utils/logger.js'; // Import logger

// Course elements collections
let ground = null;
let hills = [];
let trees = [];
let bunkers = [];
let water = [];

// Hole elements
let hole = null;
let flagpole = null;
let flag = null;
let green = null;

// Reference to Three.js scene
let scene = null;

// Course Constants
// Ground
const GROUND_WIDTH = 200;
const GROUND_LENGTH = 1000;
const GROUND_COLOR = 0x4caf50;

// Hills
const NUMBER_OF_HILLS = 8;
const HILL_RADIUS = 30;
const HILL_SEGMENTS_WIDTH = 20;
const HILL_SEGMENTS_HEIGHT = 20;
const HILL_FLATTEN_FACTOR = 0.2;
const HILL_X_SPREAD = 100;
const HILL_Y_POSITION = -5;
const HILL_Z_SPREAD = 500;
const HILL_Z_OFFSET = 50;
const HILL_INITIAL_HEIGHT_MULTIPLIER = 6; // Implicit factor for hill height before scale.y

// Hole
const HOLE_RADIUS_VISUAL = 0.15; // Visual radius of the hole cylinder
const HOLE_HEIGHT_VISUAL = 0.1;
const HOLE_COLOR = 0x000000;
const HOLE_VERTICAL_OFFSET = 0.05; // Position above terrain height

// Green
const GREEN_RADIUS = 5;
const GREEN_COLOR = 0x2e7d32;
const GREEN_VERTICAL_OFFSET = 0.06; // Position above terrain height

// Flagpole
const FLAGPOLE_RADIUS = 0.03;
const FLAGPOLE_HEIGHT = 3;
const FLAGPOLE_COLOR = 0xffffff;
const FLAGPOLE_VERTICAL_OFFSET = 1.5; // Position above terrain height

// Flag
const FLAG_WIDTH = 1;
const FLAG_HEIGHT = 0.6;
const FLAG_COLOR = 0xff0000;
const FLAG_HORIZONTAL_OFFSET = 0.5; // Position relative to flagpole

// Trees
const NUMBER_OF_TREES = 30;
const TREE_X_SPREAD = 100;
const TREE_Z_SPREAD = 500;
const TREE_PATH_TOLERANCE = 15; // Distance from direct path to hole to avoid placing trees
const RANDOM_TREE_CHANCE = 0.7; // Chance to place a tree even if near path

const TRUNK_RADIUS = 0.2;
const TRUNK_HEIGHT = 1.5;
const TRUNK_SEGMENTS = 8;
const TRUNK_COLOR = 0x8B4513;
const TRUNK_VERTICAL_OFFSET = 0.75; // Position above terrain height

const FOLIAGE_RADIUS = 1;
const FOLIAGE_HEIGHT = 2.5;
const FOLIAGE_SEGMENTS = 8;
const FOLIAGE_COLOR = 0x228B22;
const FOLIAGE_VERTICAL_OFFSET = 2.5; // Position above terrain height

// Bunkers
const NUMBER_OF_BUNKERS = 8;
const BUNKER_NEAR_GREEN_CHANCE = 0.6;
const BUNKER_DIST_FROM_HOLE_RANGE = 10;
const BUNKER_DIST_FROM_HOLE_OFFSET = 5;
const BUNKER_FAIRWAY_X_SPREAD = 60;
const BUNKER_FAIRWAY_Z_OFFSET = 50; // Offset from tee for fairway bunkers
const BUNKER_MIN_SIZE = 2;
const BUNKER_SIZE_RANGE = 3;
const BUNKER_VERTICAL_OFFSET = 0.1; // Position above terrain height
const BUNKER_COLOR = 0xf5deb3;

// Hole Generation
const PAR_OPTIONS = [3, 4, 5];
const PAR3_MIN_DISTANCE = 100;
const PAR3_MAX_DISTANCE = 250;
const PAR4_MIN_DISTANCE = 250;
const PAR4_MAX_DISTANCE = 470;
const PAR5_MIN_DISTANCE = 470;
const PAR5_MAX_DISTANCE = 650;
const HOLE_X_VARIANCE_SPREAD = 10; // +/- 5 units left/right




/**
 * Initialize the course module with a scene reference
 * @param {Object} sceneRef - Reference to Three.js scene
 */
function initCourse(sceneRef) {
    scene = sceneRef;
}

/**
 * Creates the basic course elements (ground, hills)
 */
function createBasicCourse() {
    if (!scene) {
        logger.error("Course module not initialized with scene");
        return;
    }
    
    // Create ground/fairway - large green plane
    const groundGeometry = new THREE.PlaneGeometry(GROUND_WIDTH, GROUND_LENGTH);
    const groundMaterial = new THREE.MeshStandardMaterial({
        color: GROUND_COLOR,
        side: THREE.DoubleSide
    });
    ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    
    // Create terrain with hills
    createTerrain();
}

/**
 * Creates hills and terrain features
 */
function createTerrain() {
    hills = [];
    
    // Add more hills for visual interest and gameplay
    for (let i = 0; i < NUMBER_OF_HILLS; i++) {
        // Create hill with more complex geometry for better collision
        const hillGeometry = new THREE.SphereGeometry(HILL_RADIUS, HILL_SEGMENTS_WIDTH, HILL_SEGMENTS_HEIGHT, 0, Math.PI * 2, 0, Math.PI / 2);
        const hillMaterial = new THREE.MeshStandardMaterial({
            color: GROUND_COLOR, // Use ground color for hills
            side: THREE.DoubleSide,
            flatShading: true
        });
        const hill = new THREE.Mesh(hillGeometry, hillMaterial);
        
        // Flatten the hill
        hill.scale.y = HILL_FLATTEN_FACTOR;
        
        // Position randomly, avoiding the tee area
        hill.position.x = (Math.random() - 0.5) * HILL_X_SPREAD;
        hill.position.y = HILL_Y_POSITION; // Partially buried in the ground
        hill.position.z = -Math.random() * HILL_Z_SPREAD - HILL_Z_OFFSET; // Start at least 50 units away from tee
        
        // Store hill data for collision detection
        const hillData = {
            position: { 
                x: hill.position.x, 
                y: hill.position.y, 
                z: hill.position.z 
            },
            radius: HILL_RADIUS,
            height: HILL_INITIAL_HEIGHT_MULTIPLIER * hill.scale.y // max height of the hill
        };
        
        hills.push(hillData);
        scene.add(hill);
    }
}

/**
 * Creates a new hole with specified parameters
 * @param {Object} holePosition - {x, z} position for the hole
 * @param {number} holePar - Par value for the hole
 * @param {number} holeDistance - Distance in yards
 */
function createHole(holePosition, holePar, holeDistance) {
    if (!scene) {
        logger.error("Course module not initialized with scene");
        return;
    }
    
    // Clear any existing hole elements
    if (hole) scene.remove(hole);
    if (flagpole) scene.remove(flagpole);
    if (flag) scene.remove(flag);
    if (green) scene.remove(green);
    
    // Create the actual hole (black cylinder)
    const holeGeometry = new THREE.CylinderGeometry(HOLE_RADIUS_VISUAL, HOLE_RADIUS_VISUAL, HOLE_HEIGHT_VISUAL, 32); // Smaller hole for smaller ball
    const holeMaterial = new THREE.MeshStandardMaterial({ color: HOLE_COLOR });
    hole = new THREE.Mesh(holeGeometry, holeMaterial);
    
    // Get terrain height at hole position
    const holeTerrainHeight = getTerrainHeightAt(holePosition.x, holePosition.z);
    
    // Position hole at terrain height
    hole.position.set(holePosition.x, holeTerrainHeight + HOLE_VERTICAL_OFFSET, holePosition.z);
    hole.rotation.x = Math.PI / 2;
    scene.add(hole);
    
    // Create a visible green around the hole
    const greenGeometry = new THREE.CircleGeometry(GREEN_RADIUS, 32);
    const greenMaterial = new THREE.MeshStandardMaterial({
        color: GREEN_COLOR, // Darker green
        side: THREE.DoubleSide
    });
    green = new THREE.Mesh(greenGeometry, greenMaterial);
    green.rotation.x = -Math.PI / 2;
    green.position.set(holePosition.x, holeTerrainHeight + GREEN_VERTICAL_OFFSET, holePosition.z);
    scene.add(green);
    
    // Create flagpole
    const flagpoleGeometry = new THREE.CylinderGeometry(FLAGPOLE_RADIUS, FLAGPOLE_RADIUS, FLAGPOLE_HEIGHT, 8);
    const flagpoleMaterial = new THREE.MeshStandardMaterial({ color: FLAGPOLE_COLOR });
    flagpole = new THREE.Mesh(flagpoleGeometry, flagpoleMaterial);
    
    // Position flagpole at hole with terrain height
    flagpole.position.set(holePosition.x, holeTerrainHeight + FLAGPOLE_VERTICAL_OFFSET, holePosition.z);
    scene.add(flagpole);
    
    // Create flag
    const flagGeometry = new THREE.PlaneGeometry(FLAG_WIDTH, FLAG_HEIGHT);
    const flagMaterial = new THREE.MeshStandardMaterial({
        color: FLAG_COLOR,
        side: THREE.DoubleSide
    });
    flag = new THREE.Mesh(flagGeometry, flagMaterial);
    flag.position.set(holePosition.x + FLAG_HORIZONTAL_OFFSET, holeTerrainHeight + FLAGPOLE_VERTICAL_OFFSET + FLAG_HEIGHT / 2, holePosition.z); // Adjust flag Y position to be halfway up flagpole
    scene.add(flag);
    
    // Add decorative elements around the course
    addDecorativeElements(holePosition);
    
    // DEBUG: Log hole creation
    logger.info(`Hole created at (${holePosition.x.toFixed(2)}, ${holePosition.z.toFixed(2)}) with terrain height ${holeTerrainHeight.toFixed(2)}`);
    
    return {
        position: { x: holePosition.x, y: holeTerrainHeight, z: holePosition.z },
        par: holePar,
        distance: holeDistance
    };
}

/**
 * Adds trees, bunkers and other decorative elements to the course
 * @param {Object} holePosition - Position of the hole
 */
function addDecorativeElements(holePosition) {
    // Clear existing elements
    clearDecorativeElements();
    
    // Place trees around the course, but not on the direct line to the hole
    for (let i = 0; i < NUMBER_OF_TREES; i++) {
        const xPos = (Math.random() - 0.5) * TREE_X_SPREAD;
        const zPos = -Math.random() * TREE_Z_SPREAD;
        
        // Avoid placing trees directly in the path to the hole
        const distanceToHolePath = distancePointToLine(
            { x: xPos, z: zPos },
            { x: 0, z: 0 },
            { x: holePosition.x, z: holePosition.z }
        );
        
        // Only add trees that aren't directly on the fairway
        if (distanceToHolePath > TREE_PATH_TOLERANCE || Math.random() > RANDOM_TREE_CHANCE) {
            createTree(xPos, zPos);
        }
    }
    
    // Add bunkers, more strategically placed around the hole
    for (let i = 0; i < NUMBER_OF_BUNKERS; i++) {
        if (Math.random() < BUNKER_NEAR_GREEN_CHANCE) {
            // Place bunkers near the green
            const distToHole = Math.random() * BUNKER_DIST_FROM_HOLE_RANGE + BUNKER_DIST_FROM_HOLE_OFFSET;
            const angle = Math.random() * Math.PI * 2;
            const bunkerX = holePosition.x + Math.cos(angle) * distToHole;
            const bunkerZ = holePosition.z + Math.sin(angle) * distToHole;
            createBunker(bunkerX, bunkerZ, BUNKER_MIN_SIZE + (Math.random() * BUNKER_SIZE_RANGE));
        } else {
            // Place bunkers along the fairway
            const xPos = (Math.random() - 0.5) * BUNKER_FAIRWAY_X_SPREAD;
            const zPos = -BUNKER_FAIRWAY_Z_OFFSET - Math.random() * (holePosition.z + BUNKER_FAIRWAY_Z_OFFSET); // Between tee and hole
            createBunker(xPos, zPos, BUNKER_MIN_SIZE + (Math.random() * BUNKER_SIZE_RANGE));
        }
    }
}

/**
 * Creates a tree at the specified position
 * @param {number} x - X position
 * @param {number} z - Z position
 */
function createTree(x, z) {
    // Get terrain height at tree position
    const terrainHeight = getTerrainHeightAt(x, z);
    
    // Create trunk
    const trunkGeometry = new THREE.CylinderGeometry(TRUNK_RADIUS, TRUNK_RADIUS, TRUNK_HEIGHT, TRUNK_SEGMENTS);
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: TRUNK_COLOR });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.set(x, terrainHeight + TRUNK_VERTICAL_OFFSET, z);
    trunk.castShadow = true;
    scene.add(trunk);
    
    // Create foliage
    const foliageGeometry = new THREE.ConeGeometry(FOLIAGE_RADIUS, FOLIAGE_HEIGHT, FOLIAGE_SEGMENTS);
    const foliageMaterial = new THREE.MeshStandardMaterial({ color: FOLIAGE_COLOR });
    const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
    foliage.position.set(x, terrainHeight + FOLIAGE_VERTICAL_OFFSET, z);
    foliage.castShadow = true;
    scene.add(foliage);
    
    trees.push({ trunk, foliage });
}

/**
 * Creates a bunker at the specified position
 * @param {number} x - X position
 * @param {number} z - Z position
 * @param {number} size - Size of the bunker
 */
function createBunker(x, z, size) {
    // Get terrain height at bunker position
    const terrainHeight = getTerrainHeightAt(x, z);
    
    const bunkerGeometry = new THREE.CircleGeometry(size, 32);
    const bunkerMaterial = new THREE.MeshStandardMaterial({ color: BUNKER_COLOR });
    const bunker = new THREE.Mesh(bunkerGeometry, bunkerMaterial);
    bunker.rotation.x = -Math.PI / 2;
    bunker.position.set(x, terrainHeight + BUNKER_VERTICAL_OFFSET, z);
    scene.add(bunker);
    
    bunkers.push(bunker);
}

/**
 * Clear all decorative elements from the scene
 */
function clearDecorativeElements() {
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
}

/**
 * Clear entire course from the scene
 */
function clearCourse() {
    // Clear decorative elements
    clearDecorativeElements();
    
    // Clear hole elements
    if (hole) scene.remove(hole);
    if (flagpole) scene.remove(flagpole);
    if (flag) scene.remove(flag);
    if (green) scene.remove(green);
    
    // Clear ground
    if (ground) scene.remove(ground);
    
    hole = null;
    flagpole = null;
    flag = null;
    green = null;
    ground = null;
}

/**
 * Generate a new hole with random parameters
 * @returns {Object} Hole data
 */
function generateNewHole() {
    // Generate random par (3, 4, or 5)
    const holePar = PAR_OPTIONS[Math.floor(Math.random() * PAR_OPTIONS.length)];
    
    // Generate distance based on par
    let holeDistance;
    switch(holePar) {
        case 3:
            holeDistance = Math.floor(Math.random() * (PAR3_MAX_DISTANCE - PAR3_MIN_DISTANCE) + PAR3_MIN_DISTANCE); // 100-250 yards
            break;
        case 4:
            holeDistance = Math.floor(Math.random() * (PAR4_MAX_DISTANCE - PAR4_MIN_DISTANCE) + PAR4_MIN_DISTANCE); // 250-470 yards
            break;
        case 5:
            holeDistance = Math.floor(Math.random() * (PAR5_MAX_DISTANCE - PAR5_MIN_DISTANCE) + PAR5_MIN_DISTANCE); // 470-650 yards
            break;
    }
    
    // Convert yards to game units and set hole position
    const holeDistanceUnits = holeDistance * YARDS_TO_UNITS;
    
    // Add some randomness to hole position (slight left/right variance)
    const xVariance = (Math.random() - 0.5) * HOLE_X_VARIANCE_SPREAD; // +/- 5 units left/right
    
    // Set hole position
    const holePosition = {
        x: xVariance,
        z: -holeDistanceUnits
    };
    
    // Create the hole
    const holeData = createHole(holePosition, holePar, holeDistance);
    
    return holeData;
}

/**
 * Get terrain height at a specific x,z position
 * @param {number} x - X position
 * @param {number} z - Z position
 * @returns {number} Height of terrain at position
 */
function getTerrainHeightAt(x, z) {
    // Base ground height
    let height = 0;
    
    // Check contribution from each hill
    for (const hill of hills) {
        // Calculate distance from point to hill center (x-z plane)
        const dx = x - hill.position.x;
        const dz = z - hill.position.z;
        const distanceSquared = dx * dx + dz * dz;
        
        // If within hill radius, add contribution to height
        if (distanceSquared < hill.radius * hill.radius) {
            const distance = Math.sqrt(distanceSquared);
            // Smoother falloff using cosine function
            const falloff = 0.5 + 0.5 * Math.cos(Math.PI * distance / hill.radius);
            height += hill.height * falloff;
        }
    }
    
    return height;
}

/**
 * Utility function: Calculate distance from point to line
 * Used to determine if a point is near the path from A to B
 */
function distancePointToLine(point, lineStart, lineEnd) {
    const dx = lineEnd.x - lineStart.x;
    const dz = lineEnd.z - lineStart.z;
    const lineLengthSquared = dx * dx + dz * dz;
    
    // Handle case where line start and end are the same point
    if (lineLengthSquared === 0) {
        return Math.sqrt(
            Math.pow(point.x - lineStart.x, 2) + 
            Math.pow(point.z - lineStart.z, 2)
        );
    }
    
    // Calculate projection of point onto line
    const t = Math.max(0, Math.min(1, (
        (point.x - lineStart.x) * dx + 
        (point.z - lineStart.z) * dz
    ) / lineLengthSquared));
    
    const projX = lineStart.x + t * dx;
    const projZ = lineStart.z + t * dz;
    
    // Calculate distance from point to projection
    return Math.sqrt(
        Math.pow(point.x - projX, 2) + 
        Math.pow(point.z - projZ, 2)
    );
}

/**
 * Get terrain data for physics calculations
 * @returns {Object} Terrain data including hills
 */
function getTerrainData() {
    return {
        hills,
        getHeightAt: getTerrainHeightAt
    };
}

// Export the module functions
export {
    initCourse,
    createBasicCourse,
    createHole,
    generateNewHole,
    clearCourse,
    getTerrainHeightAt,
    getTerrainData
};
