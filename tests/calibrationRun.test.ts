import { describe, expect, it } from 'vitest';
import { CalibrationRun, CALIBRATION } from '../src/game/CalibrationRun';
import { CALIBRATION_TAPS } from '../src/game/settings';

function measure(offsets: number[], current = 0): CalibrationRun {
  const run = new CalibrationRun(10, current);
  offsets.forEach((ms, i) => run.tap(10 + (CALIBRATION.leadBeats + i) * run.period + ms / 1000));
  return run;
}

describe('calibration sampling', () => {
  it('needs eight distinct beats, not eight presses around one beat', () => {
    const run = new CalibrationRun(10, 0);
    for (let i = 0; i < 8; i++) run.tap(14 + i * 0.01);
    expect(run.count).toBe(1);
    expect(run.result()).toBeNull();
  });

  it('ignores preparation, gaps, invalid timestamps and taps after the exercise', () => {
    const run = new CalibrationRun(10, 0);
    for (const time of [NaN, Infinity, 9, 10, 13, 14.5, run.end + 1]) expect(run.tap(time)).toBe(false);
    expect(run.count).toBe(0);
  });

  it('handles a 300 ms residual without wrapping it to a negative neighbouring beat', () => {
    expect(measure(Array(8).fill(300)).result()).toBe(300);
    expect(measure(Array(8).fill(-100), 200).result()).toBe(100);
  });

  it('keeps the median robust to one fumble but refuses erratic tapping', () => {
    expect(measure([90, 91, 92, 93, 92, 90, 95, 300]).result()).toBe(92);
    expect(measure([-190, 160, -150, 200, -120, 180, -170, 220]).result()).toBeNull();
  });

  it('is bounded after completion and each new run starts cleanly', () => {
    const run = measure(Array(8).fill(40));
    expect(run.complete).toBe(true);
    expect(run.tap(23)).toBe(false);
    expect(run.count).toBe(CALIBRATION_TAPS);
    expect(new CalibrationRun(30, 40).count).toBe(0);
    expect(new CalibrationRun(30, 40).result()).toBeNull();
  });
});
