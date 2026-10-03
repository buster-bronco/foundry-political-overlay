Political Overlay is a FoundryVTT v14 module for painting political territory onto a scene's grid cells.

Inspired by [cirrahn/foundry-polmap](https://github.com/cirrahn/foundry-polmap), which stopped development at Foundry v11.

## Usage
- Open the **Political Overlay** scene control (handshake icon)
- **Paint**: left click or drag across grid cells with the palette color
- **Erase**: pick the erase tool, or right click a cell with any tool
- **Palette**: lets you pick a color
- **Territory Legend**: lets you assign names to territory colors
- **Show/Hide** toggles the overlay for everyone on the scene
- **Configure** sets GM and player opacity per scene

Works on square and hex grids. Gridless scenes aren't supported.

## Labels

Political Overlay lables are labels that display on colors assigned a name in the Legend view.

## Setting
- Label Font: What font is used for political faction labels
- Require Lights: Require Lights to see political map updates in a region. Turning it off shows updates when region is dark

## Development
```sh
npm install
npm run dev   # watch build, copies dist to FOUNDRY_VTT_PATH from .env
npm run typecheck
```
