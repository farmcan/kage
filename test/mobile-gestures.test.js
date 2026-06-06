import test from "node:test";
import assert from "node:assert/strict";

import { classifyPullToRefresh, classifySwipeBack } from "../src/serve/ui/app/src/mobile-gestures.js";

test("pull-to-refresh arms only when dragging down from the top", () => {
  assert.equal(
    classifyPullToRefresh({ startY: 10, currentY: 90, scrollTop: 0 }).ready,
    true,
  );
  assert.equal(
    classifyPullToRefresh({ startY: 10, currentY: 90, scrollTop: 12 }).ready,
    false,
  );
  assert.equal(
    classifyPullToRefresh({ startX: 10, currentX: 90, startY: 10, currentY: 90, scrollTop: 0 }).ready,
    false,
  );
});

test("swipe-back arms only from the left edge with limited vertical drift", () => {
  assert.equal(
    classifySwipeBack({ startX: 24, currentX: 116, startY: 100, currentY: 112 }).ready,
    true,
  );
  assert.equal(
    classifySwipeBack({ startX: 90, currentX: 184, startY: 100, currentY: 108 }).ready,
    false,
  );
  assert.equal(
    classifySwipeBack({ startX: 24, currentX: 116, startY: 100, currentY: 172 }).ready,
    false,
  );
});
