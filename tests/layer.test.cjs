const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { test } = require("node:test");

// Exercise the actual layer, command history and query handler against a small
// Foundry boundary. Rendering/vision correctness still needs a live canvas.
class Container {
  children = [];
  addChild(child) { this.children.push(child); return child; }
}
class Graphics {
  drawn = [];
  clear() { this.drawn = []; return this; }
  beginFill(color) { this.color = color; return this; }
  drawPolygon(points) { this.drawn.push({ color: this.color, points }); return this; }
  endFill() { return this; }
}
class InteractionLayer extends Container {
  async _draw() {}
}

const deletion = Symbol("delete");
global.PIXI = { Container, Graphics };
global.CONFIG = { queries: {} };
global.foundry = {
  applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: (base) => base } },
  canvas: { layers: { InteractionLayer } },
  utils: { debounce: () => () => {} },
  data: { operators: { ForcedDeletion: { create: () => deletion } } },
};

const { default: PoliticalOverlayLayer } = require("../.test-build/ts/layer/PoliticalOverlayLayer.js");
const { registerQueries } = require("../.test-build/ts/overlay.js");
const scope = "foundry-political-overlay";
const red = "#ff0000";
const blue = "#0000ff";
const settle = () => new Promise(setImmediate);
const pointer = (i, j, extra = {}) => ({
  getLocalPosition: () => ({ x: j + 0.5, y: i + 0.5 }),
  nativeEvent: { preventDefault() {} },
  ...extra,
});

function outline() {
  const cells = {};
  for (let i = 1; i <= 4; i++) {
    for (let j = 1; j <= 4; j++) {
      if (i === 1 || i === 4 || j === 1 || j === 4) cells[`${i},${j}`] = red;
    }
  }
  return cells;
}

async function setup({ player = false, activeGM = true, cells = outline() } = {}) {
  const updates = [], queries = [], warnings = [], errors = [];
  const values = { paletteColor: blue, requireLight: false, playerEditable: true };
  const flags = { cells: { ...cells }, legend: { ff0000: { name: "Red territory" } }, visible: true };
  const scene = {
    id: "scene",
    flags: { [scope]: flags },
    async update(update) {
      updates.push(update);
      for (const [path, value] of Object.entries(update)) {
        assert.ok(path.startsWith(`flags.${scope}.cells.`), "fill must not write legend/configuration");
        const key = path.slice(`flags.${scope}.cells.`.length);
        if (value === deletion) delete flags.cells[key];
        else flags.cells[key] = value;
      }
    },
  };
  const user = { id: "user", isGM: !player, can: (permission) => permission === "DRAWING_CREATE" };
  global.game = {
    user,
    settings: { get: (_scope, key) => values[key] },
    scenes: { get: (id) => id === scene.id ? scene : undefined },
    users: {
      get: (id) => id === user.id ? user : undefined,
      activeGM: activeGM ? {
        isSelf: !player,
        async query(name, data) {
          queries.push({ name, data });
          return CONFIG.queries[name](data);
        },
      } : undefined,
    },
  };
  global.ui = { notifications: { warn: (key) => warnings.push(key), error: (key) => errors.push(key) } };
  const stage = new EventEmitter();
  global.canvas = {
    scene,
    stage,
    dimensions: { sceneRect: { x: 0, y: 0, width: 6, height: 6, contains: (x, y) => x >= 0 && x < 6 && y >= 0 && y < 6 } },
    visibility: { tokenVision: player, testVisibility: () => false },
    grid: {
      isSquare: true, isGridless: false, sizeX: 1, sizeY: 1,
      getOffset: ({ x, y }) => ({ i: Math.floor(y), j: Math.floor(x) }),
      getCenterPoint: ({ i, j }) => ({ x: j + 0.5, y: i + 0.5 }),
      getOffsetRange: () => [0, 0, 6, 6],
      getAdjacentOffsets: ({ i, j }) => [
        { i: i - 1, j }, { i: i + 1, j }, { i, j: j - 1 }, { i, j: j + 1 },
        { i: i - 1, j: j - 1 }, { i: i - 1, j: j + 1 }, { i: i + 1, j: j - 1 }, { i: i + 1, j: j + 1 },
      ],
      getVertices: ({ i, j }) => [{ x: j, y: i }, { x: j + 1, y: i }, { x: j + 1, y: i + 1 }, { x: j, y: i + 1 }],
    },
  };
  registerQueries();
  const layer = new PoliticalOverlayLayer();
  layer.tool = "fill";
  await layer._draw({});
  return { layer, flags, updates, queries, warnings, errors, values, stage };
}

