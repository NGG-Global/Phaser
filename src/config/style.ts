/**
 * The style lab. Three treatments of one visual system, chosen from renders rather
 * than from a description, and differing only along the three axes on which the
 * references actually disagree: silhouette outline, ornament density, motion
 * exaggeration. Everything else — one light, generated materials, bundled type,
 * drawn icons, physical motion — is shared.
 *
 * In development `?style=workshop|studio|tavern` switches between them from one build.
 * Production reads `DEFAULT_TREATMENT`. When one is chosen the other two are deleted,
 * not kept behind a flag.
 */
export type TreatmentId = 'workshop' | 'studio' | 'tavern';

export interface Treatment {
  readonly id: TreatmentId;
  readonly name: string;
  /** Silhouette outline in design units at scale 1; 0 draws none. */
  readonly outline: number;
  /** 0 is a bare slab, 1 is framed with corner rivets and an inlaid label plate. */
  readonly ornament: number;
  /** Multiplies overshoot, squash and particle counts. 1 is the tuned baseline. */
  readonly exaggeration: number;
  /** Family names as registered by `load.font()`. */
  readonly display: string;
  readonly displayWeight: number;
  readonly body: string;
  readonly bodyWeight: number;
  /** How the display face is dressed: a hard drop, a pressed-in inset, or a deep cast shadow. */
  readonly typeShadow: 'drop' | 'inset' | 'deep';
  /** Strength of the generated material overlays, 0–1. */
  readonly grain: number;
  /** Point light and glow filter on the hero object. WebGL only; gated at the call site. */
  readonly glow: boolean;
  /** Softer, longer cast shadows read as a low sun; shorter, harder ones as a lamp. */
  readonly shadowLength: number;
  /** Corner radius of panels and blocks, in design units. */
  readonly radius: number;
}

export const TREATMENTS: Readonly<Record<TreatmentId, Treatment>> = Object.freeze({
  workshop: Object.freeze({
    id: 'workshop', name: 'Workshop',
    outline: 7, ornament: 0.25, exaggeration: 1.35,
    display: 'Fredoka', displayWeight: 700, body: 'Nunito', bodyWeight: 600,
    typeShadow: 'drop', grain: 0.55, glow: false, shadowLength: 0.7, radius: 18,
  }),
  studio: Object.freeze({
    id: 'studio', name: 'Studio',
    outline: 0, ornament: 0, exaggeration: 0.8,
    display: 'Quicksand', displayWeight: 600, body: 'Nunito', bodyWeight: 600,
    typeShadow: 'inset', grain: 0.35, glow: false, shadowLength: 1.6, radius: 10,
  }),
  tavern: Object.freeze({
    id: 'tavern', name: 'Tavern',
    outline: 3, ornament: 1, exaggeration: 1.1,
    display: 'Baloo 2', displayWeight: 800, body: 'Nunito', bodyWeight: 600,
    typeShadow: 'deep', grain: 0.7, glow: true, shadowLength: 1, radius: 14,
  }),
});

/** Placeholder until a treatment is chosen from the lab renders. */
const DEFAULT_TREATMENT: TreatmentId = 'workshop';

function resolve(): Treatment {
  if (import.meta.env.DEV && typeof location !== 'undefined') {
    const wanted = new URLSearchParams(location.search).get('style');
    if (wanted && wanted in TREATMENTS) return TREATMENTS[wanted as TreatmentId];
  }
  return TREATMENTS[DEFAULT_TREATMENT];
}

export const STYLE: { readonly current: Treatment } = Object.freeze({ current: resolve() });
