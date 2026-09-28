Political Overlay is a FoundryVTT v14 module for painting political territory onto a scene's grid cells.

Inspired by [cirrahn/foundry-polmap](https://github.com/cirrahn/foundry-polmap), which stopped development at Foundry v11.

## Usage
- Open the **Political Overlay** scene control (handshake icon)
- **Paint**: left click or drag across grid cells with the palette color
- **Erase**: pick the erase tool, or right click a cell with any tool
- **Show/Hide** toggles the overlay for everyone on the scene
- **Configure** sets GM and player opacity per scene

Works on square and hex grids. Gridless scenes aren't supported.

## Development
```sh
npm install
npm run dev   # watch build, copies dist to FOUNDRY_VTT_PATH from .env
npm run typecheck
```
