# PTR2e Alternative Global Perk Web

Foundry VTT module for Pokemon Tabletop Reunited: Evolved.

This module adds an alternative Global Perk Web presentation inspired by the large passive skill tree layout from Path of Exile 2.

## Installation

Paste this manifest URL into Foundry's **Install Module** dialog:

`https://raw.githubusercontent.com/Umbura/ptr2e-alternative-global-perk-web/main/module.json`

## Features

- Adds colored visual sectors to the PTR2e Global Perk Web.
- Draws Global Perk Web connection lines using sector colors.
- Highlights purchased perk routes.
- Highlights available and connected routes.
- Highlights skill-boost related routes with a distinct color.
- Adds mouse wheel zoom centered on the cursor.
- Smooths mouse wheel zoom by applying wheel input once per animation frame.
- Keeps wheel zoom responsive by using a tuned frame-based zoom step.
- Defers expensive Perk Web line redraws until wheel zoom input settles.
- Adds right-click drag panning.
- Preserves the system's keyboard panning behavior.
- Avoids duplicate navigation listeners when an older local system patch is already present.
- Overrides legacy wheel zoom handling when an older local system patch is detected.
- Does not alter actor data, item data, compendium data, or PTR2e system files.

## Compatibility

- Foundry VTT: 14+
- System: Pokemon Tabletop Reunited: Evolved (PTR2e)

## Notes

- The module only registers hooks when the active system id is `ptr2e`.
- CSS classes, data flags, and app-instance flags use the `ptr2e-alternative-global-perk-web` prefix to avoid collisions with system code.
- The implementation patches only the active Perk Web application instance at render time.
