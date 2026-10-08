// js/gameManager.js - Manages the overall game flow and coordination

import * as GameState from './gameState.js';
import * as Physics from './physics.js';
import * as Course from './course.js';
import * as Camera from './camera.js';
import * as UI from '../ui.js';
import * as Controls from './controls.js';
import { getClub } from './clubs.js';
import { eventBus } from './events.js';
import { HostSession } from './net/HostSession.js';
import { LobbyPanel } from './ui/LobbyPanel.js';
import logger from './utils/logger.js'; // Import logger

export class GameManager {
    constructor(scene, camera, renderer, ball, directionArrow) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.ball = ball;
        this.directionArrow = directionArrow;

        this.animationFrame = null;
        this.hostSession = null;
    }

    start() {
        // Initialize modules
        Camera.initCamera(this.camera);
        Course.initCourse(this.scene);
        UI.initUI();
        
        // Create basic course elements
        Course.createBasicCourse();
        
        // Initialize game state after creating game objects
        GameState.initGameState(this.scene, this.ball, this.directionArrow);
        
        // Register game state callbacks for UI updates
        this.registerGameStateCallbacks();

        // Setup listeners for UI events
        this.setupUIEventListeners();
        
        // Initialize controls last, after all other modules
        Controls.initControls();
        
        if (new URLSearchParams(window.location.search).has('host')) {
            this.startHostSession();
        }

        // Generate the first hole
        this.generateNewHole();
        
        // Start animation loop
        this.animate();
        
        // Setup window resize handler
        window.addEventListener('resize', this.onWindowResize.bind(this));
    }

    registerGameStateCallbacks() {
        eventBus.on('gameStateChanged', (data) => {
            this.handleStateChange(data.oldState, data.newState);
            UI.updateUI(data.fullState);
        });

        eventBus.on('holeDataUpdated', (data) => {
            UI.gameInfo.updateHoleInfo(data.holeData);
            UI.updateUI(data.fullState);
        });

        eventBus.on('windDataUpdated', (data) => {
            UI.gameInfo.updateWindInfo(data.windData);
            UI.updateUI(data.fullState);
        });

        eventBus.on('directionUpdated', (data) => {
            UI.directionPointer.updateDirectionIndicator(data.direction, data.fullState.distanceToHole);
            UI.gameInfo.updateStatusText(`Direction: ${data.direction}°`);
        });

        eventBus.on('clubSelected', (data) => {
            if (!data || typeof data !== 'object') return;
            UI.clubSelection.updateSelection(data.clubName);
            UI.gameInfo.updateClubInfo(data.clubName, data.fullState.distanceToHole);
        });

        eventBus.on('shotComplete', (data) => {
            this.handleShotComplete(data.distanceToHole, data.strokes);
        });

        eventBus.on('holeComplete', (data) => {
            this.handleHoleComplete(data.scoreName, data.shotInfo, data.strokes, data.relativeToPar, data.scoreCard);
        });
    }

    setupUIEventListeners() {
        const acceptsLocalInput = () => !this.hostSession && Controls.areControlsEnabled();

        eventBus.on('swingButtonClicked', () => {
            if (!acceptsLocalInput()) return;
            GameState.startPowerMeter();
        });

        eventBus.on('powerButtonClicked', () => {
            if (!acceptsLocalInput()) return;
            const powerValue = UI.powerMeter.stopAnimation();
            GameState.setPower(powerValue);
        });

        eventBus.on('accuracyButtonClicked', () => {
            if (!acceptsLocalInput()) return;
            const accuracyValue = UI.accuracyMeter.stopAnimation();
            GameState.setAccuracy(accuracyValue);
        });

        eventBus.on('nextHoleButtonClicked', () => {
            if (!acceptsLocalInput()) return;
            if (GameState.nextHole()) {
                this.generateNewHole();
            }
        });

        eventBus.on('adjustDirectionRequested', (amount) => {
            if (!acceptsLocalInput()) return;
            GameState.adjustDirection(amount);
        });

        eventBus.on('clubSelected', (clubName) => {
            if (typeof clubName !== 'string') return;
            if (!acceptsLocalInput()) return;
            GameState.setCurrentClub(clubName);
        });

        eventBus.on('controlModeChangeRequested', (controlMode) => {
            if (!acceptsLocalInput()) return;
            GameState.setControlMode(controlMode);
        });

        eventBus.on('trackballShotRequested', (intent) => {
            if (!acceptsLocalInput()) return;
            GameState.takeShotFromIntent(intent);
        });
        
        eventBus.on('simulateSpecificButtonPressRequested', (data) => {
            if (!acceptsLocalInput()) return;
            
            const gameState = data?.gameState || GameState.getGameState();

            if (gameState === GameState.AIMING) {
                GameState.startPowerMeter();
            } else if (gameState === GameState.POWER) {
                eventBus.emit('powerButtonClicked');
            } else if (gameState === GameState.ACCURACY) {
                eventBus.emit('accuracyButtonClicked');
            } else if (gameState === GameState.COMPLETE) {
                eventBus.emit('nextHoleButtonClicked');
            }
        });
    }

    handleStateChange(oldState, newState) {
        logger.info(`Game state changed from ${oldState} to ${newState}`);
    }

    handleShotComplete(distanceToHole, strokes) {
        const distanceYards = Math.round(distanceToHole / Physics.YARDS_TO_UNITS);
        let message;
        if (distanceToHole < 1) {
            message = `So close! Tap in for ${strokes + 1}.`;
        } else if (distanceToHole < 3) {
            message = `Nice approach! ${distanceYards} yards from the hole.`;
        } else if (distanceToHole < 20) {
            message = `On the green! ${distanceYards} yards from the hole.`;
        } else {
            message = `On the fairway! ${distanceYards} yards from the hole.`;
        }
        UI.showTemporaryMessage(message);
    }

    startHostSession() {
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
        const lobby = new LobbyPanel({
            onStart: () => this.hostSession.startRound(),
            onNextHole: () => this.hostSession.nextHole()
        });

        this.hostSession = new HostSession({
            socket: { send: data => socket.readyState === WebSocket.OPEN && socket.send(data) },
            game: GameState,
            bus: eventBus,
            requestNewHole: () => this.generateNewHole(),
            onChange: view => lobby.render(view)
        });

        socket.addEventListener('open', () => this.hostSession.open());
        socket.addEventListener('message', event => this.hostSession.handleMessage(event.data));
        socket.addEventListener('close', () => lobby.render({ ...this.hostSession.view(), phase: 'disconnected' }));
        lobby.render(this.hostSession.view());
    }

    handleHoleComplete(scoreName, shotInfo, strokes, relativeToPar, scoreCard) {
        if (this.hostSession) return;
        const shotDistance = Math.sqrt(
            Math.pow(this.ball.position.x, 2) +
            Math.pow(this.ball.position.z, 2)
        );
        const distanceYards = Math.round(shotDistance / Physics.YARDS_TO_UNITS);
        
        UI.resultsPanel.displayResults(
            `${scoreName}! (${strokes} strokes)`,
            shotInfo,
            distanceYards,
            strokes,
            relativeToPar
        );
        UI.scorecard.updateScoreCard(scoreCard);
    }



    generateNewHole() {
        const holeData = Course.generateNewHole();
        GameState.setHoleData(holeData);
        GameState.generateWind();
    }

    animate() {
        this.animationFrame = requestAnimationFrame(this.animate.bind(this));
        
        if (GameState.getGameState() === GameState.GameState.IN_FLIGHT) {
            GameState.updateBallPhysics();
        }
        
        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}
