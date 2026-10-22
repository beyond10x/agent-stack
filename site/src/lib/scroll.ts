export interface StoryFrame {
  phase: 'assemble' | 'call' | 'rest';
  reveal: number;
  layer: number;
  cursor: number;
  progress: number;
}

export const HOLD_UNITS = 1;

export function storyUnits(layers: number, segments: number): number {
  return layers + segments + HOLD_UNITS;
}

export function clamp(value: number, low = 0, high = 1): number {
  return Math.min(high, Math.max(low, value));
}

export function scrollProgress(top: number, height: number, viewport: number): number {
  const travel = height - viewport;
  if (travel <= 0) return top <= 0 ? 1 : 0;
  return clamp(-top / travel);
}

export function storyFrame(progress: number, layers: number, segments: number): StoryFrame {
  const units = storyUnits(layers, segments);
  const unit = clamp(progress) * units;
  if (unit < layers) {
    return { phase: 'assemble', reveal: unit, layer: Math.min(layers - 1, Math.floor(unit)), cursor: 0, progress: 0 };
  }
  const call = unit - layers;
  if (call < segments) {
    const cursor = Math.floor(call);
    return { phase: 'call', reveal: layers, layer: layers - 1, cursor, progress: call - cursor };
  }
  return { phase: 'rest', reveal: layers, layer: layers - 1, cursor: segments, progress: 0 };
}

export function revealOf(reveal: number, fromBottom: number, slot = 0, count = 1): number {
  const local = reveal - fromBottom;
  const lead = count > 1 ? (slot / (count - 1)) * 0.35 : 0;
  return clamp((local - lead) / 0.5);
}
