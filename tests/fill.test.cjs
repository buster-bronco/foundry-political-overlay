const assert = require("node:assert/strict");
const { test } = require("node:test");
const { floodFill } = require("../.test-build/ts/fill.js");

const key = ({ i, j }) => `${i},${j}`;
const bounds = { x: 0, y: 0, width: 7, height: 7 };
const target = "#00a368";

function squareGrid() {
  return {
    isSquare: true,
    // Include diagonals as Foundry may; fill must enforce edge connectivity.
    getAdjacentOffsets({ i, j }) {
      const offsets = [];
      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          if (di || dj) offsets.push({ i: i + di, j: j + dj });
        }
      }
      return offsets;
    },
    getOffsetRange({ x, y, width, height }) {
      return [Math.floor(y), Math.floor(x), Math.ceil(y + height), Math.ceil(x + width)];
    },
    getVertices({ i, j }) {
      return [{ x: j, y: i }, { x: j + 1, y: i }, { x: j + 1, y: i + 1 }, { x: j, y: i + 1 }];
    },
  };
}

function squareRing() {
  const cells = {};
  for (let i = 1; i <= 5; i++) {
    for (let j = 1; j <= 5; j++) {
      if (i === 1 || i === 5 || j === 1 || j === 5) cells[`${i},${j}`] = (i + j) % 2 ? "#111111" : "#eeeeee";
    }
  }
  return cells;
}

function fill(cells, seed, grid = squareGrid(), rect = bounds, color = target) {
  const before = structuredClone(cells);
  const result = floodFill(cells, seed, color, grid, rect);
  assert.deepEqual(cells, before, "fill must leave the source snapshot unchanged");
  return result;
}

test("fills a closed empty region bounded by mixed paint colors", () => {
  const result = fill(squareRing(), { i: 3, j: 3 });
  assert.equal(result.status, "filled");
  assert.equal(Object.keys(result.changes).length, 9);
  assert.ok(Object.values(result.changes).every((color) => color === target));
});

test("missing and explicitly erased cells form the same empty region", () => {
  const cells = squareRing();
  cells["2,2"] = null;
  const result = fill(cells, { i: 2, j: 2 });
  assert.equal(result.status, "filled");
  assert.equal(Object.keys(result.changes).length, 9);
});

test("a painted island remains unchanged inside a filled enclosure", () => {
  const cells = squareRing();
  cells["3,3"] = "#112233";
  const result = fill(cells, { i: 2, j: 2 });
  assert.equal(result.status, "filled");
  assert.equal(Object.keys(result.changes).length, 8);
  assert.ok(!("3,3" in result.changes));
});

test("an empty region with a one-cell opening is rejected without partial changes", () => {
  const cells = squareRing();
  delete cells["1,3"];
  assert.deepEqual(fill(cells, { i: 3, j: 3 }), { status: "open" });
});

test("the playable rectangle alone cannot enclose empty cells", () => {
  assert.deepEqual(fill({}, { i: 3, j: 3 }), { status: "open" });
});

test("paint can close an enclosure along the scene edge", () => {
  const cells = {};
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (i !== 1 || j !== 1) cells[`${i},${j}`] = "#123456";
    }
  }
  assert.deepEqual(fill(cells, { i: 1, j: 1 }, squareGrid(), { x: 0, y: 0, width: 3, height: 3 }), {
    status: "filled", changes: { "1,1": target },
  });
});

test("square corner contact does not leak through a painted enclosure", () => {
  const cells = { "1,2": "#111111", "2,1": "#222222", "2,3": "#333333", "3,2": "#444444" };
  assert.deepEqual(fill(cells, { i: 2, j: 2 }), { status: "filled", changes: { "2,2": target } });
});

test("recolors only the edge-connected source color, normalizing hash and case", () => {
  const cells = { "0,0": "#AbCdEf", "0,1": "abcdef", "1,1": "#ABCDEF", "2,2": "#abcdef", "5,5": "#abcdef" };
  assert.deepEqual(fill(cells, { i: 0, j: 0 }), {
    status: "filled", changes: { "0,0": target, "0,1": target, "1,1": target },
  });
});

test("the same normalized target color is a no-op before searching", () => {
  const grid = squareGrid();
  grid.getOffsetRange = () => { throw new Error("a no-op should not traverse the grid"); };
  assert.deepEqual(fill({ "1,1": "#ABCDEF" }, { i: 1, j: 1 }, grid, bounds, "abcdef"), { status: "noop" });
});

test("partial square cells belong to the scene even when their centers are outside", () => {
  const rect = { x: 0.8, y: 0.8, width: 1.4, height: 1.4 };
  assert.deepEqual(fill({ "0,0": "#123456" }, { i: 0, j: 0 }, squareGrid(), rect), {
    status: "filled", changes: { "0,0": target },
  });
  assert.deepEqual(fill({}, { i: 0, j: 0 }, squareGrid(), rect), { status: "open" });
});

test("coarse offset ranges do not admit cells with only boundary contact", () => {
  const grid = squareGrid();
  grid.getOffsetRange = () => [-1, -1, 4, 4];
  const rect = { x: 0, y: 0, width: 3, height: 3 };
  const cells = { "0,0": "#123456", "0,-1": "#123456", "-1,0": "#123456" };
  assert.deepEqual(fill(cells, { i: 0, j: 0 }, grid, rect), { status: "filled", changes: { "0,0": target } });
  assert.deepEqual(fill(cells, { i: 0, j: -1 }, grid, rect), { status: "noop" });
});

