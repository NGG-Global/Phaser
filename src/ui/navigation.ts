/** Keep the same relative stretch of the road in view when the phone changes size. */
export function resizedScroll(scroll: number, previousScale: number, nextScale: number,
  oldHeader: number, newHeader: number, oldHeight: number, newHeight: number): number {
  if (previousScale <= 0) return 0;
  const anchor = oldHeader + (oldHeight - oldHeader) * 0.5;
  return (scroll + anchor - oldHeader) * nextScale / previousScale
    + newHeader - (newHeader + (newHeight - newHeader) * 0.5);
}

/** Critical damping without a frame-dependent lerp; also stable after a backgrounded frame. */
export function scrollStep(velocity: number, deltaMs: number, friction: number): { distance: number; velocity: number } {
  const seconds = Math.min(64, Math.max(0, deltaMs)) / 1000;
  const decay = Math.exp(-friction * seconds);
  return { distance: velocity * (1 - decay) / friction, velocity: velocity * decay };
}
