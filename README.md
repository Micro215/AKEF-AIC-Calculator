# Arknights: Endfield AIC Calculator

A web-based calculator to visualize and plan production chains in Arknights: Endfield. This tool helps you determine the exact number of machines, raw materials, and power required to achieve your desired production rate for any item.


## About

In Arknights: Endfield, managing your AIC efficiently is key to progressing. This calculator simplifies the planning process by allowing you to:

1.  Select any craftable item and set a target production rate.
2.  Automatically calculate the entire production tree, including all intermediate products and raw materials.
3.  Visualize the chain in an interactive graph, making it easy to understand complex dependencies.
4.  Get a summary of the total power consumption for your production line.

Whether you're planning a small-scale operation or a massive factory, this tool provides the clarity you need to optimize your resource management.

## Features

-   **Interactive Graph Visualization**: See your entire production chain laid out in a clean, hierarchical graph.
-   **Automated Production Chain Calculation**: Automatically calculates the required machines and materials for any desired output rate.
-   **Drag-and-Drop Interface**: Rearrange nodes by dragging them to customize the graph layout.
-   **Canvas Pan and Zoom**: Navigate large production chains with ease using mouse panning and scroll wheel zooming.
-   **Multiple Recipe Support**: For items with multiple crafting recipes, easily switch between them to find the most efficient method.
-   **Node Deletion with Dependency Resolution**: Delete a production node and automatically remove any unique ingredient chains that are no longer needed.
-   **Power Consumption Summary**: Get a real-time calculation of the total power required for your current production setup.
-   **Customizable Display Options**: Toggle the visibility of raw materials and power consumption to focus on what matters to you.
-   **Search and Filtering**: Quickly find any item in the recipe database with the search bar and category filters.
-   **Mobile Support**: You can plan your production using your mobile device.

## Usage

1.  **Select a Recipe**: Click the "Choose a recipe..." button to open the item selector. You can search by name or filter by category.
2.  **Set Target Rate**: Enter the number of items you want to produce per minute in the "Target Rate" input field.
3.  **Calculate**: Click the "Calculate" button to generate the production chain graph.
4.  **Interact with the Graph**:
    - **Pan**: Click and drag on an empty area of the graph to move around.
    - **Zoom**: Use your mouse scroll wheel to zoom in and out.
    - **Move Nodes**: Click and drag any production node to rearrange it.
5.  **Switch Recipes**: If a node has multiple recipes (indicated by "Recipe: X / Y"), click on that section to see and select alternative production methods.
6.  **Delete Nodes**: Click the `×` button on a node to remove it and its unique dependencies.
7.  **Customize View**: Use the "Display Options" checkboxes in the control panel to show or hide raw materials and power consumption details.

## Planned

-   Rewrite README and User manual

##  Credits

-   Created by **Bilzebuba**
-   *Arknights: Endfield* and all related assets are the property of **Hypergryph**. This is a fan-made tool.

## License

Distributed under the MIT License. See `LICENSE` for more information.