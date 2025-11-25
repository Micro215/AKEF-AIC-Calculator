/**
 * A simple service to provide a safe interface for localStorage.
 * It handles JSON serialization/deserialization and includes error handling for
 * cases where localStorage might be unavailable or full.
 */
export const StorageService = {
    /**
     * Saves a value to localStorage under a specified key.
     * The value is serialized to a JSON string before saving.
     * @param {string} key - The key under which to store the value.
     * @param {*} value - The value to store. Can be any JSON-serializable value.
     */
    set(key, value) {
        try {
            // Attempt to save the value by first converting it to a JSON string.
            localStorage.setItem(key, JSON.stringify(value));
            console.debug(`[services.StorageService] Successfully saved data for key: "${key}".`);
        } catch (error) {
            // Catch potential errors, such as localStorage being full or disabled.
            console.error(`[services.StorageService] Cannot save data for key "${key}":`, error);
        }
    },

    /**
     * Retrieves a value from localStorage by its key.
     * The stored JSON string is parsed back into a JavaScript object or value.
     * @param {string} key - The key of the value to retrieve.
     * @param {*} [defaultValue=null] - The value to return if the key is not found or an error occurs.
     * @returns {*|null} The retrieved value, or the provided default value.
     */
    get(key, defaultValue = null) {
        try {
            // Attempt to get the item from localStorage.
            const item = localStorage.getItem(key);
            if (item) {
                // If the item exists, parse it from JSON string back to its original form.
                const parsedValue = JSON.parse(item);
                console.debug(`[services.StorageService] Successfully retrieved data for key: "${key}".`);
                return parsedValue;
            }
            // If the item does not exist, return the default value.
            console.debug(`[services.StorageService] No data found for key: "${key}". Returning default value.`);
            return defaultValue;
        } catch (error) {
            // Catch potential errors, such as corrupted data that cannot be parsed.
            console.error(`[services.StorageService] Cannot read data for key "${key}":`, error);
            return defaultValue;
        }
    }
};