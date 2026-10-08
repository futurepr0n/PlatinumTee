// js/ui/ResultsPanel.js - Manages the results panel UI component

export class ResultsPanel {
    constructor(resultsElId, resultTextElId, shotInfoElId) {
        this.resultsEl = document.getElementById(resultsElId);
        this.resultTextEl = document.getElementById(resultTextElId);
        this.shotInfoEl = document.getElementById(shotInfoElId);
    }
    displayResults(resultText, shotInfo, distanceYards, strokes, relativeToPar) {
        if (this.resultTextEl && this.shotInfoEl && this.resultsEl) {
            this.resultTextEl.textContent = resultText;

            this.shotInfoEl.innerHTML = `
                <p>Club: ${shotInfo.club}</p>
                <p>Power: ${shotInfo.power}</p>
                <p>Accuracy: ${shotInfo.accuracy}</p>
                <p>Direction: ${shotInfo.direction}°</p>
                <p>Distance: ${distanceYards} yards</p>
                <p>Strokes: ${strokes}</p>
                <p>To Par: ${relativeToPar > 0 ? "+" : ""}${relativeToPar}</p>
            `;
            this.resultsEl.style.display = 'block';
        }
    }

    displayRoundSummary(summaryText) {
        if (!this.resultsEl || !this.resultTextEl || !this.shotInfoEl) return;

        this.resultTextEl.textContent = summaryText;
        this.shotInfoEl.replaceChildren();
        const nextButton = document.getElementById('next-hole-btn');
        if (nextButton) {
            nextButton.textContent = 'NEW ROUND';
            nextButton.style.display = 'block';
        }
        this.resultsEl.style.display = 'block';
    }

    hide() {
        if (this.resultsEl) {
            this.resultsEl.style.display = 'none';
        }
    }
}
