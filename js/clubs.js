// clubs.js - Manages golf clubs, their specifications and behavior

// Import utility functions
import { YARDS_TO_UNITS } from './physics.js';

// Club types and their distances (at 100% power)
const CLUBS = {
    driver: { 
        name: 'driver',
        displayName: 'Driver',
        maxDistance: 400, 
        height: 0.8,
        accuracy: 0.7   // Lower = harder to hit accurately
    },
    wood3: { 
        name: 'wood3',
        displayName: '3 Wood',
        maxDistance: 300, 
        height: 0.7,
        accuracy: 0.75
    },
    hybrid: { 
        name: 'hybrid',
        displayName: 'Hybrid',
        maxDistance: 250, 
        height: 0.6,
        accuracy: 0.8
    },
    iron5: { 
        name: 'iron5',
        displayName: '5 Iron',
        maxDistance: 200, 
        height: 0.55,
        accuracy: 0.82
    },
    iron7: { 
        name: 'iron7',
        displayName: '7 Iron',
        maxDistance: 170, 
        height: 0.5,
        accuracy: 0.85
    },
    iron9: { 
        name: 'iron9',
        displayName: '9 Iron',
        maxDistance: 140, 
        height: 0.45,
        accuracy: 0.87
    },
    pitchingWedge: { 
        name: 'pitchingWedge',
        displayName: 'Pitching Wedge',
        maxDistance: 120, 
        height: 0.4,
        accuracy: 0.9
    },
    sandWedge: { 
        name: 'sandWedge',
        displayName: 'Sand Wedge',
        maxDistance: 90, 
        height: 0.35,
        accuracy: 0.92
    },
    putter: { 
        name: 'putter',
        displayName: 'Putter',
        maxDistance: 20, 
        height: 0.1,
        accuracy: 0.95
    }
};

/**
 * Returns the current club selection
 * @param {string} clubName - The name of the club to get
 * @returns {Object} The club object
 */
function getClub(clubName) {
    return CLUBS[clubName] || CLUBS.driver;
}

/**
 * Recommends the appropriate club based on distance to the hole
 * @param {number} distanceToHole - Distance to hole in game units
 * @returns {string} The recommended club name
 */
function recommendClub(distanceToHole) {
    // Convert distance to yards
    const distanceYards = Math.round(distanceToHole / YARDS_TO_UNITS);
    
    // Select club based on distance
    if (distanceYards > 300) return 'driver';
    if (distanceYards > 250) return 'wood3';
    if (distanceYards > 200) return 'hybrid';
    if (distanceYards > 170) return 'iron5';
    if (distanceYards > 140) return 'iron7';
    if (distanceYards > 120) return 'iron9';
    if (distanceYards > 90) return 'pitchingWedge';
    if (distanceYards > 20) return 'sandWedge';
    return 'putter';
}

/**
 * Calculates the recommended power percentage for a shot
 * @param {string} clubName - The name of the current club
 * @param {number} distanceToHole - Distance to hole in game units
 * @returns {number} Recommended power percentage (0-100)
 */
function calculateRecommendedPower(clubName, distanceToHole) {
    const club = CLUBS[clubName];
    if (!club) return 100;
    
    // Convert distance to yards
    const distanceYards = Math.round(distanceToHole / YARDS_TO_UNITS);
    
    // Calculate linear power percentage based on distance and maximum club distance
    // This creates a direct, predictable relationship between the power meter and shot distance
    let powerNeeded = Math.min(1, distanceYards / club.maxDistance);
    
    // Apply slight adjustments for different club types to match physics implementation
    if (club.name === 'putter') {
        // For putters, we need more power since the physics implementation is heavily dampened
        powerNeeded = Math.min(1, powerNeeded * 1.8);
    } else if (club.name === 'sandWedge' || club.name === 'pitchingWedge') {
        // For short irons/wedges, we need slightly more power
        powerNeeded = Math.min(1, powerNeeded * 1.3);
    } else if (distanceYards < 50) {
        // For approach shots with any club
        powerNeeded = Math.min(1, powerNeeded * 1.2);
    } else if (club.name === 'driver' || club.name === 'wood3') {
        // For longer clubs, slightly less power is needed due to physics implementation
        powerNeeded = powerNeeded * 0.9;
    }
    
    return Math.round(powerNeeded * 100);
}

/**
 * Get all available clubs
 * @returns {Object} All clubs
 */
function getAllClubs() {
    return CLUBS;
}

export { 
    getClub, 
    recommendClub, 
    calculateRecommendedPower,
    getAllClubs
};