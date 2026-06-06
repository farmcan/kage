export function nextSessionFocus(paths, currentPath, direction) {
  if (!Array.isArray(paths) || paths.length === 0) return null;
  const step = direction === "previous" ? -1 : 1;
  const currentIndex = paths.indexOf(currentPath);
  if (currentIndex === -1) return paths[0];
  const nextIndex = Math.max(0, Math.min(paths.length - 1, currentIndex + step));
  return paths[nextIndex];
}

export function selectSessionRange(paths, anchorPath, focusPath) {
  if (!Array.isArray(paths) || paths.length === 0) return [];
  const anchorIndex = paths.indexOf(anchorPath);
  const focusIndex = paths.indexOf(focusPath);
  if (anchorIndex === -1 || focusIndex === -1) return focusPath ? [focusPath] : [];
  const start = Math.min(anchorIndex, focusIndex);
  const end = Math.max(anchorIndex, focusIndex);
  return paths.slice(start, end + 1);
}

export function toggleSessionSelection(selectedPaths, path) {
  const next = new Set(Array.isArray(selectedPaths) ? selectedPaths : []);
  if (next.has(path)) {
    next.delete(path);
  } else if (path) {
    next.add(path);
  }
  return Array.from(next);
}
