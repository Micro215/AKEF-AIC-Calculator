/**
 * Localization manager for the application
 */
class LocalizationManager {
    constructor() {
        this.currentLanguage = 'en';
        this.translations = {};
        this.isLoaded = false;
    }

    /**
     * Initialize the localization system
     * @param {string} defaultLanguage - Default language to use
     */
    async init(defaultLanguage = 'en') {
        if (defaultLanguage) {
            this.currentLanguage = defaultLanguage;
        } else {
            const savedLanguage = localStorage.getItem('akef-language');
            this.currentLanguage = savedLanguage || 'en';
        }

        // Load translations
        await this.loadTranslations();

        // Set HTML lang attribute
        document.documentElement.lang = this.currentLanguage;
        
        this.isLoaded = true;
        return this.currentLanguage;
    }

    /**
     * Load translation files
     */
    async loadTranslations() {
        try {
            const response = await fetch(`/db/translations/${this.currentLanguage}.json`);
            if (response.ok) {
                this.translations = await response.json();
            } else {
                console.warn(`Translation file for ${this.currentLanguage} not found, using English`);
                const fallbackResponse = await fetch('/db/translations/en.json');
                if (fallbackResponse.ok) {
                    this.translations = await fallbackResponse.json();
                }
            }
        } catch (error) {
            console.error('Error loading translations:', error);
        }
    }

    /**
     * Get a localized string
     * @param {string} key - Translation key
     * @param {string} fallback - Fallback text if key not found
     * @returns {string|Array} Localized string or array
     */
    t(key, fallback = '') {
        if (!this.isLoaded) {
            return fallback || key;
        }

        const keys = key.split('.');
        let value = this.translations;

        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                return fallback || key;
            }
        }

        if (typeof value === 'string' || Array.isArray(value)) {
            return value;
        }
        
        return fallback || key;
    }

    /**
     * Get localized item name
     * @param {Object} item - Item object
     * @returns {string} Localized item name
     */
    getItemName(item) {
        if (!item) return '';
        const nameKey = `name_${this.currentLanguage}`;
        return item[nameKey] || item.name_en || item.name || '';
    }

    /**
     * Get localized building name
     * @param {Object} building - Building object
     * @returns {string} Localized building name
     */
    getBuildingName(building) {
        if (!building) return '';
        const nameKey = `name_${this.currentLanguage}`;
        return building[nameKey] || building.name_en || building.name || '';
    }

    /**
     * Get localized building mode name
     * @param {Object} mode - Building mode object
     * @returns {string} Localized mode name
     */
    getModeName(mode) {
        if (!mode) return '';
        const nameKey = `name_${this.currentLanguage}`;
        return mode[nameKey] || mode.name_en || mode.name || '';
    }

    /**
     * Get localized item type name
     * @param {string} type - Item type
     * @returns {string} Localized type name
     */
    getItemTypeName(type) {
        if (!type) return '';
        return this.t(`types.${type}`, type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
    }

    /**
     * Change the current language
     * @param {string} language - Language code
     */
    async setLanguage(language) {
        if (language === this.currentLanguage) return;

        const baseUrl = window.location.origin;
        const defaultLanguage = 'en';

        let newUrl;
        if (language === defaultLanguage) {
            newUrl = `${baseUrl}/`;
        } else {
            newUrl = `${baseUrl}/${language}/`;
        }

        window.location.href = newUrl;
    }

    /**
     * Get available languages
     * @returns {Object} Available languages
     */
    async getAvailableLanguages() {
        try {
            const response = await fetch('/db/languages.json');
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.error('Error loading languages:', error);
        }
        
        return { en: 'English' };
    }
}

// Create a singleton instance
const localization = new LocalizationManager();

// Export for use in other modules
window.localization = localization;