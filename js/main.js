// main.js - Main entry point for the golf game

// main.js - Main entry point for the golf game

// Import necessary modules
import * as THREE from 'three'; // Import Three.js explicitly
import { GameManager } from './gameManager.js';

// Game objects for Three.js setup
let scene, camera, renderer;
let ball, directionArrow;
let shadowLight;

/**
 * Initialize the game
 */
function init() {
    // Create Three.js scene
    setupScene();
    
    // Create game objects
    createGameObjects();
    
    // Initialize GameManager
    const gameManager = new GameManager(scene, camera, renderer, ball, directionArrow, shadowLight);
    gameManager.start();
    
    // Setup window resize handler - now part of GameManager
    // window.addEventListener('resize', onWindowResize); // Moved to GameManager
}

/**
 * Set up the Three.js scene, camera, and renderer
 */
function setupScene() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // Sky blue
    
    // Create camera with wider field of view
    camera = new THREE.PerspectiveCamera(
        60, // Field of view
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    
    // Initial camera position
    camera.position.set(0, 8, 12);
    camera.lookAt(0, 0, -5);
    
    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    
    // Add renderer to the container
    const container = document.getElementById('container');
    container.appendChild(renderer.domElement);
    
    // Add lights
    addLights();
}

/**
 * Add lights to the scene
 */
function addLights() {
    // Ambient light for general illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    // Directional light for shadows and more dramatic lighting
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    
    // Improved shadow settings
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -25;
    directionalLight.shadow.camera.right = 25;
    directionalLight.shadow.camera.top = 25;
    directionalLight.shadow.camera.bottom = -25;
    
    shadowLight = directionalLight;
    scene.add(directionalLight);
    scene.add(directionalLight.target);
}

/**
 * Create game objects (ball, direction arrow)
 */
function createGameObjects() {
    // Create golf ball - 50% smaller
    const ballGeometry = new THREE.SphereGeometry(0.1, 32, 32); // Changed from 0.2 to 0.1
    const ballMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffffff,
        metalness: 0.2,
        roughness: 0.3
    });
    ball = new THREE.Mesh(ballGeometry, ballMaterial);
    ball.castShadow = true;
    ball.position.set(0, 0.1, 0); // Adjusted y position for smaller ball
    scene.add(ball);
    
    // Create direction arrow with improved visibility
    const arrowGeometry = new THREE.CylinderGeometry(0.05, 0.15, 3, 8);
    const arrowMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xff0000, 
        transparent: true, 
        opacity: 0.9,
        emissive: 0xff0000,
        emissiveIntensity: 0.3
    });
    directionArrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
    directionArrow.rotation.x = Math.PI / 2;
    directionArrow.position.set(0, 0.3, -1.5);
    scene.add(directionArrow);
}

init();
