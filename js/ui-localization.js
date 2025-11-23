/**
 * Update UI elements with localized strings
 */
function updateUIWithLocalization() {
    // Update page title
    document.title = `${window.localization.t('app.title')} | ${window.localization.t('app.subtitle')}`;

    // Update meta tags
    document.querySelector('meta[name="description"]').content =
        window.localization.t('app.meta_description');

    // Update headers and labels
    document.querySelector('.app-header h1').innerHTML =
        `<i class="fas fa-sitemap" aria-hidden="true"></i> ${window.localization.t('app.title')}`;

    document.querySelector('.panel-section:nth-child(1) h2').textContent =
        window.localization.t('labels.production_settings');

    document.querySelector('.panel-section:nth-child(2) h2').textContent =
        window.localization.t('labels.display_options');

    document.querySelector('.panel-section:nth-child(3) h2').textContent =
        window.localization.t('labels.summary');

    // Update buttons
    document.getElementById('calculate-btn').innerHTML =
        `<i class="fas fa-calculator" aria-hidden="true"></i> ${window.localization.t('buttons.calculate')}`;

    // Update labels
    document.querySelector('label[for="item-selector-btn"]').textContent =
        window.localization.t('labels.select_recipe');

    document.querySelector('label[for="amount-input"]').textContent =
        window.localization.t('labels.target_rate');

    document.querySelector('label[for="show-raw-materials"] span.checkmark').nextSibling.textContent =
        ` ${window.localization.t('labels.show_raw_materials')}`;

    document.querySelector('label[for="show-power"] span.checkmark').nextSibling.textContent =
        ` ${window.localization.t('labels.show_power')}`;

    document.querySelector('#rate-unit').textContent =
        ` ${window.localization.t('app.per_minute')}`;

    document.querySelector('.stat-label').textContent =
        window.localization.t('app.total_power');

    // Update help modal
    document.querySelector('#help-title').textContent =
        window.localization.t('help.title');

    const helpSteps = document.querySelector('#help-modal ol');
    helpSteps.innerHTML = '';
    window.localization.t('help.steps').forEach(step => {
        const li = document.createElement('li');
        li.textContent = step;
        helpSteps.appendChild(li);
    });

    document.querySelector('#help-modal p').innerHTML =
        `${window.localization.t('help.note')}`;

    document.querySelector('#help-modal .modal-footer p').textContent =
        window.localization.t('help.created_by');

    // Update recipe selector modal
    document.querySelector('#recipe-selector-title').textContent =
        window.localization.t('labels.select_recipe');

    document.querySelector('#recipe-search-input').placeholder =
        window.localization.t('labels.select_recipe');

    // Update delete confirmation modal
    document.querySelector('#delete-title').textContent =
        window.localization.t('buttons.confirm_delete');

    document.querySelector('#delete-confirmation-modal .modal-body p').innerHTML =
        window.localization.t('delete_confirmation.message');

    document.querySelector('#confirm-delete-btn').textContent =
        window.localization.t('buttons.delete');

    document.querySelector('#cancel-delete-btn').textContent =
        window.localization.t('buttons.cancel');

    // Update loading and error messages
    document.querySelector('#loading-message').innerHTML =
        `<div class="spinner" aria-hidden="true"></div> ${window.localization.t('app.calculating')}`;

    document.querySelector('#no-recipe-message p').textContent =
        window.localization.t('app.no_recipe_message');

    // Update default recipes button
    const defaultRecipesBtn = document.getElementById('default-recipes-btn');
    if (defaultRecipesBtn) {
        defaultRecipesBtn.innerHTML = `<i class="fas fa-cog"></i> <span>${window.localization.t('buttons.default_recipes')}</span>`;
    }

    // Set text for the "Physics Simulation" checkbox
    const physicsSimulationCheckmark = document.querySelector('label[for="physics-simulation"] span.checkmark');
    if (physicsSimulationCheckmark && physicsSimulationCheckmark.nextSibling) {
        physicsSimulationCheckmark.nextSibling.textContent = ` ${window.localization.t('app.physics_simulation')}`;
    }

    // Show Alternative Recipes checkbox
    const showAlternativeRecipesLabel = document.querySelector('label[for="show-alternative-recipes"]');
    if (showAlternativeRecipesLabel) {
        showAlternativeRecipesLabel.insertAdjacentHTML('beforeend', window.localization.t('app.show_alternative_recipes'));
    }

    // Update production summary button
    const summaryBtnText = document.getElementById('production-summary-btn-text');
    if (summaryBtnText) {
        summaryBtnText.textContent = window.localization.t('buttons.production_summary');
    }

    // Update production summary modal
    const summaryTitle = document.getElementById('production-summary-title');
    if (summaryTitle) {
        summaryTitle.textContent = window.localization.t('app.production_summary');
    }
}

/**
 * Setup language selector with available languages
 */
async function setupLanguageSelector() {
    const app = window.productionApp;
    const languages = await window.localization.getAvailableLanguages();

    // Clear existing options
    app.languageSelect.innerHTML = '';

    // Add language options
    Object.entries(languages).forEach(([code, name]) => {
        const option = document.createElement('option');
        option.value = code;
        option.textContent = name;
        if (code === window.localization.currentLanguage) {
            option.selected = true;
        }
        app.languageSelect.appendChild(option);
    });

    // Add change event listener
    app.languageSelect.addEventListener('change', async (e) => {
        const newLanguage = e.target.value;
        await window.localization.setLanguage(newLanguage);
    });
}