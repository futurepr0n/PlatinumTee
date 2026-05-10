// js/ui/ClubSelection.js - Manages the club selection UI component

export class ClubSelection {
    constructor() {
        this.clubSelectors = document.querySelectorAll('.club-item');
    }
    updateSelection(currentClub) {
        this.clubSelectors.forEach(selector => {
            selector.classList.remove('active');
        });

        const currentSelector = document.querySelector(`.club-item[data-club="${currentClub}"]`);
        if (currentSelector) {
            currentSelector.classList.add('active');
        }
    }

    // This method will be called from controls.js for keyboard selection
    getClubSelectors() {
        return this.clubSelectors;
    }
}
