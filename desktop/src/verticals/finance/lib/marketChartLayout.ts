/** Fit candle width to the current pane so all fetched bars stay on screen after layout. */
export function marketBarSpace(width: number, count: number) {
  return Math.max(4, Math.min(30, (Math.max(width, 80) - 80) / Math.max(count, 1)));
}