test("a click fills the enclosed area with one update and one undo/redo step", async () => {
  const { layer, flags, updates } = await setup();
  const before = structuredClone(flags);
  layer._onClickLeft(pointer(2, 2, { shiftKey: true, ctrlKey: true }));
  await settle();
  assert.equal(updates.length, 1);
  assert.equal(Object.keys(updates[0]).length, 4);
  for (const key of ["2,2", "2,3", "3,2", "3,3"]) assert.equal(flags.cells[key], blue);
  assert.deepEqual(flags.legend, before.legend);
  const after = structuredClone(flags);
  assert.equal(layer.undo(), true);
  await settle();
  assert.deepEqual(flags, before);
  assert.equal(layer.undo(), false);
  assert.equal(layer.redo(), true);
  await settle();
  assert.deepEqual(flags, after);
  assert.equal(updates.length, 3);
});

test("open areas, same-color clicks, gridless and outside-scene clicks do not write or add history", async () => {
  const ctx = await setup();
  const before = structuredClone(ctx.flags);
  ctx.layer._onClickLeft(pointer(0, 0));
  ctx.values.paletteColor = red;
  ctx.layer._onClickLeft(pointer(1, 1));
  ctx.layer._onClickLeft(pointer(-1, 2));
  canvas.grid.isGridless = true;
  ctx.layer._onClickLeft(pointer(2, 2));
  await settle();
  assert.deepEqual(ctx.flags, before);
  assert.deepEqual(ctx.warnings, ["POLITICAL_OVERLAY.errors.fillNotEnclosed"]);
  assert.equal(ctx.updates.length, 0);
  assert.equal(ctx.layer.undo(), false);
});

test("Fill ignores left-drag modifiers while hover stays one cell and middle-drag still erases", async () => {
  const { layer, stage, updates, flags, values } = await setup();
  // Establish the brush anchor, then switch back to the bucket.
  layer.tool = "paint";
  values.paletteColor = red;
  layer._onClickLeft(pointer(1, 1));
  await settle();
  layer.tool = "fill";
  layer._activate();
  const event = pointer(1, 2, { shiftKey: true, ctrlKey: true });
  stage.emit("pointermove", event);
  assert.equal(layer.children[2].drawn.length, 1);
  layer._onDragLeftStart(event);
  layer._onDragLeftMove(event);
  layer._onDragLeftDrop(event);
  layer._onDragLeftCancel(event);
  await settle();
  assert.equal(updates.length, 0);
  stage.emit("pointerdown", pointer(1, 1, { button: 1 }));
  stage.emit("pointermove", pointer(1, 2, { button: 1 }));
  stage.emit("pointerup", pointer(1, 2, { button: 1 }));
  await settle();
  assert.equal(updates.length, 1);
  assert.equal(flags.cells["1,1"], undefined);
  assert.equal(flags.cells["1,2"], undefined);
  assert.equal(layer.undo(), true);
  await settle();
  assert.equal(flags.cells["1,1"], red);
  assert.equal(flags.cells["1,2"], red);
  layer._deactivate();
});

test("editable player fills route once through the active GM and include unexplored cells", async () => {
  const { layer, queries, updates, flags } = await setup({ player: true });
  assert.equal(layer.children[0].drawn.length, 0, "all cells start hidden by vision");
  layer._onClickLeft(pointer(2, 2));
  await settle();
  assert.equal(queries.length, 1);
  assert.equal(queries[0].name, `${scope}.paint`);
  assert.equal(Object.keys(queries[0].data.changes).length, 4);
  assert.equal(updates.length, 1);
  assert.equal(flags.cells["3,3"], blue);
  assert.equal(layer.children[0].drawn.length, 0, "filling does not bypass vision filtering");
});

test("missing GM and denied player permission restore the saved preview without history", async () => {
  for (const activeGM of [false, true]) {
    const { layer, flags, updates, errors, values } = await setup({ activeGM, player: true });
    const before = structuredClone(flags);
    if (activeGM) values.playerEditable = false;
    layer._onClickLeft(pointer(2, 2));
    await settle();
    assert.deepEqual(flags, before);
    assert.equal(updates.length, 0);
    assert.equal(layer.undo(), false);
    canvas.visibility.tokenVision = false;
    layer.refresh();
    assert.ok(layer.children[0].drawn.every((cell) => cell.color === red), "failed optimistic fill must be removed");
    assert.deepEqual(errors, activeGM ? [] : ["POLITICAL_OVERLAY.errors.noGM"]);
  }
});
