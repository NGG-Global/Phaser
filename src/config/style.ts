/**
 * The visual treatment. The style lab ran three of these from one build — a cartoon
 * workshop, a matte studio, a tavern of brass and stained wood — and Dor chose the
 * workshop: Cut the Rope's body, thick outlines, painted materials, heavy squash. The
 * record stays so every drawing module reads its weights from one place rather than
 * carrying its own literals, and so the look can be tuned without touching the drawing.
 */
export interface Treatment {
  /** Outline weight in design units at scale 1. Type, panels and props all derive theirs from it. */
  readonly outline: number;
  /** Multiplier on squash, overshoot, shake and particle counts. */
  readonly exaggeration: number;
  readonly display: string;
  readonly displayWeight: number;
  readonly body: string;
  readonly bodyWeight: number;
  /** Alpha multiplier on material tiles. */
  readonly grain: number;
  /** Corner radius of panels in design units at scale 1. */
  readonly radius: number;
}

export const WORKSHOP_TREATMENT: Treatment = Object.freeze({
  outline: 7, exaggeration: 1.35,
  display: 'Fredoka', displayWeight: 700, body: 'Nunito', bodyWeight: 600,
  grain: 0.55, radius: 18,
});

export const STYLE: { readonly current: Treatment } = Object.freeze({ current: WORKSHOP_TREATMENT });
