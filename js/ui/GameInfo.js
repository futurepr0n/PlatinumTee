// js/ui/GameInfo.js - Manages general game information display

import { YARDS_TO_UNITS } from '../../js/physics.js';
import { getClub, calculateRecommendedPower } from '../../js/clubs.js';

export class GameInfo {
    constructor(statusElId, windInfoElId, holeInfoElId, shotPowerInfoId) {
        this.statusEl = document.getElementById(statusElId);
        this.windInfoEl = document.getElementById(windInfoElId);
        this.holeInfoEl = document.getElementById(holeInfoElId);
        this.shotPowerInfo = document.getElementById(shotPowerInfoId);
    }
    updateHoleInfo(holeData) {
        if (this.holeInfoEl) {
            this.holeInfoEl.textContent = `Hole #${holeData.currentHole || 1} - Par ${holeData.par} - ${holeData.distance} yards`;
        }
    }

    updateWindInfo(windData) {
        if (this.windInfoEl) {
            const directionNames = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
            const index = Math.round(windData.direction / 45) % 8;
            const arrowChar = '⬆';
            this.windInfoEl.innerHTML = `Wind: ${windData.speed} mph ${directionNames[index]} <span class="wind-direction" style="transform: rotate(${windData.direction}deg)">${arrowChar}</span>`;
        }
    }

    updateClubInfo(clubName, distanceToHole) {
        if (this.statusEl && this.shotPowerInfo) {
            const club = getClub(clubName);
            if (!Number.isFinite(distanceToHole)) {
                this.statusEl.textContent = `Club: ${club.displayName} (${club.maxDistance} yards max)`;
                this.shotPowerInfo.style.display = 'none';
                return;
            }

            const distanceYards = Math.round(distanceToHole / YARDS_TO_UNITS);

            this.statusEl.textContent = `Club: ${club.displayName} (${club.maxDistance} yards max)`;

            if (distanceYards <= club.maxDistance) {
                const recommendedPower = calculateRecommendedPower(clubName, distanceToHole);
                this.shotPowerInfo.textContent = `Recommended Power: ${recommendedPower}% for ${distanceYards} yards`;
                this.shotPowerInfo.style.display = 'block';
            } else {
                this.shotPowerInfo.textContent = `Warning: Hole is ${distanceYards} yards away (${club.maxDistance} max)`;
                this.shotPowerInfo.style.display = 'block';
            }
        }
    }

    updateStatusText(text) {
        if (this.statusEl) {
            this.statusEl.textContent = text;
        }
    }

    showShotPowerInfo() {
        if (this.shotPowerInfo) {
            this.shotPowerInfo.style.display = 'block';
        }
    }

    hideShotPowerInfo() {
        if (this.shotPowerInfo) {
            this.shotPowerInfo.style.display = 'none';
        }
    }
}
