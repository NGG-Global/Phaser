/**
 * Controls the DOM overlays declared in `index.html`.
 *
 * These live outside the canvas on purpose. The boot panel has to be visible
 * before the bundle has parsed, and the orientation prompt has to work even if
 * the renderer failed to start — neither can be a Phaser scene.
 */

const BOOT_OVERLAY_ID = 'boot-overlay';
const BOOT_ERROR_ID = 'boot-error';
const ORIENTATION_OVERLAY_ID = 'orientation-overlay';
const GAME_ROOT_ID = 'game-root';

function element(id: string): HTMLElement | null {
  return document.getElementById(id);
}

/** The element Phaser mounts its canvas into. */
export function getGameRootId(): string {
  return GAME_ROOT_ID;
}

/** Hides the boot panel. Call once the first scene is actually rendering. */
export function hideBootOverlay(): void {
  element(BOOT_OVERLAY_ID)?.setAttribute('hidden', '');
}

/**
 * Leaves the boot panel up and replaces the spinner with an error message.
 *
 * Used when the game cannot start at all — most often a WebGL context that the
 * device refused to create. A visible reason beats an indefinite spinner.
 */
export function showBootError(message: string): void {
  const overlay = element(BOOT_OVERLAY_ID);
  const target = element(BOOT_ERROR_ID);

  if (overlay === null || target === null) {
    return;
  }

  overlay.removeAttribute('hidden');
  overlay.querySelector('.spinner')?.remove();

  const title = overlay.querySelector('.overlay__title');
  if (title !== null) {
    title.textContent = 'Unable to start';
  }

  target.textContent = message;
  target.removeAttribute('hidden');
}

/** Shows or hides the "rotate your device" prompt. */
export function setOrientationPromptVisible(visible: boolean): void {
  const overlay = element(ORIENTATION_OVERLAY_ID);

  if (overlay === null) {
    return;
  }

  if (visible) {
    overlay.removeAttribute('hidden');
  } else {
    overlay.setAttribute('hidden', '');
  }
}

/**
 * Whether the primary pointer is coarse — a finger or stylus rather than a
 * mouse.
 *
 * This gates the orientation prompt. A landscape *desktop* window is a normal
 * development setup and must not be nagged; a landscape *handset* is holding
 * a portrait-designed game sideways and should be.
 */
export function isTouchPrimary(): boolean {
  return window.matchMedia('(pointer: coarse)').matches;
}
