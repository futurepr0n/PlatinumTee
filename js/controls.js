// controls.js - Handles player input and control logic

import { GameState } from './gameState.js'; // GameState is used in simulateButtonPress (GameButtons)
import { eventBus } from './events.js'; // Import eventBus
import { powerMeter, accuracyMeter, clubSelection, gameButtons } from '../ui.js';

// Controls constants
const DIRECTION_ADJUSTMENT_DEGREES = 5;
const DEFAULT_POWER_VALUE = 0.5;
const DEFAULT_ACCURACY_VALUE = 0.5;

// Controls state
let controlsEnabled = true;

/**
 * Initialize the controls module
 */
function initControls() {
    setupKeyboardControls();
    // setupButtonControls() is no longer needed as GameButtons handles its own events
    setupClubSelectionControls();
}

/**
 * Setup keyboard controls for direction and club selection
 */
function setupKeyboardControls() {
    window.addEventListener('keydown', (e) => {
        // Only process inputs if controls are enabled
        if (!controlsEnabled) return;
        
        switch (e.key) {
            case 'ArrowLeft':
                // Adjust direction left (counter-clockwise)
                eventBus.emit('adjustDirectionRequested', -DIRECTION_ADJUSTMENT_DEGREES);
                break;
                
            case 'ArrowRight':
                // Adjust direction right (clockwise)
                eventBus.emit('adjustDirectionRequested', DIRECTION_ADJUSTMENT_DEGREES);
                break;
                
            case ' ':
            case 'Enter':
                // Space or Enter key simulates the appropriate button click
                eventBus.emit('simulateButtonPressRequested');
                break;
                
            default:
                // Handle club selection with number keys (1-9)
                handleClubSelection(e); // handleClubSelection will also emit an event
                break;
        }
    });
}

/**
 * Setup club selection click events
 */
function setupClubSelectionControls() {
    // Add click event listeners to club selectors
    clubSelection.getClubSelectors().forEach(selector => {
        selector.addEventListener('click', () => {
            if (!controlsEnabled) return;
            
            // Get club name from data attribute
            const clubName = selector.getAttribute('data-club');
            if (clubName) {
                eventBus.emit('clubSelected', clubName);
            }
        });
    });
}

/**
 * Handle club selection with number keys
 * @param {KeyboardEvent} e - Keyboard event
 */
function handleClubSelection(e) {
    // Only handle number keys 1-9
    if (e.key >= '1' && e.key <= '9') {
        const clubNum = parseInt(e.key);
        
        // Map numbers to club names
        let clubName;
        switch(clubNum) {
            case 1: clubName = 'driver'; break;
            case 2: clubName = 'wood3'; break;
            case 3: clubName = 'hybrid'; break;
            case 4: clubName = 'iron5'; break;
            case 5: clubName = 'iron7'; break;
            case 6: clubName = 'iron9'; break;
            case 7: clubName = 'pitchingWedge'; break;
            case 8: clubName = 'sandWedge'; break;
            case 9: clubName = 'putter'; break;
        }
        
        if (clubName) {
            eventBus.emit('clubSelected', clubName);
        }
    }
}
/**
 * Simulate button press based on current game state
 */
function simulateButtonPress() {
    // This function needs access to the current game state
    // We can pass it from here, assuming GameState is available
    gameButtons.simulateButtonPress(GameState.getGameState());
}

/**
 * Enable or disable controls
 * @param {boolean} enabled - Whether controls should be enabled
 */
function setControlsEnabled(enabled) {
    controlsEnabled = enabled;
}

/**
 * Get whether controls are enabled
 * @returns {boolean} Whether controls are enabled
 */
function areControlsEnabled() {
    return controlsEnabled;
}

// Export the module functions
export {
    initControls,
    setControlsEnabled,
    areControlsEnabled
};