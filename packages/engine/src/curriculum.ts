export interface CurriculumConcept {
  slug: string;
  name: string;
  nameTe: string;
  classLevel: 6 | 7 | 8 | 9 | 10;
  chapters: { CBSE: string; TELANGANA_SCERT: string };
  tags: string[];
}

export const curriculum: CurriculumConcept[] = [
  { slug: 'whole-numbers-place-value', name: 'Whole numbers & place value', nameTe: 'పూర్ణ సంఖ్యలు మరియు స్థాన విలువ', classLevel: 6, chapters: { CBSE: 'Knowing Our Numbers', TELANGANA_SCERT: 'Knowing Our Numbers' }, tags: ['number-sense', 'place-value'] },
  { slug: 'fractions', name: 'Fractions', nameTe: 'భిన్నాలు', classLevel: 6, chapters: { CBSE: 'Fractions', TELANGANA_SCERT: 'Fractions' }, tags: ['number-sense', 'fractions'] },
  { slug: 'decimals-percentages', name: 'Decimals & percentages', nameTe: 'దశాంశాలు మరియు శాతాలు', classLevel: 7, chapters: { CBSE: 'Fractions and Decimals; Comparing Quantities', TELANGANA_SCERT: 'Fractions and Decimals; Comparing Quantities' }, tags: ['number-sense', 'percentages'] },
  { slug: 'integers-sign-rules', name: 'Integers & sign rules', nameTe: 'పూర్ణాంకాలు మరియు గుర్తుల నియమాలు', classLevel: 7, chapters: { CBSE: 'Integers', TELANGANA_SCERT: 'Integers' }, tags: ['number-sense', 'signed-numbers'] },
  { slug: 'ratio-proportion', name: 'Ratio & proportion', nameTe: 'నిష్పత్తి మరియు అనుపాతం', classLevel: 7, chapters: { CBSE: 'Comparing Quantities', TELANGANA_SCERT: 'Comparing Quantities' }, tags: ['proportional-reasoning'] },
  { slug: 'algebraic-expressions', name: 'Algebraic expressions', nameTe: 'బీజగణిత వ్యక్తీకరణలు', classLevel: 8, chapters: { CBSE: 'Algebraic Expressions and Identities', TELANGANA_SCERT: 'Algebraic Expressions' }, tags: ['algebra', 'expressions'] },
  { slug: 'linear-equations', name: 'Linear equations', nameTe: 'రేఖీయ సమీకరణాలు', classLevel: 8, chapters: { CBSE: 'Linear Equations in One Variable', TELANGANA_SCERT: 'Linear Equations in One Variable' }, tags: ['algebra', 'equations'] },
  { slug: 'exponents', name: 'Exponents', nameTe: 'ఘాతాలు', classLevel: 8, chapters: { CBSE: 'Exponents and Powers', TELANGANA_SCERT: 'Exponents' }, tags: ['algebra', 'powers'] },
  { slug: 'factorisation', name: 'Factorisation', nameTe: 'కారణాంకాలు', classLevel: 8, chapters: { CBSE: 'Factorisation', TELANGANA_SCERT: 'Factorisation' }, tags: ['algebra', 'factors'] },
  { slug: 'coordinate-geometry', name: 'Coordinate geometry', nameTe: 'నిరూపక జ్యామితి', classLevel: 9, chapters: { CBSE: 'Coordinate Geometry', TELANGANA_SCERT: 'Coordinate Geometry' }, tags: ['geometry', 'coordinates'] },
  { slug: 'linear-equations-two-variables', name: 'Linear equations in two variables', nameTe: 'రెండు చరరాశులలో రేఖీయ సమీకరణాలు', classLevel: 9, chapters: { CBSE: 'Linear Equations in Two Variables', TELANGANA_SCERT: 'Linear Equations in Two Variables' }, tags: ['algebra', 'graphs'] },
  { slug: 'polynomials', name: 'Polynomials', nameTe: 'బహుపదులు', classLevel: 9, chapters: { CBSE: 'Polynomials', TELANGANA_SCERT: 'Polynomials' }, tags: ['algebra', 'polynomials'] },
  { slug: 'quadratic-equations', name: 'Quadratic equations', nameTe: 'వర్గ సమీకరణాలు', classLevel: 10, chapters: { CBSE: 'Quadratic Equations', TELANGANA_SCERT: 'Quadratic Equations' }, tags: ['algebra', 'quadratics'] },
  { slug: 'triangles-similarity', name: 'Triangles & similarity', nameTe: 'త్రిభుజాలు మరియు సదృశ్యత', classLevel: 10, chapters: { CBSE: 'Triangles', TELANGANA_SCERT: 'Similar Triangles' }, tags: ['geometry', 'similarity'] },
  { slug: 'basic-trigonometry', name: 'Basic trigonometry', nameTe: 'ప్రాథమిక త్రికోణమితి', classLevel: 10, chapters: { CBSE: 'Introduction to Trigonometry', TELANGANA_SCERT: 'Introduction to Trigonometry' }, tags: ['geometry', 'trigonometry'] },
];

/** Each edge points from a prerequisite toward the concept that depends on it. */
export const prerequisiteEdges: Array<{ prerequisite: string; dependent: string }> = [
  { prerequisite: 'whole-numbers-place-value', dependent: 'fractions' },
  { prerequisite: 'whole-numbers-place-value', dependent: 'decimals-percentages' },
  { prerequisite: 'whole-numbers-place-value', dependent: 'integers-sign-rules' },
  { prerequisite: 'fractions', dependent: 'decimals-percentages' },
  { prerequisite: 'fractions', dependent: 'ratio-proportion' },
  { prerequisite: 'decimals-percentages', dependent: 'ratio-proportion' },
  { prerequisite: 'integers-sign-rules', dependent: 'algebraic-expressions' },
  { prerequisite: 'ratio-proportion', dependent: 'algebraic-expressions' },
  { prerequisite: 'algebraic-expressions', dependent: 'linear-equations' },
  { prerequisite: 'algebraic-expressions', dependent: 'exponents' },
  { prerequisite: 'algebraic-expressions', dependent: 'factorisation' },
  { prerequisite: 'exponents', dependent: 'factorisation' },
  { prerequisite: 'linear-equations', dependent: 'linear-equations-two-variables' },
  { prerequisite: 'linear-equations-two-variables', dependent: 'coordinate-geometry' },
  { prerequisite: 'algebraic-expressions', dependent: 'polynomials' },
  { prerequisite: 'exponents', dependent: 'polynomials' },
  { prerequisite: 'factorisation', dependent: 'quadratic-equations' },
  { prerequisite: 'polynomials', dependent: 'quadratic-equations' },
  { prerequisite: 'ratio-proportion', dependent: 'triangles-similarity' },
  { prerequisite: 'triangles-similarity', dependent: 'basic-trigonometry' },
];
