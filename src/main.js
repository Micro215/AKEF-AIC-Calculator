// =============================================================================
// IMPORTS
// =============================================================================

// --- Configuration ---
import { getProjectBaseUrl } from "./config/Constants.js";
import { loadDisplaySettings } from "./config/DisplaySettings.js";

// --- Global State/Data Holders ---
import { AppState } from "./global/AppStates.js";
import { AppData } from "./global/Data.js";
import { ElementReferences } from "./global/ElementReferences.js";
import { Functions } from "./global/Functions.js";

// --- Managers ---
import { LocalizationManager, getInitialLanguageFromURL } from "./managers/LocalizationManager.js";
import { TabsManager } from "./managers/TabsManager.js";
import { DefaultRecipeManager } from "./managers/DefaultRecipeManger.js";
import { WasteManager } from "./managers/WasteManager.js";
import { ProductionSummaryManager } from "./managers/ProductionSummaryManager.js";

// --- UI Views ---
import { setupLanguageSelector } from "./ui/views/LanguageSelector.js";
import { updateUIWithLocalization } from "./ui/views/UpdateUIWithLocalization.js";

// --- Event Handling ---
import { setupEventListeners } from "./events.js";


// =============================================================================
// ASYNCHRONOUS INITIALIZATION FUNCTIONS
// =============================================================================

/**
 * Initializes all global variables and state holders.
 * This is the first step in the initialization chain.
 */
async function globalVariablesInitialize() {
    console.info("Initializing global variables and state holders...");
    // Create instances of global state/data management classes.
    window.states = (new AppState()).get();
    window.datas = (new AppData()).get();
    window.elements = (new ElementReferences()).get();
    window.functions = (new Functions()).get();
    console.info("Global states, data, elements, and functions initialized.");
}

/**
 * Initializes core configuration and project-wide settings.
 * This includes determining the project's base URL and loading display settings.
 */
async function configInitialize() {
    console.info("Initializing configuration...");
    // The base URL is crucial for fetching assets and data.
    window.projectBaseUrl = getProjectBaseUrl();
    console.info(`Project Base URL set to: ${window.projectBaseUrl}`);

    // Load user's saved display preferences (e.g., show raw materials, show power).
    loadDisplaySettings();
    console.info("Display settings loaded.");
}

/**
 * Asynchronously loads all necessary application data (items, buildings, transport).
 * This is a critical step; the application cannot function without this data.
 */
async function loadData() {
    console.info("Loading application data...");
    const datas = window.datas;

    try {
        // Fetch all three core data files in parallel for efficiency.
        const [itemsResponse, buildingsResponse, transportResponse] = await Promise.all([
            fetch(`${window.projectBaseUrl}db/items.json`),
            fetch(`${window.projectBaseUrl}db/buildings.json`),
            fetch(`${window.projectBaseUrl}db/transport.json`)
        ]);

        // Validate that all network requests were successful.
        if (!itemsResponse.ok || !buildingsResponse.ok || !transportResponse.ok) {
            throw new Error('Failed to load one or more data files.');
        }

        // Parse the JSON data and store it in the global data object.
        datas.itemsData = await itemsResponse.json();
        datas.buildingsData = await buildingsResponse.json();
        datas.transportData = await transportResponse.json();

        console.info("Items data loaded and stored.");
        console.info("Buildings data loaded and stored.");
        console.info("Transport data loaded and stored.");
    } catch (error) {
        console.error("Failed to load application data:", error);
        // Re-throw the error to be caught by the main initialization function.
        throw error;
    }
}

/**
 * Initializes all manager classes that handle complex application logic.
 * This includes localization, tabs, default recipes, waste management, and summaries.
 */
async function managersInitialize() {
    console.info("Initializing managers...");

    // Initialize the localization manager to handle all text and translations.
    window.localization = new LocalizationManager();
    // Determine the initial language from the URL or default to English.
    await window.localization.init(await getInitialLanguageFromURL());
    console.info("Localization manager initialized.");

    // Initialize the tabs manager for handling multiple production chains.
    window.tabs = new TabsManager();
    // The init method will load saved tabs and set up the UI.
    await window.tabs.init();
    console.info("Tabs manager initialized.");

    // The default recipe manager handles user's preferred production methods.
    window.defaultRecipeManager = new DefaultRecipeManager();
    console.info("Default recipe manager created.");

    // The waste manager handles byproducts and their disposal.
    window.wasteManager = new WasteManager();
    // Load the list of items that are considered waste.
    await window.wasteManager.loadWasteItems();
    console.info("Waste manager initialized.");

    // The production summary manager handles the final report view.
    window.productionSummaryManager = new ProductionSummaryManager();
    console.info("Production summary manager created.");
}

/**
 * Initializes all UI-related views and controllers.
 * This function sets up UI elements that are not part of a manager.
 */
async function initializeViews() {
    console.info("Initializing UI views...");
    // Set up the language selector dropdown with available languages.
    await setupLanguageSelector();
    console.info("Language selector view initialized.");
}

// =============================================================================
// MAIN INITIALIZATION ORCHESTRATOR
// =============================================================================

/**
 * The primary initialization function that calls all other initialization functions in the correct order.
 * This ensures that the application is set up in a logical sequence.
 */
async function initializeModules() {
    console.info("=== Starting Module Initialization ===");
    await globalVariablesInitialize();
    await configInitialize();
    await loadData();
    await managersInitialize();
    await initializeViews();
    console.info("=== Module Initialization Complete ===");
}

// =============================================================================
// APPLICATION STARTUP
// =============================================================================

/**
 * The main entry point for the application.
 * This function runs once the DOM is fully loaded and parsed.
 */
document.addEventListener('DOMContentLoaded', async () => {
    console.log("DOM fully loaded. Starting application initialization.");

    try {
        // Execute the full initialization sequence.
        await initializeModules();

        // Disable primary controls during initialization to prevent user interaction.
        window.elements.itemSelectorBtn.disabled = true;
        window.elements.calculateBtn.disabled = true;
        // Show a localized loading message to the user.
        window.elements.selectedItemName.textContent = window.localization.t('app.loading');

        updateUIWithLocalization();

        // Once all modules are initialized, set up event listeners.
        setupEventListeners();

        // Re-enable controls now that everything is ready.
        window.elements.itemSelectorBtn.disabled = false;
        window.elements.calculateBtn.disabled = false;
        // Set the default text for the item selector.
        window.elements.selectedItemName.textContent = window.localization.t('app.choose_recipe');

        console.info("Application initialization successful.");
    } catch (error) {
        // If any part of the initialization fails, log the error and show a message to the user.
        console.error("Application initialization failed:", error);
        window.elements.selectedItemName.textContent = window.localization.t('app.error');
        // Keep controls disabled to prevent further interaction in a broken state.
        window.elements.itemSelectorBtn.disabled = true;
    }
});