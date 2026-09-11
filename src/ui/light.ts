import { mix, shade } from './colour';

/**
 * One light for the whole game. The map already stated the rule — "one light source,
 * high and to the left" — and its cast shadows obeyed it, but the two sun discs sat
 * upper-right and every scene placed its own offsets by hand. Everything that casts a
 * shadow, catches a rim or shades a face derives it from here, so a surface anywhere
 * in the game agrees with every other about where the light is.
 */
export const LIGHT = Object.freeze({
  /** Unit direction *toward* the light, in screen space. Upper-left, fairly high. */
  x: -0.5,
  y: -0.75,
  /** Base shadow reach per unit of object depth, in design units. */
  reach: 1.1,
});

export interface Shadow { readonly dx: number; readonly dy: number; readonly alpha: number }

/**
 * Where an object's shadow falls, given how far it stands off its surface. `length`
 * lets a treatment stretch or shorten every shadow together: a low sun throws long
 * soft ones, a lamp throws short hard ones.
 */
export function castShadow(depth: number, length = 1): Shadow {
  const reach = depth * LIGHT.reach * length;
  return {
    dx: -LIGHT.x * reach,
    dy: -LIGHT.y * reach,
    // A shadow further from its object is softer and lighter.
    alpha: Math.max(0.08, 0.28 - reach * 0.012),
  };
}

export interface Faces {
  /** The plane facing the light. */
  readonly lit: number;
  /** The plane facing the viewer. */
  readonly face: number;
  /** The plane turned from the light: the side wall that reads as thickness. */
  readonly shade: number;
  /** The hard edge where two planes meet, darker than either. */
  readonly edge: number;
  /** The specular catch on the lit edge. */
  readonly rim: number;
}

/**
 * Lit, front, shaded and edge tones for one material colour, so a form reads as a solid
 * under the shared light rather than a flat fill with a border.
 */
export function faces(colour: number): Faces {
  return {
    lit: shade(colour, 0.14),
    face: colour,
    shade: shade(colour, -0.28),
    edge: shade(colour, -0.45),
    rim: mix(shade(colour, 0.35), 0xffffff, 0.35),
  };
}
