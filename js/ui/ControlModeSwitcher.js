import { eventBus } from '../../js/events.js';
import { CONTROL_MODES } from '../../js/shotControls/controlModes.js';

export class ControlModeSwitcher {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.buttons = this.container ? Array.from(this.container.querySelectorAll('[data-control-mode]')) : [];
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.buttons.forEach(button => {
            button.addEventListener('click', () => {
                const controlMode = button.getAttribute('data-control-mode');
                eventBus.emit('controlModeChangeRequested', controlMode);
            });
        });
    }

    updateSelection(controlMode = CONTROL_MODES.CLASSIC) {
        this.buttons.forEach(button => {
            const isActive = button.getAttribute('data-control-mode') === controlMode;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-pressed', String(isActive));
        });
    }

    show() {
        if (this.container) this.container.style.display = 'inline-flex';
    }

    hide() {
        if (this.container) this.container.style.display = 'none';
    }
}
