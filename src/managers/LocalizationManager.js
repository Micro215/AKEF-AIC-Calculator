import { getProjectBaseUrl, CONSTANTS } from "../config/Constants.js"
import { StorageService } from "../services/StorageService.js";

/**
 * Manages application localization, including loading translation files,
 * providing translation keys, and handling language switching.
 */
export class LocalizationManager {
    constructor() {
        // The currently active language code (e.g., 'en', 'ru').
        this.currentLanguage = 'en';
        // An object to hold all translation strings for the current language.
        this.translations = {};
        // A flag to indicate if translations have been successfully loaded.
        this.isLoaded = false;
        console.debug("[managers.LocalizationManager] Initialized.");
    }

    /**
     * Initializes the localization system.
     * Determines the language to use, loads the translations, and sets the HTML lang attribute.
     * @param {string} [defaultLanguage='en'] - The default language code to use if none is stored.
     * @returns {Promise<string>} A promise that resolves to the initialized language code.
     */
    async init(defaultLanguage = 'en') {
        // Determine the language to use: either the provided default or the one stored in local storage.
        if (defaultLanguage) {
            this.currentLanguage = defaultLanguage;
        } else {
            this.currentLanguage = StorageService.get(CONSTANTS.STORAGE_KEYS.LANGUAGE, 'en');
        }
        console.log(`[managers.LocalizationManager] Initializing with language: "${this.currentLanguage}"`);

        // Load the translation file for the determined language.
        await this.loadTranslations();

        // Set the lang attribute on the HTML document element for accessibility and SEO.
        document.documentElement.lang = this.currentLanguage;

        this.isLoaded = true;
        console.log(`[managers.LocalizationManager] Initialization complete for language: "${this.currentLanguage}"`);
        return this.currentLanguage;
    }

    /**
     * Asynchronously loads the translation file for the current language.
     * Includes a fallback to English if the specified language file is not found.
     */
    async loadTranslations() {
        const translationUrl = `${getProjectBaseUrl()}db/translations/${this.currentLanguage}.json`;
        try {
            console.debug(`[managers.LocalizationManager] Attempting to load translations from: ${translationUrl}`);
            const response = await fetch(translationUrl);
            if (response.ok) {
                this.translations = await response.json();
                console.log(`[managers.LocalizationManager] Successfully loaded translations for "${this.currentLanguage}".`);
            } else {
                // If the requested language file is not found, issue a warning and fall back to English.
                console.warn(`[managers.LocalizationManager] Translation file for "${this.currentLanguage}" not found (status: ${response.status}). Falling back to English.`);
                const fallbackResponse = await fetch(`${getProjectBaseUrl()}db/translations/en.json`);
                if (fallbackResponse.ok) {
                    this.translations = await fallbackResponse.json();
                    this.currentLanguage = 'en'; // Update current language to reflect the fallback.
                    console.log("[managers.LocalizationManager] Successfully loaded fallback English translations.");
                } else {
                    throw new Error("Fallback English translation file could not be loaded.");
                }
            }
        } catch (error) {
            console.error('[managers.LocalizationManager] Error loading translations:', error);
            // In case of a network error or other issue, ensure translations is an empty object to prevent further errors.
            this.translations = {};
        }
    }

