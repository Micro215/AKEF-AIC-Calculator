/**
 * Toggles the visibility of the application's loading indicator.
 * This function is typically called before and after asynchronous operations
 * like data fetching or production calculation to provide user feedback.
 * @param {boolean} show - If true, the loading message is displayed. Otherwise, it's hidden.
 */
export function showLoading(show) {
    // Check for the existence of the loading message element in the DOM.
    // This prevents a TypeError if the element hasn't been initialized yet.
    if (!window.elements?.loadingMessage) {
        console.error('[utils.ShowLoading] Loading message element not found. Cannot toggle visibility.');
        return;
    }

    // Set the display style to 'flex' to show the message, or 'none' to hide it.
    window.elements.loadingMessage.style.display = show ? 'flex' : 'none';

    console.debug(`[utils.ShowLoading] Loading indicator is now ${show ? 'visible' : 'hidden'}.`);
}