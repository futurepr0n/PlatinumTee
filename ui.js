// ui.js - Handles UI elements and updates

import { GameState } from './js/gameState.js';
import { YARDS_TO_UNITS } from './js/physics.js';
import { CONTROL_MODES } from './js/shotControls/controlModes.js';

import { PowerMeter } from './js/ui/PowerMeter.js';
import { AccuracyMeter } from './js/ui/AccuracyMeter.js';
import { GameInfo } from './js/ui/GameInfo.js';
import { ResultsPanel } from './js/ui/ResultsPanel.js';
import { Scorecard } from './js/ui/Scorecard.js';
import { ClubSelection } from './js/ui/ClubSelection.js';
import { GameButtons } from './js/ui/GameButtons.js';
import { DirectionPointer } from './js/ui/DirectionPointer.js';
import { TemporaryMessage } from './js/ui/TemporaryMessage.js';
import { ControlModeSwitcher } from './js/ui/ControlModeSwitcher.js';



// UI state
let uiState = {
    isArrowAnimating: false
};

// UI Components
let powerMeter;
let accuracyMeter;
let gameInfo;
let resultsPanel;
let scorecard;
let clubSelection;
let gameButtons;
let directionPointer;
let temporaryMessage;
let controlModeSwitcher;

/**
 * Initialize the UI module
 */
function initUI() {
    // Setup UI event listeners
    setupEventListeners();

    // Initialize UI Components
    powerMeter = new PowerMeter('power-meter');

    accuracyMeter = new AccuracyMeter('accuracy-meter', 'marker');

    gameInfo = new GameInfo('status', 'wind-info', 'hole-info', 'shot-power-info');

    resultsPanel = new ResultsPanel('results', 'result-text', 'shot-info');

    scorecard = new Scorecard('score-body', 'total-strokes', 'total-par', 'next-hole-btn');

    clubSelection = new ClubSelection();

    gameButtons = new GameButtons('swing-btn', 'power-btn', 'accuracy-btn', 'next-hole-btn', 'results');

    controlModeSwitcher = new ControlModeSwitcher('control-mode-switcher');

    directionPointer = new DirectionPointer('direction-indicator', 'target-flag');
    temporaryMessage = new TemporaryMessage(); // No init() needed for this component
}



/**
 * Setup event listeners for UI elements
 */
function setupEventListeners() {
    // These listeners will be bound to callbacks in main.js
    // So we're just preparing the structure here
}

/**
 * Update UI based on game state
 * @param {Object} info - Game information
 */
function updateUI(info) {
    switch (info.gameState) {
        case GameState.AIMING:
            showAimingUI(info);
            break;
        case GameState.POWER:
            showPowerUI();
            break;
        case GameState.ACCURACY:
            showAccuracyUI();
            break;
        case GameState.IN_FLIGHT:
            showInFlightUI(info);
            break;
        case GameState.EVALUATING:
            // Keep the in-flight UI during evaluation
            showInFlightUI(info);
            break;
        case GameState.COMPLETE:
            // Results UI is shown by displayResults function
            break;
    }
    
    // Always update information displays
    gameInfo.updateHoleInfo(info.holeData);
    gameInfo.updateWindInfo(info.windData);
    
    // Update club selection
    clubSelection.updateSelection(info.currentClub);
    controlModeSwitcher.updateSelection(info.currentControlMode);
}

/**
 * Show UI elements for aiming state
 * @param {Object} info - Game information
 */
function showAimingUI(info) {
    // Hide/show relevant buttons
    gameButtons.showSwingButton();
    controlModeSwitcher.show();
    if (info.currentControlMode === CONTROL_MODES.TRACKBALL) {
        gameButtons.hideAllButtons();
    }
    
    // Hide meters
    powerMeter.hide();
    accuracyMeter.hide();
    
    // Show direction indicator and target flag
    directionPointer.show();
    
    // Update direction indicator
    directionPointer.updateDirectionIndicator(info.direction, info.distanceToHole);
    
    // Update club info and shot power information
    gameInfo.updateClubInfo(info.currentClub, info.distanceToHole);
    
    // Update status text
    gameInfo.updateStatusText(`Direction: ${info.direction}°`); // Club info is handled by updateClubInfo
}

/**
 * Show UI elements for power selection state
 */
function showPowerUI() {
    // Show/hide relevant buttons
    gameButtons.showPowerButton();
    controlModeSwitcher.hide();
    
    // Show power meter
    powerMeter.show();
    accuracyMeter.hide();
    
    // Hide direction indicator and target flag
    directionPointer.hide();
    gameInfo.hideShotPowerInfo();
    
    // Start power meter animation
    powerMeter.startAnimation();
}

function showTemporaryMessage(message, duration) {
    temporaryMessage.showMessage(message, duration);
}

/**
 * Show UI elements for accuracy selection state
 */
function showAccuracyUI() {
    // Show/hide relevant buttons
    gameButtons.showAccuracyButton();
    controlModeSwitcher.hide();
    
    // Show accuracy meter
    powerMeter.hide(); // Hide power meter
    accuracyMeter.show();
    
    // Start accuracy meter animation
    accuracyMeter.startAnimation();
}

/**
 * Show UI elements for ball in flight state
 * @param {Object} info - Game information
 */
function showInFlightUI(info) {
    // Hide all interactive elements
    gameButtons.hideAllButtons();
    controlModeSwitcher.hide();
    powerMeter.hide();
    accuracyMeter.hide();
    directionPointer.hide();
    gameInfo.hideShotPowerInfo();
    
    // Update status with distance information
    if (info.distanceToHole) {
        const distanceYards = Math.round(info.distanceToHole / YARDS_TO_UNITS);
        gameInfo.updateStatusText(`Distance to hole: ${distanceYards} yards`);
    } else {
        gameInfo.updateStatusText('Ball in flight...');
    }
}












// Export the module functions
export {
    initUI,
    updateUI,
    // stopPowerMeterAnimation is now handled by PowerMeter class
    // stopAccuracyMeterAnimation is now handled by AccuracyMeter class
    // displayResults is now handled by ResultsPanel class
    // updateScoreCard is now handled by Scorecard class
    // hideResults is now handled by ResultsPanel class
    // updateClubSelection is now handled by ClubSelection class
    // updateDirectionIndicator is now handled by DirectionPointer class
    showTemporaryMessage,
    // getElements removed
    powerMeter, // Export the powerMeter instance
    accuracyMeter, // Export the accuracyMeter instance
    gameInfo, // Export the gameInfo instance
    resultsPanel, // Export the resultsPanel instance
    scorecard, // Export the scorecard instance
    clubSelection, // Export the clubSelection instance
    gameButtons, // Export the gameButtons instance
    directionPointer, // Export the directionPointer instance
    controlModeSwitcher // Export the controlModeSwitcher instance
};
