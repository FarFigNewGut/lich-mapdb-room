/**
 * Escapes HTML special characters. Safe for text nodes AND for quoted attribute
 * values: & < > " ' are all converted to entities. Encoded quotes render normally
 * in text, so callers don't need a separate attribute escaper.
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
export function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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
