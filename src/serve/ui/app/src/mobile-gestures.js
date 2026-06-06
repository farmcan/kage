export const PULL_REFRESH_THRESHOLD = 72;
export const SWIPE_BACK_THRESHOLD = 76;
export const SWIPE_BACK_EDGE = 56;
export const MAX_GESTURE_DRIFT = 48;

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function classifyPullToRefresh({
  startX = 0,
  startY = 0,
  currentX = 0,
  currentY = 0,
  scrollTop = 0,
  threshold = PULL_REFRESH_THRESHOLD,
  maxHorizontalDrift = MAX_GESTURE_DRIFT,
} = {}) {
  const deltaX = numberOrZero(currentX) - numberOrZero(startX);
  const deltaY = numberOrZero(currentY) - numberOrZero(startY);
  const distance = Math.max(0, deltaY);
  const atTop = numberOrZero(scrollTop) <= 0;
  const stableDrag = Math.abs(deltaX) <= maxHorizontalDrift;
  const progress = atTop && stableDrag ? Math.min(distance / threshold, 1) : 0;
  return {
    active: atTop && stableDrag && distance > 8,
    ready: atTop && stableDrag && distance >= threshold,
    deltaY: distance,
    progress,
  };
}

export function classifySwipeBack({
  startX = 0,
  startY = 0,
  currentX = 0,
  currentY = 0,
  edgeSize = SWIPE_BACK_EDGE,
  threshold = SWIPE_BACK_THRESHOLD,
  maxVerticalDrift = MAX_GESTURE_DRIFT,
} = {}) {
  const deltaX = numberOrZero(currentX) - numberOrZero(startX);
  const deltaY = numberOrZero(currentY) - numberOrZero(startY);
  const startsAtEdge = numberOrZero(startX) <= edgeSize;
  const stableDrag = Math.abs(deltaY) <= maxVerticalDrift;
  const distance = Math.max(0, deltaX);
  const progress = startsAtEdge && stableDrag ? Math.min(distance / threshold, 1) : 0;
  return {
    active: startsAtEdge && stableDrag && distance > 10,
    ready: startsAtEdge && stableDrag && distance >= threshold,
    deltaX: distance,
    progress,
  };
}
