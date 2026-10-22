const assert = require("node:assert/strict");
const test = require("node:test");
const { CommandHistory, PaintCommand } = require("../.test-build/ts/history.js");

function applyChanges(cells, changes) {
  for (const [key, color] of Object.entries(changes)) {
    if (color === null) delete cells[key];
    else cells[key] = color;
  }
}

function memoryTarget(initial) {
  const cells = { ...initial };
  const calls = [];
  return {
    cells,
    calls,
    async apply(edit) {
      calls.push(structuredClone(edit));
      applyChanges(cells, edit.cells);
      return true;
    },
  };
}

for (const [region, original, fill] of [
  [
    "empty",
    { "0,1": "#112233", "1,0": "#112233", "8,8": "#abcdef" },
    { "1,1": "#445566", "1,2": "#445566", "2,1": "#445566" },
  ],
  [
    "painted",
    { "1,1": "#112233", "1,2": "#112233", "2,1": "#112233", "8,8": "#abcdef" },
    { "1,1": "#445566", "1,2": "#445566", "2,1": "#445566" },
  ],
]) {
  test(`a completed ${region} region fill is one reversible batch`, async () => {
    const target = memoryTarget(original);
    const history = new CommandHistory(target);
    const command = PaintCommand.from(original, fill);
    assert.ok(command);

    assert.equal(await history.execute(command), true);
    assert.deepEqual(target.cells, { ...original, ...fill });
    assert.deepEqual(target.calls, [{ cells: fill }]);
    assert.equal(history.canUndo, true);
    assert.equal(history.canRedo, false);

    assert.equal(await history.undo(), true);
    assert.deepEqual(target.cells, original);
    assert.equal(target.calls.length, 2);
    assert.equal(history.canUndo, false);
    assert.equal(history.canRedo, true);
    assert.equal(await history.undo(), false);
    assert.equal(target.calls.length, 2);

    assert.equal(await history.redo(), true);
    assert.deepEqual(target.cells, { ...original, ...fill });
    assert.equal(target.calls.length, 3);
    assert.deepEqual(target.calls[2], { cells: fill });
    assert.equal(history.canUndo, true);
    assert.equal(history.canRedo, false);
    assert.equal(await history.redo(), false);
    assert.equal(target.calls.length, 3);
  });
}

test("unchanged fill cells produce no command or history entry", async () => {
  const original = { "1,1": "#445566", "1,2": "#445566", "8,8": "#abcdef" };
  const target = memoryTarget(original);
  const history = new CommandHistory(target);
  const command = PaintCommand.from(original, { "1,1": "#445566", "1,2": "#445566" });

  assert.equal(command, null);
  assert.equal(PaintCommand.from(original, {}), null);
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, false);
  assert.equal(await history.undo(), false);
  assert.equal(await history.redo(), false);
  assert.deepEqual(target.cells, original);
  assert.deepEqual(target.calls, []);
});

test("a rejected fill write does not create an undo step", async () => {
  const calls = [];
  const history = new CommandHistory({
    async apply(edit) {
      calls.push(structuredClone(edit));
      return false;
    },
  });
  const fill = { "1,1": "#445566", "1,2": "#445566" };
  const command = PaintCommand.from({}, fill);
  assert.ok(command);

  assert.equal(await history.execute(command), false);
  assert.deepEqual(calls, [{ cells: fill }]);
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, false);
  assert.equal(await history.undo(), false);
  assert.equal(await history.redo(), false);
  assert.equal(calls.length, 1);
});

test("queued fills wait for each previous write to finish", async () => {
  let releaseFirst;
  let markFirstStarted;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const firstStarted = new Promise((resolve) => { markFirstStarted = resolve; });
  const cells = { "8,8": "#abcdef" };
  const events = [];
  let writes = 0;
  const history = new CommandHistory({
    async apply(edit) {
      const index = ++writes;
      events.push(`start ${index}`);
      if (index === 1) {
        markFirstStarted();
        await firstGate;
      }
      applyChanges(cells, edit.cells);
      events.push(`finish ${index}`);
      return true;
    },
  });
  const firstFill = { "1,1": "#112233", "1,2": "#112233" };
  const secondFill = { "2,1": "#445566", "2,2": "#445566" };
  const first = history.execute(PaintCommand.from(cells, firstFill));
  const second = history.execute(PaintCommand.from(cells, secondFill));

  await firstStarted;
  try {
    assert.deepEqual(events, ["start 1"]);
    assert.deepEqual(cells, { "8,8": "#abcdef" });
    assert.equal(history.canUndo, false);
  } finally {
    releaseFirst();
  }

  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.deepEqual(events, ["start 1", "finish 1", "start 2", "finish 2"]);
  assert.deepEqual(cells, { "8,8": "#abcdef", ...firstFill, ...secondFill });
  assert.equal(writes, 2);
});
