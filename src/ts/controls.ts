import OverlayConfig from "./apps/OverlayConfig";
import PaletteControls from "./apps/PaletteControls";
import { CONSTANTS } from "./constants";
import type PoliticalOverlayLayer from "./layer/PoliticalOverlayLayer";
import { canEdit, getFlags, resetCells, setVisible } from "./overlay";
import type { OverlayTool } from "./types";
import { getGame } from "./utils";

const getLayer = () => (canvas as any)?.[CONSTANTS.LAYER_NAME] as PoliticalOverlayLayer | undefined;

// v13+ passes controls as a record keyed by control name
export function registerControls(): void {
  Hooks.on("getSceneControlButtons", (controls) => {
    const user = getGame().user;
    const isGM = !!user?.isGM;

    const selectTool = (tool: OverlayTool) => (_event: Event, active: boolean) => {
      const layer = getLayer();
      if (active && layer) layer.tool = tool;
    };

    (controls as any)[CONSTANTS.LAYER_NAME] = {
      name: CONSTANTS.LAYER_NAME,
      order: Object.keys(controls).length,
      title: "POLITICAL_OVERLAY.control",
      icon: "fa-solid fa-handshake",
      layer: CONSTANTS.LAYER_NAME,
      visible: canEdit(user),
      activeTool: "paint",
      onChange: (_event: Event, active: boolean) => (active ? PaletteControls.open() : PaletteControls.close()),
      tools: {
        paint: {
          name: "paint",
          order: 0,
          title: "POLITICAL_OVERLAY.tools.paint",
          icon: "fa-solid fa-paintbrush",
          onChange: selectTool("paint"),
        },
        erase: {
          name: "erase",
          order: 1,
          title: "POLITICAL_OVERLAY.tools.erase",
          icon: "fa-solid fa-eraser",
          onChange: selectTool("erase"),
        },
        toggle: {
          name: "toggle",
          order: 2,
          title: "POLITICAL_OVERLAY.tools.toggle",
          icon: "fa-solid fa-eye",
          visible: isGM,
          toggle: true,
          active: !!getFlags(canvas?.scene).visible,
          onChange: (_event: Event, active: boolean) => {
            if (canvas?.scene) void setVisible(canvas.scene, active);
          },
        },
        config: {
          name: "config",
          order: 3,
          title: "POLITICAL_OVERLAY.tools.config",
          icon: "fa-solid fa-gear",
          visible: isGM,
          button: true,
          onChange: () => {
            if (canvas?.scene) void new OverlayConfig(canvas.scene).render({ force: true });
          },
        },
        reset: {
          name: "reset",
          order: 4,
          title: "POLITICAL_OVERLAY.tools.reset",
          icon: "fa-solid fa-trash",
          visible: isGM,
          button: true,
          onChange: async () => {
            const scene = canvas?.scene;
            if (!scene) return;
            const ok = await foundry.applications.api.DialogV2.confirm({
              window: { title: "POLITICAL_OVERLAY.tools.reset" },
              content: `<p>${getGame().i18n.localize("POLITICAL_OVERLAY.reset.content")}</p>`,
            });
            if (ok) await resetCells(scene);
          },
        },
      },
    };
  });

  // flag changes on the viewed scene redraw the layer
  Hooks.on("updateScene", (scene, changes) => {
    if (scene.id !== canvas?.scene?.id) return;
    if (!foundry.utils.hasProperty(changes, `flags.${CONSTANTS.MODULE_ID}`)) return;
    getLayer()?.refresh();
  });
}
