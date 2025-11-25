/**
 * Global constants and configuration helpers.
 */
export const CONSTANTS = {
    SECONDS_PER_MINUTE: 60,
    STORAGE_KEYS: {
        // Key for storing user display settings in local storage.
        SETTINGS: 'akef-display-settings',
        // Key for storing the selected application language.
        LANGUAGE: 'akef-language',
        // Key for storing the default set of recipes.
        DEFAULT_RECIPES: 'akef-default-recipes',
        // Key for storing the state of UI tabs.
        TABS: 'akef-tabs',
        // Key for storing the currently active tab.
        ACTIVE_TAB: 'akef-active-tab'
    }
};

/**
 * Determines the base URL for the application, specifically for GitHub Pages deployment
 * where the app is served from a subdirectory (e.g., https://username.github.io/repo-name/).
 * @returns {string} The base URL, ensuring it ends with a '/'.
 */
export function getProjectBaseUrl() {
    // Get the current path from the URL, split it into parts, and filter out any empty strings.
    // This handles both root deployments ('/') and subdirectory deployments ('/repo-name/').
    const pathSegments = window.location.pathname.split('/').filter(segment => segment);

    // Determine the base URL based on the presence of path segments.
    // If segments exist (e.g., 'repo-name'), construct the URL from the first segment.
    // Otherwise, default to the root '/'.
    const baseUrl = pathSegments.length > 0 ? '/' + pathSegments[0] + '/' : '/';

    // Log the determined base URL for debugging purposes.
    console.debug(`[config.Constants.getProjectBaseUrl] Determined base URL: "${baseUrl}" from pathname: "${window.location.pathname}"`);

    return baseUrl;
}