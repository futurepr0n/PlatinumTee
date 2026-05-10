// physics.js - Handles ball physics, collision detection, and movement

// Conversion constants
const YARDS_TO_UNITS = 0.5; // 1 game unit = 2 yards

// Physics settings
const GRAVITY = 0.015;
const AIR_RESISTANCE = 0.99;
const GROUND_FRICTION = 0.75;

// Power Scaling Constants
const POWER_SCALE_HORIZONTAL_MULTIPLIER = 0.8;
const POWER_SCALE_HORIZONTAL_OFFSET = 0.1;

const PUTTER_VERTICAL_POWER = 0.001;
const PUTTER_VERTICAL_POWER_MULTIPLIER = 0.02;
const DEFAULT_VERTICAL_POWER_OFFSET = 0.1;

// New Constants for Magic Numbers
const BALL_RADIUS = 0.1; // Derived from ballGeometry in main.js
const WIND_EFFECT_MULTIPLIER = 0.0002;
const PUTTER_ROTATION_SPEED = 0.2;
const DEFAULT_ROTATION_SPEED = 0.5;
const HOLE_RADIUS = 0.15;
const HOLE_RADIUS_SQUARED = HOLE_RADIUS * HOLE_RADIUS; // For faster distance checks
const HOLE_ENTRY_SPEED_THRESHOLD = 0.1;
const HOLE_VERTICAL_TOLERANCE = 0.2; // Ball Y position tolerance for hole entry
const IN_HOLE_DEPTH_THRESHOLD = 0.05; // How far below hole.position.y ball is considered "in"

const PUTTER_BOUNCE_FACTOR = 0.05;
const DEFAULT_BOUNCE_BASE = 0.3;
const CLUB_HEIGHT_BOUNCE_MULTIPLIER = 0.3;
const POWER_BOUNCE_MULTIPLIER = 0.1;

const PUTTER_GROUND_FRICTION = 0.8;

const PUTTER_SPEED_THRESHOLD = 0.005;
const DEFAULT_SPEED_THRESHOLD = 0.03;
const MAX_BOUNCE_COUNT = 20;

const PUTTER_MIN_POWER = 0.01;
const PUTTER_POWER_MULTIPLIER = 0.15;
const PUTTER_DISTANCE_POWER_DIVISOR = 120; // Reduced for smoother putts

// Terrain settings
let terrainHeightMap = null;

// Ball physics state
class BallPhysics {
    constructor(initialPosition, direction, power, club, wind = { direction: 0, speed: 0 }, holePosition = null) {
        this.initialPosition = { ...initialPosition };
        this.direction = direction;
        this.power = power;
        this.club = club;
        this.wind = wind;
        this.isInFlight = true;
        this.holePosition = holePosition; // Store hole position for collision detection
        this.inHole = false; // Flag to track if ball is in the hole

        // Calculate initial velocity based on club characteristics and power
        this.velocity = this.calculateInitialVelocity();
        
        // Track bounce count to determine when to stop the ball
        this.bounceCount = 0;
    }

    calculateInitialVelocity() {
        // Convert direction to radians
        const dirRadians = this.direction * (Math.PI / 180);

        // Apply progressive power scaling - exponential instead of linear
        // This gives more control for subtle shots
        const powerScale = this.calculatePowerScaling();
        
        // Calculate initial velocity components
        return {
            x: Math.sin(dirRadians) * powerScale.horizontal, // Left/right
            y: powerScale.vertical, // Height - depends on club loft
            z: -Math.cos(dirRadians) * powerScale.horizontal  // Forward
        };
    }

