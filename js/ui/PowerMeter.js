// js/ui/PowerMeter.js - Manages the power meter UI component

import logger from '../../js/utils/logger.js'; // Import logger

// UI constants for the power meter
const METER_WIDTH_PX = 300;
const POWER_METER_STEP_SIZE = 0.015;
const POWER_METER_INTERVAL_MS = 25;

export class PowerMeter {
    constructor(powerMeterElId) {
        this.powerMeterEl = document.getElementById(powerMeterElId);
        this.powerMarkerEl = null; // Will be created in setupMeterVisuals
        this.powerInterval = null;
        this.currentPowerValue = 0.0;
        this.animationConfig = {
            powerVal: 0,
            increasing: true,
            stepSize: POWER_METER_STEP_SIZE,
            min: 0,
            max: 1,
            frameCount: 0
        };
        this.setupMeterVisuals(); // Call setup directly from constructor
    }

    setupMeterVisuals() {
        if (this.powerMeterEl && !document.getElementById('power-container')) {
            const powerContainer = document.createElement('div');
            powerContainer.id = 'power-container';
            powerContainer.style.display = 'flex';
            powerContainer.style.height = '100%';

            const powerRed = document.createElement('div');
            powerRed.className = 'power-red';
            powerRed.style.flex = '1';
            powerRed.style.backgroundColor = '#ef4444';
            powerContainer.appendChild(powerRed);

            const powerYellow = document.createElement('div');
            powerYellow.className = 'power-yellow';
            powerYellow.style.flex = '1';
            powerYellow.style.backgroundColor = '#f59e0b';
            powerContainer.appendChild(powerYellow);

            const powerGreen = document.createElement('div');
            powerGreen.className = 'power-green';
            powerGreen.style.flex = '1';
            powerGreen.style.backgroundColor = '#10b981';
            powerContainer.appendChild(powerGreen);

            this.powerMeterEl.appendChild(powerContainer);

            const powerMarker = document.createElement('div');
            powerMarker.id = 'power-marker';
            powerMarker.style.position = 'absolute';
            powerMarker.style.top = '0';
            powerMarker.style.height = '100%';
            powerMarker.style.width = '4px';
            powerMarker.style.backgroundColor = 'black';
            powerMarker.style.zIndex = '10';
            this.powerMeterEl.appendChild(powerMarker);
            this.powerMarkerEl = powerMarker;

            const labelEl = this.powerMeterEl.querySelector('#meter-label');
            if (labelEl) {
                labelEl.textContent = 'POWER';
            }
        } else if (this.powerMeterEl) {
            this.powerMarkerEl = document.getElementById('power-marker');
        }
    }

    startAnimation() {
        if (this.powerInterval) {
            clearInterval(this.powerInterval);
        }

        if (!this.powerMarkerEl) {
            logger.error("Power marker element not found for animation.");
            return;
        }

        this.powerMarkerEl.style.left = '0px';
        this.animationConfig.powerVal = this.animationConfig.min;
        this.animationConfig.increasing = true;
        this.animationConfig.frameCount = 0;

        this.powerInterval = setInterval(() => {
            this.animationConfig.frameCount++;
            const config = this.animationConfig;

            if (config.increasing) {
                config.powerVal += config.stepSize;
                if (config.powerVal >= config.max) {
                    config.powerVal = config.max;
                    config.increasing = false;
                }
            } else {
                config.powerVal -= config.stepSize;
                if (config.powerVal <= config.min) {
                    config.powerVal = config.min;
                    config.increasing = true;
                }
            }

            const pixelPosition = Math.floor(config.powerVal * METER_WIDTH_PX);
            this.powerMarkerEl.style.left = `${pixelPosition}px`;
            this.currentPowerValue = config.powerVal;

        }, POWER_METER_INTERVAL_MS);
    }

    stopAnimation() {
        if (this.powerInterval) {
            clearInterval(this.powerInterval);
            this.powerInterval = null;
        }
        return this.currentPowerValue;
    }

    show() {
        if (this.powerMeterEl) {
            this.powerMeterEl.style.display = 'block';
        }
    }

    hide() {
        if (this.powerMeterEl) {
            this.powerMeterEl.style.display = 'none';
        }
    }

    getCurrentValue() {
        return this.currentPowerValue;
    }
}
