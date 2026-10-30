import { ENGINE_CONFIG } from './config.js';
export function scheduleRevisions(masteredAt: number): [number, number] {
  return [masteredAt + ENGINE_CONFIG.revision.firstDays * 86_400_000, masteredAt + ENGINE_CONFIG.revision.secondDays * 86_400_000];
}
export function applyRevisionResult(mastery: number, remembered: boolean): number {
  return remembered ? Math.min(1, mastery + 0.04) : Math.max(0, mastery - ENGINE_CONFIG.revision.forgottenDrop);
}