    calculatePowerScaling() {
        // Use a completely linear scaling approach for more predictable shot distances
        // This makes the relationship between power meter and shot distance direct and intuitive
        let baseHorizontalPower;
        let verticalPower;
        
        // Get distance to hole
        const distanceToHole = this.calculateDistanceToHole();
        const distanceYards = distanceToHole / YARDS_TO_UNITS;
        
        // CRITICAL FIX: Ensure minimum power is always available
        // This prevents the "can't reach hole" problem at short distances
        
        // Calculate base power using a simpler, more linear relationship
        baseHorizontalPower = this.power * POWER_SCALE_HORIZONTAL_MULTIPLIER + POWER_SCALE_HORIZONTAL_OFFSET; // 0.1 to 0.9 range - always provides some power
        
        // Club-specific scaling factors that are more linear and predictable
        // Each club gets a constant multiplier based on its maximum distance capability
        const clubDistanceFactors = {
            driver: 1.0,
            wood3: 0.9,
            hybrid: 0.8,
            iron5: 0.7,
            iron7: 0.6,
            iron9: 0.5,
            pitchingWedge: 0.4,
            sandWedge: 0.3,
            putter: 0.1
        };
        
        // Get club factor with fallback
        const clubFactor = clubDistanceFactors[this.club.name] || 0.5;
        
        // Get base vertical power (club loft effect)
        verticalPower = (this.club.name === 'putter') ? 
                        PUTTER_VERTICAL_POWER_MULTIPLIER * this.power : // Nearly flat trajectory for putters
                        DEFAULT_VERTICAL_POWER_OFFSET + (this.power * this.club.height); // Normal loft for other clubs
        
        // Special case for putter - completely different physics for better short game
        if (this.club.name === 'putter') {
            // Putter gets very precise power control for short distances
            // Linear relationship between power and distance
            // FIXED: Ensure power range is appropriate for putting
            const putterPower = Math.max(PUTTER_MIN_POWER, this.power * PUTTER_POWER_MULTIPLIER);
            
            // Minimum power to ensure you can always reach the hole
            const minPowerForDistance = distanceYards / PUTTER_DISTANCE_POWER_DIVISOR; // Reduced for smoother putts
            
            // Use the greater of the two to ensure you can reach the hole
            const effectivePower = Math.max(putterPower, minPowerForDistance);
            
            // DEBUG
            console.log(`Putter physics: power=${this.power}, effectivePower=${effectivePower}`);
            
            return { 
                horizontal: effectivePower,
                vertical: PUTTER_VERTICAL_POWER // Almost no vertical movement for putts
            };
        }
        
        // For all other clubs, use a consistent, scaled approach
        return {
            horizontal: baseHorizontalPower * clubFactor,
            vertical: verticalPower
        };
    }

    calculateDistanceToHole() {
        // This should be replaced with actual distance calculation
        // based on ball position and hole position
        return 100 * YARDS_TO_UNITS; // Placeholder
    }

