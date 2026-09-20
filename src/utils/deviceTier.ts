/**
 * How much visual work this device can be asked to do.
 *
 * Halcyon ships two progress-bar implementations and picks between them by
 * device class: an AGSL shader on capable hardware, a plain Canvas one
 * otherwise. The web has no shader to fall back from, so the equivalent
 * decision is whether to draw the blurred comet sprite at all - that is the
 * only part of the bar that costs anything per frame.
 *
 * The signals are deliberately coarse. There is no reliable way to ask a
 * browser how fast it is, and guessing "low" wrongly costs only a slightly
 * plainer dot.
 */

export type DeviceTier = 'high' | 'low';

/** Below this core count the device is treated as low-end. */
export const LOW_CORE_COUNT = 4;
/** Below this many GB of RAM the device is treated as low-end. */
export const LOW_MEMORY_GB = 4;

/**
 * Classifies a device from whatever the platform will admit to.
 *
 * Missing signals count as "high": both `hardwareConcurrency` and
 * `deviceMemory` are withheld by some browsers (Safari reports neither), and
 * treating every Safari user as low-end would be worse than the occasional
 * wasted blur.
 */
export function classifyDevice(input: { cores?: number; memory?: number }): DeviceTier {
  if (typeof input.cores === 'number' && input.cores > 0 && input.cores < LOW_CORE_COUNT) {
    return 'low';
  }
  if (typeof input.memory === 'number' && input.memory > 0 && input.memory < LOW_MEMORY_GB) {
    return 'low';
  }
  return 'high';
}

/** Reads the platform signals, then classifies. */
export function currentDeviceTier(): DeviceTier {
  if (typeof navigator === 'undefined') return 'high';
  const nav = navigator as Navigator & { deviceMemory?: number };
  return classifyDevice({ cores: nav.hardwareConcurrency, memory: nav.deviceMemory });
}

let cached: DeviceTier | null = null;

/**
 * The device class for this session. Cached because neither signal can change
 * while the app is running.
 */
export function deviceTier(): DeviceTier {
  if (cached === null) cached = currentDeviceTier();
  return cached;
}