    /**
     * Retrieves a localized string using a dot-separated key.
     * @param {string} key - The translation key (e.g., 'ui.buttons.save').
     * @param {string} [fallback=''] - The text to return if the key is not found.
     * @returns {string|Array} The localized string or array, or the fallback value.
     */
    t(key, fallback = '') {
        if (!this.isLoaded) {
            console.warn(`[managers.LocalizationManager] Translation system not loaded yet. Returning fallback for key: "${key}"`);
            return fallback || key;
        }

        // Split the key into parts to traverse the translations object (e.g., 'app.current' -> ['app', 'current']).
        const keys = key.split('.');
        let value = this.translations;

        // Traverse the object structure.
        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                // If the path doesn't exist, return the fallback.
                console.debug(`[managers.LocalizationManager] Translation key not found: "${key}". Returning fallback.`);
                return fallback || key;
            }
        }

        // Return the found value if it's a string or array.
        if (typeof value === 'string' || Array.isArray(value)) {
            return value;
        }

        // If the found value is not a string/array (e.g., it's an object), return the fallback.
        console.debug(`[managers.LocalizationManager] Translation key "${key}" did not resolve to a string. Returning fallback.`);
        return fallback || key;
    }

    /**
     * Gets the localized name for an item object.
     * @param {Object} item - The item object.
     * @returns {string} The localized item name.
     */
    getItemName(item) {
        if (!item) return '';
        // Prioritize the language-specific name, then fall back to English, then a generic 'name' property.
        const nameKey = `name_${this.currentLanguage}`;
        return item[nameKey] || item.name_en || item.name || '';
    }

    /**
     * Gets the localized name for a building object.
     * @param {Object} building - The building object.
     * @returns {string} The localized building name.
     */
    getBuildingName(building) {
        if (!building) return '';
        const nameKey = `name_${this.currentLanguage}`;
        return building[nameKey] || building.name_en || building.name || '';
    }

    /**
     * Gets the localized name for a building mode object.
     * @param {Object} mode - The building mode object.
     * @returns {string} The localized mode name.
     */
    getModeName(mode) {
        if (!mode) return '';
        const nameKey = `name_${this.currentLanguage}`;
        return mode[nameKey] || mode.name_en || mode.name || '';
    }

    /**
     * Gets the localized name for an item type.
     * @param {string} type - The item type string (e.g., 'raw_resource').
     * @returns {string} The localized type name.
     */
    getItemTypeName(type) {
        if (!type) return '';
        // Use the 't' function to find the translation, with a fallback that formats the raw type string.
        return this.t(`types.${type}`, type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
    }

    /**
     * Changes the application's language and reloads the page with the new language in the URL.
     * @param {string} language - The new language code to switch to.
     */
    async setLanguage(language) {
        if (language === this.currentLanguage) {
            console.debug(`[managers.LocalizationManager] Language is already set to "${language}". No action taken.`);
            return;
        }

        console.log(`[managers.LocalizationManager] Switching language from "${this.currentLanguage}" to "${language}".`);
        const projectBaseUrl = getProjectBaseUrl();
        const defaultLanguage = 'en';

        let newUrl;
        // Construct the new URL based on the selected language.
        if (language === defaultLanguage) {
            // If switching to the default language, remove the language code from the URL.
            newUrl = projectBaseUrl.replace(/\/[a-z]{2}\/$/, '/');
        } else {
            // If switching to a non-default language, add or replace the language code in the URL.
            newUrl = projectBaseUrl.replace(/\/[a-z]{2}\/$/, `/${language}/`);
            if (!projectBaseUrl.match(/\/[a-z]{2}\/$/)) {
                newUrl = `${projectBaseUrl}${language}/`;
            }
        }

        // Save the new language to local storage before reloading.
        StorageService.set(CONSTANTS.STORAGE_KEYS.LANGUAGE, language);
        console.log(`[managers.LocalizationManager] Reloading page at new URL: ${newUrl}`);
        // Reload the page to apply the new language globally.
        window.location.href = newUrl;
    }

    /**
     * Fetches the list of available languages from the server.
     * @returns {Promise<Object>} A promise that resolves to an object of language codes and their names.
     */
    async getAvailableLanguages() {
        try {
            const response = await fetch(`${getProjectBaseUrl()}db/languages.json`);
            if (response.ok) {
                const languages = await response.json();
                console.debug("[managers.LocalizationManager] Successfully loaded available languages:", languages);
                return languages;
            }
        } catch (error) {
            console.error('[LocalizationManager] Error loading available languages:', error);
        }

        // Fallback to English if the list cannot be loaded.
        console.warn("[managers.LocalizationManager] Could not load languages.json, falling back to { en: 'English' }.");
        return { en: 'English' };
    }

    /**
     * Gets the localized name for a transport object.
     * @param {Object} transport - The transport object.
     * @returns {string} The localized transport name.
     */
    getTransportName(transport) {
        if (!transport) return '';
        const nameKey = `name_${this.currentLanguage}`;
        return transport[nameKey] || transport.name_en || transport.name || '';
    }
}

/**
 * Detects the initial language from the URL path.
 * It checks if the first segment of the path is a valid language code.
 * @returns {Promise<string>} A promise that resolves to the detected language code or 'en' as a default.
 */
export async function getInitialLanguageFromURL() {
    try {
        console.debug("[managers.LocalizationManager.getInitialLanguageFromURL] Detecting language from URL.");
        // Fetch the list of available languages to validate against.
        const response = await fetch(`${window.projectBaseUrl}db/languages.json`);
        const availableLanguages = await response.json();
        const languageCodes = Object.keys(availableLanguages);

        // Split the URL path into segments and filter out empty strings.
        const pathSegments = window.location.pathname.split('/').filter(segment => segment);

        // Find the index of the first segment that matches a language code.
        const languageIndex = pathSegments.findIndex(segment => languageCodes.includes(segment));

        if (languageIndex !== -1) {
            const detectedLanguage = pathSegments[languageIndex];
            console.log(`[managers.LocalizationManager.getInitialLanguageFromURL] Detected language from URL: "${detectedLanguage}"`);
            return detectedLanguage;
        }
    } catch (error) {
        console.error("[managers.LocalizationManager.getInitialLanguageFromURL] Could not load languages.json for URL detection:", error);
    }

    // Default to English if no language is detected in the URL or an error occurs.
    console.debug("[managers.LocalizationManager.getInitialLanguageFromURL] No language detected in URL, defaulting to 'en'.");
    return 'en';
}