import { findRecipesForItem } from "../data/RecipeFinder.js";

/**
 * Builds a system of linear equations representing the production chain.
 * Each equation is of the form: (sum of inputs) - (sum of outputs) = 0.
 * This system is then solved to find the required production rates for all items.
 * @param {Set<string>} itemIds - A Set of all unique item IDs in the production chain.
 * @param {string} targetItemId - The ID of the final product item.
 * @param {number} targetRate - The desired production rate for the target item (items per minute).
 * @returns {Object} An object containing the matrix, vector, and a map from item ID to matrix index.
 */
export function buildLinearSystem(itemIds, targetItemId, targetRate) {
    console.log(`[utils.MathUtils.buildLinearSystem] Building system for target: ${targetItemId} at ${targetRate}/min.`);
    console.debug(`[utils.MathUtils.buildLinearSystem] All items in system:`, Array.from(itemIds));

    // Create a map to easily get the matrix index for any given item ID.
    const itemIndexMap = new Map();
    const indexItemMap = new Map();
    let index = 0;
    for (const itemId of itemIds) {
        itemIndexMap.set(itemId, index);
        indexItemMap.set(index, itemId);
        index++;
    }
    console.debug("[utils.MathUtils.buildLinearSystem] Item to index map created:", itemIndexMap);

    // Initialize the matrix (A) and vector (b) for the system Ax = b.
    // The matrix will be n x n, where n is the number of items.
    const n = itemIds.size;
    const matrix = Array.from({ length: n }, () => Array(n).fill(0));
    const vector = new Array(n).fill(0);

    // Set the external demand for the target item in the vector (b).
    // This is the only non-zero value in the vector initially.
    const targetIndex = itemIndexMap.get(targetItemId);
    vector[targetIndex] = targetRate;

    // Build the matrix (A) by iterating through each item's recipe.
    for (let i = 0; i < n; i++) {
        const itemId = indexItemMap.get(i);
        matrix[i][i] = 1; // The coefficient for the item itself is 1 (x_i on the left side).

        // Find the recipes for the current item.
        const recipes = findRecipesForItem(itemId);
        if (recipes) {
            // Get the user's selected recipe index, defaulting to 0 if not set.
            const recipe = recipes[window.datas.selectedRecipesMap.get(itemId) ?? 0];
            if (recipe && recipe.ingredients) {
                // For each ingredient in the recipe, update the matrix.
                recipe.ingredients.forEach(ingredient => {
                    // Skip if the ingredient is not part of our system (e.g., a waste item not being tracked).
                    if (!itemIndexMap.has(ingredient.item_id)) return;

                    // Get the matrix index for the ingredient.
                    const ingredientIndex = itemIndexMap.get(ingredient.item_id);

                    // Find the product from the recipe that corresponds to the current item (x_i).
                    // This is necessary to calculate the production/consumption ratio.
                    const product = recipe.products.find(p => p.item_id === itemId) || recipe.products[0];

                    // The coefficient is (ingredient_amount / product_amount).
                    // This represents how much of the ingredient is consumed per unit of the item produced.
                    const coefficient = ingredient.amount / product.amount;
                    matrix[ingredientIndex][i] -= coefficient;
                });
            }
        }
    }

    console.log("[utils.MathUtils.buildLinearSystem] Linear system built.");
    return { matrix, vector, itemIndexMap };
}

/**
 * Solves a system of linear equations (Ax = b) using Gaussian elimination.
 * This is a standard algorithm for solving systems of linear equations.
 * @param {number[][]} A - The coefficient matrix.
 * @param {number[]} b - The constant vector.
 * @returns {number[] | null} The solution vector (x), or null if the system is singular.
 */
export function solveLinearSystem(A, b) {
    console.log("[utils.MathUtils.solveLinearSystem] Solving linear system...");
    const n = b.length;
    // Create an augmented matrix [A|b] for easier row operations.
    const aug = A.map((row, i) => [...row, b[i]]);

    // Perform forward elimination to get the matrix into row echelon form.
    for (let col = 0; col < n; col++) {
        // Find the pivot row: the row with the largest absolute value in the current column.
        let pivotRow = col;
        for (let r = col + 1; r < n; r++) {
            if (Math.abs(aug[r][col]) > Math.abs(aug[pivotRow][col])) {
                pivotRow = r;
            }
        }

        // Swap the current row with the pivot row to bring the largest value to the diagonal.
        [aug[col], aug[pivotRow]] = [aug[pivotRow], aug[col]];

        // If the pivot element is zero, the system is singular (no unique solution).
        if (Math.abs(aug[col][col]) < 1e-9) {
            console.error("[utils.MathUtils.solveLinearSystem] System is singular or has infinite solutions.");
            return null;
        }

        // Eliminate the current variable from all rows below the pivot.
        for (let r = 0; r < n; r++) {
            if (r !== col) {
                // Calculate the factor needed to make the element in the current row zero.
                const factor = aug[r][col] / aug[col][col];
                // Apply this factor to all elements in the row.
                for (let c = col; c <= n; c++) {
                    aug[r][c] -= factor * aug[col][c];
                }
            }
        }
    }

    // Perform back substitution to find the solution for each variable.
    // Since the matrix is in row echelon form, we can solve from the bottom up.
    const solution = new Array(n);
    for (let i = 0; i < n; i++) {
        // The solution for x_i is the last element of the row (augmented part) divided by the diagonal element.
        solution[i] = aug[i][n] / aug[i][i];
    }

    console.log("[utils.MathUtils.solveLinearSystem] System solved. Solution:", solution);
    return solution;
}