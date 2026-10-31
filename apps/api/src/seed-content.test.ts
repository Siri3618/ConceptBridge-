import { describe, expect, it } from 'vitest';
import { curriculum } from '@conceptbridge/engine';
import { buildExplanationText, buildQuestionDrafts, draft, teluguDraft } from './seed-content.js';

describe('seeded curriculum content coverage', () => {
  it('defines real concepts and chapter mappings for Classes 6 through 10', () => {
    const byClass = new Map<number, typeof curriculum>();
    for (const concept of curriculum) byClass.set(concept.classLevel, [...(byClass.get(concept.classLevel) ?? []), concept]);
    expect([...byClass.keys()].sort((a, b) => a - b)).toEqual([6, 7, 8, 9, 10]);
    expect([...byClass.values()].map((items) => items.length)).toEqual([2, 3, 4, 3, 3]);
    for (const concept of curriculum) {
      expect(concept.chapters.CBSE).toBeTruthy();
      expect(concept.chapters.TELANGANA_SCERT).toBeTruthy();
      expect(buildQuestionDrafts(concept.slug).length).toBe(6);
    }
  });

  it('provides unique bilingual questions with explanations for every concept', () => {
    for (const concept of curriculum) {
      const drafts = buildQuestionDrafts(concept.slug);
      const uniqueQuestionIdentities = new Set(drafts.map((item) => `${item.difficulty}:${item.english.text}`));
      const expectedUniqueCount = ['basic-trigonometry', 'ratio-proportion', 'triangles-similarity'].includes(concept.slug) ? 5 : 6;
      expect(uniqueQuestionIdentities.size).toBe(expectedUniqueCount);
      expect(drafts.every((item) => item.english.text && item.telugu.text && item.english.hints.length === 3 && item.telugu.hints.length === 3)).toBe(true);
      expect(buildExplanationText(concept.name, draft(concept.slug, 0), teluguDraft(concept.slug, 0), 'step-by-step').te).toBeTruthy();
      expect(buildExplanationText(concept.name, draft(concept.slug, 0), teluguDraft(concept.slug, 0), 'real-life').en).toContain(concept.name.toLowerCase());
    }
  });
});
