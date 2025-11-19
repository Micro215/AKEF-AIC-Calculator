window.app = {
    // --- DOM ELEMENT REFERENCES ---
    dom: {
        itemSelectorBtn: null,
        selectedItemName: null,
        recipeSelectorModal: null,
        recipeSearchInput: null,
        categoryTabs: null,
        recipeGrid: null,
        amountInput: null,
        calculateBtn: null,
        resetBtn: null,
        helpBtn: null,
        helpModal: null,
        modalClose: null,
        showRawMaterials: null,
        showPower: null,
        graphContainer: null,
        graphSvg: null,
        nodesContainer: null,
        loadingMessage: null,
        noRecipeMessage: null,
        totalPowerEl: null,
    },

    // --- GLOBAL STATE VARIABLES ---
    state: {
        itemsData: {},
        buildingsData: {},
        productionGraph: null,
        selectedRecipesMap: new Map(),
        allNeedsMap: new Map(),
        currentTargetItem: null,
        isDraggingNode: null,
        isPanningCanvas: false,
        panStart: { x: 0, y: 0 },
        canvasTransform: { x: 0, y: 0, scale: 1 },
        currentCategory: 'all',
        allCategories: new Set(),
        nodePendingDeletion: null,
        nodePositions: new Map(),
        dragStart: { mouseX: 0, mouseY: 0, nodeX: 0, nodeY: 0 },
    },

    // --- CONSTANTS ---
    constants: {
        SECONDS_PER_MINUTE: 60,
    }
};