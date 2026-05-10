// js/ui/TemporaryMessage.js - Manages temporary messages displayed to the user

import logger from '../../js/utils/logger.js';

export class TemporaryMessage {
    constructor() {
        this.messageEl = null;
    }

    // No init function, as the element is created dynamically

    showMessage(message, duration = 2000) {
        if (this.messageEl) {
            // If a message is already displayed, remove it first
            document.body.removeChild(this.messageEl);
            this.messageEl = null;
        }

        this.messageEl = document.createElement('div');
        this.messageEl.style.position = 'absolute';
        this.messageEl.style.top = '50%';
        this.messageEl.style.left = '50%';
        this.messageEl.style.transform = 'translate(-50%, -50%)';
        this.messageEl.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        this.messageEl.style.color = 'white';
        this.messageEl.style.padding = '15px';
        this.messageEl.style.borderRadius = '5px';
        this.messageEl.style.fontSize = '18px';
        this.messageEl.style.zIndex = '200';
        this.messageEl.textContent = message;
        document.body.appendChild(this.messageEl);

        logger.info(`Showing temporary message: ${message}`);

        setTimeout(() => {
            if (this.messageEl && document.body.contains(this.messageEl)) {
                document.body.removeChild(this.messageEl);
            }
            this.messageEl = null;
        }, duration);
    }
}
