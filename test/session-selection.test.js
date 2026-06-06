import test from "node:test";
import assert from "node:assert/strict";

import { nextSessionFocus, selectSessionRange, toggleSessionSelection } from "../src/serve/ui/app/src/session-selection.js";

test("nextSessionFocus clamps keyboard focus to visible sessions", () => {
  const paths = ["a", "b", "c"];

  assert.equal(nextSessionFocus(paths, null, "next"), "a");
  assert.equal(nextSessionFocus(paths, "a", "next"), "b");
  assert.equal(nextSessionFocus(paths, "c", "next"), "c");
  assert.equal(nextSessionFocus(paths, "b", "previous"), "a");
  assert.equal(nextSessionFocus(paths, "a", "previous"), "a");
});

test("selectSessionRange returns an ordered inclusive range", () => {
  const paths = ["a", "b", "c", "d"];

  assert.deepEqual(selectSessionRange(paths, "b", "d"), ["b", "c", "d"]);
  assert.deepEqual(selectSessionRange(paths, "d", "b"), ["b", "c", "d"]);
  assert.deepEqual(selectSessionRange(paths, "missing", "c"), ["c"]);
});

test("toggleSessionSelection adds and removes paths without duplicates", () => {
  assert.deepEqual(toggleSessionSelection([], "a"), ["a"]);
  assert.deepEqual(toggleSessionSelection(["a"], "b"), ["a", "b"]);
  assert.deepEqual(toggleSessionSelection(["a", "b"], "a"), ["b"]);
});
