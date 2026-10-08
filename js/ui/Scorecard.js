// js/ui/Scorecard.js - Manages the scorecard UI component

import logger from '../../js/utils/logger.js'; // Import logger

export class Scorecard {
    constructor(scoreBodyElId, totalStrokesElId, totalParElId, nextHoleBtnId) {
        this.scoreBodyEl = document.getElementById(scoreBodyElId);
        this.totalStrokesEl = document.getElementById(totalStrokesElId);
        this.totalParEl = document.getElementById(totalParElId);
        this.nextHoleBtn = document.getElementById(nextHoleBtnId); // Need reference to update text
    }
    updateScoreCard(scoreCard, totalHoles = 9) {
        if (!this.scoreBodyEl || !this.totalStrokesEl || !this.totalParEl || !this.nextHoleBtn) {
            logger.error("Scorecard elements not initialized.");
            return;
        }

        // Clear existing rows
        this.scoreBodyEl.innerHTML = '';

        // Add rows for each hole
        let totalStrokes = 0;
        let totalToPar = 0;

        scoreCard.forEach(score => {
            const row = document.createElement('tr');

            const holeCell = document.createElement('td');
            holeCell.textContent = score.hole;
            row.appendChild(holeCell);

            const parCell = document.createElement('td');
            parCell.textContent = score.par;
            row.appendChild(parCell);

            const distanceCell = document.createElement('td');
            distanceCell.textContent = score.distance;
            row.appendChild(distanceCell);

            const strokesCell = document.createElement('td');
            strokesCell.textContent = score.strokes;
            row.appendChild(strokesCell);

            const toParCell = document.createElement('td');
            toParCell.textContent = score.toPar > 0 ? "+" + score.toPar : score.toPar;
            row.appendChild(toParCell);

            this.scoreBodyEl.appendChild(row);

            totalStrokes += score.strokes;
            totalToPar += score.toPar;
        });

        // Update totals
        this.totalStrokesEl.textContent = totalStrokes;
        this.totalParEl.textContent = totalToPar > 0 ? "+" + totalToPar : totalToPar;

        // Update next hole button text for last hole
        if (scoreCard.length >= totalHoles) { // Magic number: totalHoles from GameState
            this.nextHoleBtn.textContent = 'FINISH ROUND';
        } else {
            this.nextHoleBtn.textContent = 'NEXT HOLE';
        }
    }
}
