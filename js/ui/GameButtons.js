// js/ui/GameButtons.js - Manages the game's control buttons

import { eventBus } from '../../js/events.js';

export class GameButtons {
    constructor(swingBtnId, powerBtnId, accuracyBtnId, nextHoleBtnId, resultsElId) {
        this.swingBtn = document.getElementById(swingBtnId);
        this.powerBtn = document.getElementById(powerBtnId);
        this.accuracyBtn = document.getElementById(accuracyBtnId);
        this.nextHoleBtn = document.getElementById(nextHoleBtnId);
        this.resultsEl = document.getElementById(resultsElId); // Needed for simulateButtonPress logic

        this.setupEventListeners();
    }
    setupEventListeners() {
        if (this.swingBtn) {
            this.swingBtn.addEventListener('click', () => eventBus.emit('swingButtonClicked'));
        }
        if (this.powerBtn) {
            this.powerBtn.addEventListener('click', () => eventBus.emit('powerButtonClicked'));
        }
        if (this.accuracyBtn) {
            this.accuracyBtn.addEventListener('click', () => eventBus.emit('accuracyButtonClicked'));
        }
        if (this.nextHoleBtn) {
            this.nextHoleBtn.addEventListener('click', () => eventBus.emit('nextHoleButtonClicked'));
        }
    }

    showSwingButton() {
        if (this.swingBtn) this.swingBtn.style.display = 'inline-block';
        if (this.powerBtn) this.powerBtn.style.display = 'none';
        if (this.accuracyBtn) this.accuracyBtn.style.display = 'none';
        if (this.nextHoleBtn) this.nextHoleBtn.style.display = 'none';
    }

    showPowerButton() {
        if (this.swingBtn) this.swingBtn.style.display = 'none';
        if (this.powerBtn) this.powerBtn.style.display = 'inline-block';
        if (this.accuracyBtn) this.accuracyBtn.style.display = 'none';
        if (this.nextHoleBtn) this.nextHoleBtn.style.display = 'none';
    }

    showAccuracyButton() {
        if (this.swingBtn) this.swingBtn.style.display = 'none';
        if (this.powerBtn) this.powerBtn.style.display = 'none';
        if (this.accuracyBtn) this.accuracyBtn.style.display = 'inline-block';
        if (this.nextHoleBtn) this.nextHoleBtn.style.display = 'none';
    }

    hideAllButtons() {
        if (this.swingBtn) this.swingBtn.style.display = 'none';
        if (this.powerBtn) this.powerBtn.style.display = 'none';
        if (this.accuracyBtn) this.accuracyBtn.style.display = 'none';
        // nextHoleBtn might be displayed in results, so don't hide it here
    }

    updateNextHoleButtonText(scoreCardLength, totalHoles) { // Needs totalHoles from GameState
        if (this.nextHoleBtn) {
            if (scoreCardLength === totalHoles) {
                this.nextHoleBtn.textContent = 'FINISH ROUND';
            } else {
                this.nextHoleBtn.textContent = 'NEXT HOLE';
            }
        }
    }

    // This function will likely be called from controls.js
    simulateButtonPress(gameState) { // Need gameState to determine which button to press
        if (gameState === 'aiming' && this.swingBtn && this.swingBtn.style.display !== 'none') {
            eventBus.emit('swingButtonClicked');
        } else if (gameState === 'power' && this.powerBtn && this.powerBtn.style.display !== 'none') {
            eventBus.emit('powerButtonClicked');
        } else if (gameState === 'accuracy' && this.accuracyBtn && this.accuracyBtn.style.display !== 'none') {
            eventBus.emit('accuracyButtonClicked');
        } else if (this.nextHoleBtn && this.resultsEl && this.resultsEl.style.display !== 'none') { // This logic is coupled to resultsEl
            eventBus.emit('nextHoleButtonClicked');
        }
    }
}
