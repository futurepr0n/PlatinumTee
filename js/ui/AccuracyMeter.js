// js/ui/AccuracyMeter.js - Manages the accuracy meter UI component

import logger from '../../js/utils/logger.js'; // Import logger

// UI constants for the accuracy meter
const METER_WIDTH_PX = 300;
const ACCURACY_METER_STEP_SIZE = 0.02;
const ACCURACY_METER_INTERVAL_MS = 25;

export class AccuracyMeter {
    constructor(accuracyMeterElId, accuracyMarkerElId) {
        this.accuracyMeterEl = document.getElementById(accuracyMeterElId);
        this.accuracyMarkerEl = document.getElementById(accuracyMarkerElId);
        this.accuracyInterval = null;
        this.currentAccuracyValue = 0.0;
        this.animationConfig = {
            accuracyVal: 0.5, // Start in the center (50%)
            increasing: true,
            stepSize: ACCURACY_METER_STEP_SIZE,
            min: 0,
            max: 1
        };
        // No special setup visuals needed, as it's a simple meter with a single marker
    }

    startAnimation() {
        if (this.accuracyInterval) {
            clearInterval(this.accuracyInterval);
        }

        if (!this.accuracyMarkerEl) {
            logger.error("Accuracy marker element not found for animation.");
            return;
        }

        // Reset marker position to center (50%)
        this.accuracyMarkerEl.style.left = `${METER_WIDTH_PX / 2}px`;
        this.animationConfig.accuracyVal = 0.5; // Start in the center (50%)
        this.animationConfig.increasing = true;

        this.accuracyInterval = setInterval(() => {
            const config = this.animationConfig;

            if (config.increasing) {
                config.accuracyVal += config.stepSize;
                if (config.accuracyVal >= config.max) {
                    config.accuracyVal = config.max;
                    config.increasing = false;
                }
            } else {
                config.accuracyVal -= config.stepSize;
                if (config.accuracyVal <= config.min) {
                    config.accuracyVal = config.min;
                    config.increasing = true;
                }
            }

            this.accuracyMarkerEl.style.left = `${config.accuracyVal * METER_WIDTH_PX}px`;
            this.currentAccuracyValue = config.accuracyVal;

        }, ACCURACY_METER_INTERVAL_MS);
    }

    stopAnimation() {
        if (this.accuracyInterval) {
            clearInterval(this.accuracyInterval);
            this.accuracyInterval = null;
        }
        return this.currentAccuracyValue;
    }

    show() {
        if (this.accuracyMeterEl) {
            this.accuracyMeterEl.style.display = 'block';
        }
    }

    hide() {
        if (this.accuracyMeterEl) {
            this.accuracyMeterEl.style.display = 'none';
        }
    }

    getCurrentValue() {
        return this.currentAccuracyValue;
    }
}