test("invalid seeds and empty scene bounds are no-ops", () => {
  assert.deepEqual(fill({}, { i: -1, j: 3 }), { status: "noop" });
  assert.deepEqual(fill({}, { i: 3, j: 7 }), { status: "noop" });
  assert.deepEqual(fill({}, { i: 0, j: 0 }, squareGrid(), { x: 0, y: 0, width: 0, height: 3 }), { status: "noop" });
});

test("an iterative fill handles a large connected region without recursion", () => {
  const cells = {};
  const size = 150;
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) cells[`${i},${j}`] = "#123456";
  }
  const result = fill(cells, { i: 0, j: 0 }, squareGrid(), { x: 0, y: 0, width: size, height: size });
  assert.equal(result.status, "filled");
  assert.equal(Object.keys(result.changes).length, size * size);
});

// Axial fixtures exercise both stagger orientations and both offset parity rules.
function hexGrid(rows, even) {
  const parity = even ? 1 : -1;
  const radius = 10;
  const toAxial = ({ i, j }) => rows
    ? { q: j - (i + parity * (i & 1)) / 2, r: i }
    : { q: j, r: i - (j + parity * (j & 1)) / 2 };
  const fromAxial = ({ q, r }) => rows
    ? { i: r, j: q + (r + parity * (r & 1)) / 2 }
    : { i: r + (q + parity * (q & 1)) / 2, j: q };
  const center = (offset) => {
    const { q, r } = toAxial(offset);
    return rows
      ? { x: Math.sqrt(3) * radius * (q + r / 2), y: 1.5 * radius * r }
      : { x: 1.5 * radius * q, y: Math.sqrt(3) * radius * (r + q / 2) };
  };
  return {
    isSquare: false,
    getAdjacentOffsets(offset) {
      const { q, r } = toAxial(offset);
      return [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]
        .map(([dq, dr]) => fromAxial({ q: q + dq, r: r + dr }));
    },
    getOffsetRange({ x, y, width, height }) {
      const sx = (rows ? Math.sqrt(3) : 1.5) * radius;
      const sy = (rows ? 1.5 : Math.sqrt(3)) * radius;
      // A coarse rectangle deliberately includes staggered cells outside the scene.
      return [Math.floor(y / sy) - 2, Math.floor(x / sx) - 2, Math.ceil((y + height) / sy) + 2, Math.ceil((x + width) / sx) + 2];
    },
    getVertices(offset) {
      const c = center(offset);
      return Array.from({ length: 6 }, (_, k) => {
        const angle = ((rows ? -90 : 0) + 60 * k) * Math.PI / 180;
        return { x: c.x + radius * Math.cos(angle), y: c.y + radius * Math.sin(angle) };
      });
    },
  };
}

function encloseHexes(grid, offsets) {
  const inside = new Set(offsets.map(key));
  const cells = {};
  for (const offset of offsets) {
    for (const adjacent of grid.getAdjacentOffsets(offset)) {
      if (!inside.has(key(adjacent))) cells[key(adjacent)] = Object.keys(cells).length % 2 ? "#ff0000" : "#0000ff";
    }
  }
  return cells;
}

for (const rows of [true, false]) {
  for (const even of [true, false]) {
    const name = `${rows ? "row" : "column"} hexes, ${even ? "even" : "odd"} offset`;
    const grid = hexGrid(rows, even);
    const rect = { x: -100, y: -100, width: 250, height: 250 };

    for (const index of [2, 3, -1]) {
      test(`${name}: enclosed fill at row/column ${index}`, () => {
        const seed = { i: index, j: index };
        const other = grid.getAdjacentOffsets(seed)[0];
        const cells = encloseHexes(grid, [seed, other]);
        assert.deepEqual(fill(cells, seed, grid, rect), {
          status: "filled", changes: { [key(seed)]: target, [key(other)]: target },
        });
        delete cells[key(grid.getAdjacentOffsets(seed)[3])];
        assert.deepEqual(fill(cells, seed, grid, rect), { status: "open" });
      });
    }

    test(`${name}: a partial edge hex is included and cannot close empty space`, () => {
      const seed = { i: 0, j: 0 };
      const partial = { x: 2, y: -100, width: 100, height: 200 };
      assert.deepEqual(fill({ "0,0": "#123456" }, seed, grid, partial), {
        status: "filled", changes: { "0,0": target },
      });
      assert.deepEqual(fill(encloseHexes(grid, [seed]), seed, grid, partial), { status: "open" });
    });

    test(`${name}: touching the scene at only a vertex does not open an enclosure`, () => {
      const seed = { i: 0, j: 0 };
      const vertices = grid.getVertices(seed);
      const touching = rows
        ? { x: -100, y: Math.min(...vertices.map((p) => p.y)), width: 200, height: 200 }
        : { x: Math.min(...vertices.map((p) => p.x)), y: -100, width: 200, height: 200 };
      assert.deepEqual(fill(encloseHexes(grid, [seed]), seed, grid, touching), {
        status: "filled", changes: { "0,0": target },
      });
    });
  }
}
