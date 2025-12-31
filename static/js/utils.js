/**
 * Escapes HTML special characters to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
export function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Announces a message to screen readers via ARIA live regions
 * @param {string} message - Message to announce
 * @param {boolean} isAlert - If true, uses assertive region (for urgent messages)
 */
export function announceToScreenReader(message, isAlert = false) {
    const regionId = isAlert ? 'alert-region' : 'announcement-region';
    const region = document.getElementById(regionId);
    if (region) {
        region.textContent = message;
        setTimeout(() => { region.textContent = ''; }, 1000);
    }
}

let updatedAt = '';

export function setUpdatedAt(value) {
    updatedAt = value;
}

export function getUpdatedAt() {
    return updatedAt;
}
