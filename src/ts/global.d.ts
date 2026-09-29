import type { OverlayFlags, PaintQueryData } from "./types";

declare global {
  // setting value types keyed by "namespace.key"
  interface SettingConfig {
    "foundry-political-overlay.playerEditable": boolean;
    "foundry-political-overlay.paletteColor": string;
    "foundry-political-overlay.labelFont": string;
  }

  // document flag shapes keyed by document name then scope
  interface FlagConfig {
    Scene: {
      "foundry-political-overlay": OverlayFlags;
    };
  }

  interface RequiredModules {
    "foundry-political-overlay": true;
  }

  namespace CONFIG {
    // gm-side handlers reached through user.query()
    interface Queries {
      "foundry-political-overlay.paint": (data: PaintQueryData) => Promise<boolean>;
    }
  }
}
