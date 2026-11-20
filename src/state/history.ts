/**
 * Generic immutable undo/redo history stack.
 */

export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

export function createHistory<T>(initial: T): HistoryState<T> {
  return { past: [], present: initial, future: [] };
}

export function pushHistory<T>(
  history: HistoryState<T>,
  next: T,
  maxSteps = 60,
): HistoryState<T> {
  const past =
    history.past.length >= maxSteps
      ? [...history.past.slice(history.past.length - maxSteps + 1), history.present]
      : [...history.past, history.present];
  return { past, present: next, future: [] };
}

export function replacePresent<T>(
  history: HistoryState<T>,
  next: T,
): HistoryState<T> {
  return { ...history, present: next };
}

export function undoHistory<T>(history: HistoryState<T>): HistoryState<T> {
  if (history.past.length === 0) return history;
  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redoHistory<T>(history: HistoryState<T>): HistoryState<T> {
  if (history.future.length === 0) return history;
  const next = history.future[0];
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  };
}
