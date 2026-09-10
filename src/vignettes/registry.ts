import { createImpactBuffers } from '@/audio/hammerSounds';
import { createWindowSounds } from '@/audio/windowSounds';
import { HammerNailVignette, WORKSHOP } from './HammerNailVignette';
import { WindowCleaningVignette, GLASS } from './WindowCleaningVignette';
import type { VignetteDefinition } from './Vignette';
import { BugShoeVignette, GARDEN } from './BugShoeVignette';
import { createBugSounds } from '@/audio/bugSounds';
import { SawTimberVignette, TIMBER } from './SawTimberVignette';
import { createSawSounds } from '@/audio/sawSounds';
import { TomatoKnifeVignette, KITCHEN } from './TomatoKnifeVignette';
import { createTomatoSounds } from '@/audio/tomatoSounds';

export const VIGNETTES: readonly VignetteDefinition[] = [
  {
    id: 'hammer', title: 'Hammer & nail', intro: 'Make it\nstick.', ink: WORKSHOP.ink,
    success: ['Nicely\ndone.', 'Right on the head.'], rough: ['It has\ncharacter.', 'Perfectly imperfect.'],
    endingSec: 1.35, successAccuracy: 70,
    create: scene => new HammerNailVignette(scene),
    sounds: context => { const b = createImpactBuffers(context); return { action: b.hit, success: b.flush, rough: b.bent }; },
  },
  {
    id: 'window', title: 'Window cleaning', intro: 'A clearer\nview.', ink: GLASS.ink,
    success: ['Looking\nsharp.', 'Nothing between you and the sky.'], rough: ['Almost\ninvisible.', 'One little souvenir.'],
    endingSec: 1.35, successAccuracy: 70,
    create: scene => new WindowCleaningVignette(scene), sounds: createWindowSounds,
  },
  {
    id: 'bug', title: 'Bug & shoe', intro: 'Watch your\nstep.', ink: GARDEN.ink,
    success: ['New\npassenger.', 'Small feet. Big personality.'], rough: ['Missed\nme.', 'A very determined little dot.'],
    endingSec: 1.35, successAccuracy: 70,
    create: scene => new BugShoeVignette(scene), sounds: createBugSounds,
  },
  {
    id: 'saw', title: 'Saw & timber', intro: 'Follow\nthe line.', ink: TIMBER.ink,
    success: ['Two planks\nnow.', 'Straight through, first time.'], rough: ['Nearly\nthrough.', 'It let go in its own time.'],
    endingSec: 1.35, successAccuracy: 70,
    create: scene => new SawTimberVignette(scene), sounds: createSawSounds,
  },
  {
    id: 'tomato', title: 'Knife & tomato', intro: 'Mind your\nfingers.', ink: KITCHEN.ink,
    success: ['Thin and\neven.', 'Every slice the same.'], rough: ['Roughly\nchopped.', 'Rustic. We are calling it rustic.'],
    endingSec: 1.35, successAccuracy: 70,
    create: scene => new TomatoKnifeVignette(scene), sounds: createTomatoSounds,
  },
];