    update(ball, terrain) {
        if (!this.isInFlight) return false;

        // Apply gravity
        this.velocity.y -= GRAVITY;

        // Apply air resistance (slows the ball gradually)
        this.velocity.x *= AIR_RESISTANCE;
        this.velocity.y *= AIR_RESISTANCE;
        this.velocity.z *= AIR_RESISTANCE;

        // Apply wind effect
        const windRadians = this.wind.direction * (Math.PI / 180);
        const windEffect = this.wind.speed * WIND_EFFECT_MULTIPLIER;
        
        this.velocity.x += Math.sin(windRadians) * windEffect;
        this.velocity.z += -Math.cos(windRadians) * windEffect;

        // Update ball position
        ball.position.x += this.velocity.x;
        ball.position.y += this.velocity.y;
        ball.position.z += this.velocity.z;

        // Ball rotation effect for visual feedback
        // Reduced for smoother putting
        const rotationSpeed = (this.club.name === 'putter') ? PUTTER_ROTATION_SPEED : DEFAULT_ROTATION_SPEED;
        ball.rotation.x -= this.velocity.z * rotationSpeed;
        ball.rotation.z -= this.velocity.x * rotationSpeed;

        // Get terrain height at current position - this is key for the hills collision
        const terrainHeight = this.getTerrainHeightAt(ball.position.x, ball.position.z, terrain);

        // Check if the ball is near the hole - improved hole detection
        if (this.holePosition) {
            const dx = ball.position.x - this.holePosition.x;
            const dz = ball.position.z - this.holePosition.z;
            const distanceToHoleSquared = dx * dx + dz * dz;
            const speed = Math.sqrt(
                this.velocity.x * this.velocity.x +
                this.velocity.y * this.velocity.y +
                this.velocity.z * this.velocity.z
            );
            
            // Ball radius is 0.1, hole radius is 0.15
            // If ball is over the hole and slow enough, it should fall in
            if (distanceToHoleSquared < HOLE_RADIUS_SQUARED && speed < HOLE_ENTRY_SPEED_THRESHOLD && ball.position.y <= this.holePosition.y + HOLE_VERTICAL_TOLERANCE) {
                // Ball is in hole! Slowly lower it
                this.inHole = true;
                this.velocity.x *= 0.5;
                this.velocity.z *= 0.5;
                this.velocity.y = -0.01; // Slow descent into hole
                
                // If ball is below hole level, shot is complete
                if (ball.position.y < this.holePosition.y - IN_HOLE_DEPTH_THRESHOLD) {
                    this.isInFlight = false;
                    console.log("HOLE IN! Ball has entered the hole!");
                    return false; // Shot complete
                }
                
                return true; // Continue falling into hole
            }
        }

        // Check ground collision with terrain height
        if (ball.position.y < terrainHeight + BALL_RADIUS && !this.inHole) { // BALL_RADIUS is ball radius
            // Position ball on the ground
            ball.position.y = terrainHeight + BALL_RADIUS;
            
            // Bounce with friction - more realistic bounce physics
            // Reduced bounce for putting or when using less lofted clubs
            let bounceFactor;
            if (this.club.name === 'putter') {
                bounceFactor = PUTTER_BOUNCE_FACTOR; // Even less bounce for putting
            } else {
                // More lofted clubs and higher power give more bounce
                bounceFactor = DEFAULT_BOUNCE_BASE + (this.club.height * CLUB_HEIGHT_BOUNCE_MULTIPLIER) + (this.power * POWER_BOUNCE_MULTIPLIER);
            }
            
            // Bounce effect
            this.velocity.y = -this.velocity.y * bounceFactor;
            
            // Apply greater friction based on club and surface
            let frictionFactor;
            if (this.club.name === 'putter') {
                frictionFactor = PUTTER_GROUND_FRICTION; // Less friction for putts to roll longer
            } else {
                frictionFactor = GROUND_FRICTION;
            }
            
            this.velocity.x *= frictionFactor;
            this.velocity.z *= frictionFactor;
            
            // Track bounces to determine when to stop
            this.bounceCount++;
            
            // Stop the ball if moving too slowly (varies by club and count of bounces)
            // This allows putts to roll longer and wedge shots to stop quicker
            const speedThreshold = (this.club.name === 'putter') ? PUTTER_SPEED_THRESHOLD : DEFAULT_SPEED_THRESHOLD;
            const speed = Math.sqrt(
                this.velocity.x * this.velocity.x +
                this.velocity.y * this.velocity.y +
                this.velocity.z * this.velocity.z
            );
            
            // Debug output
            if (this.club.name === 'putter' && this.bounceCount % 5 === 0) {
                console.log(`Putt: speed=${speed.toFixed(4)}, bounces=${this.bounceCount}`);
            }
            
            // Stop if the ball is moving very slowly or has bounced multiple times
            if (speed < speedThreshold || this.bounceCount > MAX_BOUNCE_COUNT) {
                this.isInFlight = false;
                this.velocity = { x: 0, y: 0, z: 0 };
                return false; // Signal that the ball has stopped
            }
        }
        
        return true; // Ball is still moving
    }

    getTerrainHeightAt(x, z, terrain) {
        // If there's no terrain, just use ground level (0)
        if (!terrain) return 0;
        
        // Find the height of terrain at the given x,z position
        // This is an example implementation - replace with actual terrain height lookup
        // based on your terrain implementation
        
        // For a simple implementation, we can check for nearby hills in the scene
        // and calculate their contribution to the height at this point
        let height = 0;
        
        // Example: loop through all hills in the terrain
        if (terrain.hills && terrain.hills.length > 0) {
            for (const hill of terrain.hills) {
                // Calculate distance from point to hill center (x-z plane)
                const dx = x - hill.position.x;
                const dz = z - hill.position.z;
                const distanceSquared = dx * dx + dz * dz;
                
                // Hill contribution based on distance and hill height
                // Using a simple radial falloff
                if (distanceSquared < hill.radius * hill.radius) {
                    // Inside hill radius
                    const distance = Math.sqrt(distanceSquared);
                    const falloff = 1 - (distance / hill.radius);
                    
                    // Add this hill's height contribution
                    height += hill.height * falloff;
                }
            }
        }
        
        return height;
    }
}

// Export the necessary functions and classes
export { BallPhysics, YARDS_TO_UNITS, GRAVITY, AIR_RESISTANCE, GROUND_FRICTION };