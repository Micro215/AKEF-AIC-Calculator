import { StorageService } from "../services/StorageService.js";
import { CONSTANTS } from "./Constants.js";

/**
 * Saves the current state of display settings checkboxes to localStorage.
 * This function reads from global `window.elements` and `window.datas`,
 * serializes the settings, and triggers a graph re-render if it exists.
 */
export function saveDisplaySettings() {
    // Access global state holders for DOM elements and application data
    const datas = window.datas;
    const elements = window.elements;

    // Create a settings object by capturing the current 'checked' state of all relevant checkboxes
    const settings = {
        showRawMaterials: elements.showRawMaterials.checked,
        showPower: elements.showPower.checked,
        showAlternativeRecipes: elements.showAlternativeRecipes.checked,
        physicsSimulation: elements.physicsSimulation.checked
    };

    // Serialize the settings object and save it to localStorage using a dedicated storage key
    StorageService.set(CONSTANTS.STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    console.debug("[config.DisplaySettings.SaveDisplaySettings] Display settings saved:", settings);

    // If a production graph instance exists, re-render it to reflect the new settings
    if (datas.productionGraph) {
        datas.productionGraph.render();
    }
}

/**
 * Loads display settings from localStorage and applies them to the UI.
 * This function attempts to retrieve saved settings and update the state of
 * checkboxes in the global `window.elements`. Includes error handling for storage access.
 */
export function loadDisplaySettings() {
    const elements = window.elements;

    try {
        // Attempt to retrieve the saved settings string from localStorage
        const savedSettings = StorageService.get(CONSTANTS.STORAGE_KEYS.SETTINGS);
        if (savedSettings) {
            const parsedSettings = JSON.parse(savedSettings);
            // Apply saved settings to the checkboxes
            if (parsedSettings.showRawMaterials !== undefined) elements.showRawMaterials.checked = parsedSettings.showRawMaterials;
            if (parsedSettings.showPower !== undefined) elements.showPower.checked = parsedSettings.showPower;
            if (parsedSettings.showAlternativeRecipes !== undefined) elements.showAlternativeRecipes.checked = parsedSettings.showAlternativeRecipes;
            if (parsedSettings.physicsSimulation !== undefined) elements.physicsSimulation.checked = parsedSettings.physicsSimulation;

            console.debug("[config.DisplaySettings.loadDisplaySettings] Display settings loaded and applied:", parsedSettings);
        } else {
            console.warn("[config.DisplaySettings.loadDisplaySettings] No saved display settings found in localStorage.");
        }
    } catch (error) {
        console.error('[config.DisplaySettings.loadDisplaySettings] Error loading display settings:', error);
    }
}

/**
 * Applies the current UI settings to the application's view.
 * This function reads the state of checkboxes from global `window.elements` and
 * directly manipulates the DOM or calls methods on `window.datas.productionGraph`
 * to reflect the current settings, such as toggling visibility or starting/stopping a simulation.
 */
export function applyDisplaySettings() {
    const elements = window.elements;
    const datas = window.datas;

    // Toggle the 'hide-alternative-recipes' class on the graph container based on the checkbox state.
    // This controls the visibility of alternative recipes in the UI.
    if (elements.graphContainer) {
        elements.graphContainer.classList.toggle('hide-alternative-recipes', !elements.showAlternativeRecipes.checked);
        console.debug(`[config.DisplaySettings.applyDisplaySettings] Toggled alternative recipes visibility. Now hidden: ${!elements.showAlternativeRecipes.checked}`);
    }

    // Control the physics simulation on the production graph based on its checkbox state.
    if (datas.productionGraph) {
        if (elements.physicsSimulation.checked) {
            datas.productionGraph.startSimulation();
            console.debug("[config.DisplaySettings.applyDisplaySettings] Physics simulation started.");
        } else {
            datas.productionGraph.stopSimulation();
            console.debug("[config.DisplaySettings.applyDisplaySettings] Physics simulation stopped.");
        }
    }

    // Note: The effects of "Show Raw Materials" and "Show Power" settings are handled
    // by a full recalculation of the production graph, not by this direct function.
    console.log("[config.DisplaySettings.applyDisplaySettings] executed.");
}