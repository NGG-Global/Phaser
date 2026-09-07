/**
 * Reads the device's safe-area insets (notch, punch-hole, rounded corners,
 * gesture bar) in CSS pixels.
 *
 * `env(safe-area-inset-*)` is only resolvable from CSS, and reading it back
 * through a custom property is unreliable — several engines hand back the
 * unresolved `env(...)` token instead of a length. So a hidden probe element
 * applies the insets as padding and the computed padding is read off it.
 *
 * The probe is created once and reused, since insets change on rotation and
 * on entering or leaving fullscreen.
 */

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const ZERO_INSETS: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

const PROBE_ID = 'safe-area-probe';

let probe: HTMLElement | null = null;

function ensureProbe(): HTMLElement {
  if (probe?.isConnected === true) {
    return probe;
  }

  const el = document.createElement('div');
  el.id = PROBE_ID;
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'width:0',
    'height:0',
    'visibility:hidden',
    'pointer-events:none',
    'padding-top:env(safe-area-inset-top, 0px)',
    'padding-right:env(safe-area-inset-right, 0px)',
    'padding-bottom:env(safe-area-inset-bottom, 0px)',
    'padding-left:env(safe-area-inset-left, 0px)',
  ].join(';');

  document.body.appendChild(el);
  probe = el;
  return el;
}

/** Parses a computed length, treating `auto`/`""`/`NaN` as 0. */
function toPx(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

/** Current safe-area insets in CSS pixels. Cheap enough to call on resize. */
export function readSafeAreaInsets(): SafeAreaInsets {
  const styles = getComputedStyle(ensureProbe());

  return {
    top: toPx(styles.paddingTop),
    right: toPx(styles.paddingRight),
    bottom: toPx(styles.paddingBottom),
    left: toPx(styles.paddingLeft),
  };
}
