// js/ui/DirectionPointer.js - Manages the direction indicator and target flag UI component

export class DirectionPointer {
    constructor(directionIndicatorId, targetFlagId) {
        this.directionIndicator = document.getElementById(directionIndicatorId);
        this.targetFlag = document.getElementById(targetFlagId);
    }
    updateDirectionIndicator(direction, distanceToHole) {
        if (this.directionIndicator && this.targetFlag) {
            // Calculate angle to hole in degrees (this would normally be provided by gameState)
            const angleToHole = 0; // Placeholder - should be calculated in gameState

            // Calculate the final direction
            const finalDirection = angleToHole + direction;

            // Set the indicator direction
            this.directionIndicator.style.transform = `translateX(-50%) rotate(${finalDirection}deg)`;

            // Show target flag
            this.targetFlag.style.display = 'block';

            // Calculate flag position based on distance and final direction
            const flagDist = Number.isFinite(distanceToHole) ? Math.min(distanceToHole * 0.4, 150) : 0;
            const flagRad = finalDirection * (Math.PI / 180);
            const flagX = 50 + Math.sin(flagRad) * flagDist;
            const flagY = 50 - Math.cos(flagRad) * flagDist / 4;

            this.targetFlag.style.left = `${flagX}%`;
            this.targetFlag.style.bottom = `${flagY}%`;
        }
    }

    show() {
        if (this.directionIndicator) this.directionIndicator.style.display = 'block';
        if (this.targetFlag) this.targetFlag.style.display = 'block';
    }

    hide() {
        if (this.directionIndicator) this.directionIndicator.style.display = 'none';
        if (this.targetFlag) this.targetFlag.style.display = 'none';
    }
}
