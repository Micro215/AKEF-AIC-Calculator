/**
 * Updates the icon in the main item selector button to reflect the currently selected target item.
 * It handles creating the icon if it doesn't exist and removing it if no item is selected.
 */
export function updateItemSelectorIcon() {
    const datas = window.datas;
    const elements = window.elements;

    // --- Cleanup: If no target item is selected, remove any existing icons ---
    if (!datas.currentTargetItem) {
        console.debug("[ui.controllers.UpdateIcons.updateItemSelectorIcon] No current target item. Removing selector icons.");
        // Remove the main item icon if it exists.
        const iconElement = elements.itemSelectorBtn.querySelector('.item-selector-icon');
        if (iconElement) iconElement.remove();

        // Remove the secondary recipe icon if it exists.
        const tabIconElement = document.getElementsByClassName("tab active")[0].querySelector('.tab-item-icon');
        if (tabIconElement) tabIconElement.remove();

        return;
    }

    // --- Edge Case: Do not show an icon if the target is a waste disposal node ---
    // This check is critical to prevent errors and maintain UI consistency.
    // to avoid a TypeError if `datas.currentTargetItem` is null.
    if (datas.currentTargetItem && datas.currentTargetItem.id && datas.currentTargetItem.id.startsWith('disposal_')) {
        console.debug("[ui.controllers.UpdateIcons.updateItemSelectorIcon] Current target is a waste disposal node. Skipping icon update.");
        return;
    }

    // --- Core Logic: Get item information and update/create the icon ---
    const itemInfo = datas.itemsData[datas.currentTargetItem.id];
    if (!itemInfo || !itemInfo.img) {
        console.warn(`[ui.controllers.UpdateIcons.updateItemSelectorIcon] Item info or image not found for item ID: ${datas.currentTargetItem.id}. Cannot update icon.`);
        return;
    }

    // Try to find an existing icon element to update it.
    let iconElement = elements.itemSelectorBtn.querySelector('.item-selector-icon');

    // If no icon exists, create a new one.
    if (!iconElement) {
        console.debug("[ui.controllers.UpdateIcons.updateItemSelectorIcon] No existing icon found. Creating a new one.");
        iconElement = document.createElement('img');
        iconElement.className = 'item-selector-icon';

        // Find the list icon within the button to use as an insertion point.
        // This ensures the new item icon appears before the list icon.
        const listIcon = elements.itemSelectorBtn.querySelector('i.fas.fa-list');
        if (listIcon) {
            listIcon.parentNode.insertBefore(iconElement, listIcon);
        } else {
            // Fallback: If the list icon isn't found, just prepend the icon to the button.
            elements.itemSelectorBtn.prepend(iconElement);
        }
    }

    // Update the icon's attributes with the current item's data.
    iconElement.src = `${window.projectBaseUrl}images/${itemInfo.img}`;
    iconElement.alt = window.localization.getItemName(itemInfo);
    iconElement.title = window.localization.getItemName(itemInfo);
    console.log(`[ui.controllers.UpdateIcons.updateItemSelectorIcon] Icon updated for item: ${window.localization.getItemName(itemInfo)} (${datas.currentTargetItem.id})`);
}