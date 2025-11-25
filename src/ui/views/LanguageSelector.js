/**
 * Asynchronously sets up the custom language selector in the UI.
 * It fetches the list of available languages, creates a custom dropdown,
 * and adds event listeners to handle language changes.
 */
export async function setupLanguageSelector() {
    console.log("[ui.views.LanguageSelector.setupLanguageSelector] Initializing custom language selector.");
    const selectorContainer = window.elements.languageSelector;

    if (!selectorContainer) {
        console.error("[ui.views.LanguageSelector.setupLanguageSelector] Language selector container not found!");
        return;
    }

    // Fetch the list of available languages from the localization manager.
    const languages = await window.localization.getAvailableLanguages();
    console.log("[ui.views.LanguageSelector.setupLanguageSelector] Available languages fetched:", languages);

    // --- Create the HTML structure for the custom dropdown ---
    // Используем <i> для иконок флагов
    selectorContainer.innerHTML = `
        <button class="language-button" type="button" aria-haspopup="listbox" aria-expanded="false">
            <i class="language-flag"></i>
            <span class="language-name"></span>
            <i class="fas fa-chevron-down language-arrow"></i>
        </button>
        <ul class="language-options" role="listbox">
            <!-- Options will be populated here -->
        </ul>
    `;

    const button = selectorContainer.querySelector('.language-button');
    const optionsList = selectorContainer.querySelector('.language-options');

    // --- Populate the dropdown with options ---
    Object.entries(languages).forEach(([code, data]) => {
        const option = document.createElement('li');
        option.className = 'language-option';
        option.setAttribute('role', 'option');
        option.setAttribute('data-lang-code', code);
        // Вставляем <i> с классом иконки из JSON
        option.innerHTML = `
            <i class="language-option-flag ${data.icon}"></i>
            <span class="language-option-name">${data.name}</span>
        `;
        optionsList.appendChild(option);
    });

    // --- Helper function to update the button's display ---
    const updateButtonDisplay = (langCode) => {
        const langData = languages[langCode];
        if (langData) {
            // Обновляем класс у иконки в основной кнопке
            const flagIcon = button.querySelector('.language-flag');
            flagIcon.className = `language-flag ${langData.icon}`;
            button.querySelector('.language-name').textContent = langData.name;
        }
    };

    // --- Set the initial state ---
    updateButtonDisplay(window.localization.currentLanguage);
    selectorContainer.querySelector(`[data-lang-code="${window.localization.currentLanguage}"]`).classList.add('is-active');

    // --- Add event listeners ---

    // Toggle dropdown visibility
    button.addEventListener('click', () => {
        const isExpanded = button.getAttribute('aria-expanded') === 'true';
        button.setAttribute('aria-expanded', !isExpanded);
        selectorContainer.classList.toggle('is-open');
    });

    // Handle language selection
    optionsList.addEventListener('click', async (e) => {
        const option = e.target.closest('.language-option');
        if (option) {
            const newLanguage = option.getAttribute('data-lang-code');
            console.log(`[ui.views.LanguageSelector.setupLanguageSelector] Language changed to: ${newLanguage}`);

            // Update active state
            selectorContainer.querySelector('.language-option.is-active')?.classList.remove('is-active');
            option.classList.add('is-active');

            // Update button display
            updateButtonDisplay(newLanguage);

            // Close dropdown
            button.setAttribute('aria-expanded', 'false');
            selectorContainer.classList.remove('is-open');

            // Asynchronously set the new language
            await window.localization.setLanguage(newLanguage);
        }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!selectorContainer.contains(e.target)) {
            button.setAttribute('aria-expanded', 'false');
            selectorContainer.classList.remove('is-open');
        }
    });
}