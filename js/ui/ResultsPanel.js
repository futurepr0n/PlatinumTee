// js/ui/ResultsPanel.js - Manages the results panel UI component

export class ResultsPanel {
    constructor(resultsElId, resultTextElId, shotInfoElId) {
        this.resultsEl = document.getElementById(resultsElId);
        this.resultTextEl = document.getElementById(resultTextElId);
        this.shotInfoEl = document.getElementById(shotInfoElId);
    }
    displayResults(resultText, shotInfo, distanceYards, strokes, relativeToPar) {
        if (!this.resultTextEl || !this.shotInfoEl || !this.resultsEl) return;

        this.resultTextEl.textContent = resultText;
        const lines = [
            `Club: ${shotInfo.club}`,
            `Shape: ${shotInfo.shape ?? 'Straight'}`,
            `Power: ${shotInfo.power}`,
            `Accuracy: ${shotInfo.accuracy}`,
            `Direction: ${shotInfo.direction}°`,
            `Distance: ${distanceYards} yards`,
            ...(shotInfo.wind ? [`Wind: ${shotInfo.wind.speed} mph`] : []),
            `Strokes: ${strokes}`,
            `To Par: ${relativeToPar > 0 ? '+' : ''}${relativeToPar}`
        ];
        this.shotInfoEl.replaceChildren(...lines.map(text => {
            const line = document.createElement('p');
            line.textContent = text;
            return line;
        }));
        this.resultsEl.style.display = 'block';
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
