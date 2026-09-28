import CONSTANTS from "./constants";

export class GameError extends Error {
  constructor(message: string) {
    super(`${CONSTANTS.MODULE_ID} | ${message}`);
    this.name = "GameError";
  }
}

// game is only typed as ready after init
export function getGame(): Game {
  if (!game) throw new GameError("game instance not available");
  return game as Game;
}

export function isGM(): boolean {
  return getGame().user?.isGM ?? false;
}

// activegm is the one connected gm that handles gm-only work
export function isActiveGM(): boolean {
  const g = getGame();
  return g.users?.activeGM?.id === g.user?.id;
}
