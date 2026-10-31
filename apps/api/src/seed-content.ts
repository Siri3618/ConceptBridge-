import { curriculum } from '@conceptbridge/engine';
import { Concept, Explanation, Misconception, Question } from './models.js';

export interface Draft { text: string; answer: string; wrong: [string, string]; hints: [string, string, string]; }
export function teluguDraft(slug: string, n: number): Draft {
  const x = n + 1;
  const drafts: Record<string, Draft> = {
    'whole-numbers-place-value': { text: `${4_000 + x * 100 + 30} లో ${x % 2 ? '3' : '4'} అంకె విలువ ఎంత?`, answer: x % 2 ? '30' : '4000', wrong: [x % 2 ? '3' : '4', x % 2 ? '300' : '400'], hints: ['సంఖ్యలో ఆ అంకె ఏ స్థానంలో ఉందో చూడండి.', 'కుడి వైపు నుంచి ఒకట్లు, పదులు, వందలు, వేల స్థానాలు లెక్కించండి.', 'అంకె విలువ = అంకె ముఖ విలువ × స్థాన విలువ.'] },
    fractions: { text: `1/${x + 1} + 1/${x + 1} ఎంత?`, answer: `2/${x + 1}`, wrong: [`2/${2 * (x + 1)}`, `2/${x + 2}`], hints: ['హారాలు ఇప్పటికే సమానంగా ఉన్నాయి.', 'హారాన్ని అలాగే ఉంచి లవాలను కలపండి.', '1/d + 1/d = 2/d.'] },
    'decimals-percentages': { text: `50 లో ${x * 10}% ఎంత?`, answer: String(x * 5), wrong: [String(x * 10), String(x * 50)], hints: ['శాతం అంటే 100లో భాగం.', 'శాతాన్ని దశాంశంగా మార్చి 50తో గుణించండి.', `${x * 10}% × 50 = ${x * 10} ÷ 100 × 50 = ${x * 5}.`] },
    'integers-sign-rules': { text: `ఒక క్రికెట్ జట్టు ప్రతి ఓవర్‌లో ${x + 2} పరుగులు కోల్పోతుంది. రెండు ఓవర్లకు నష్టం ఎంత? (-${x + 2}) × (-2) కనుగొనండి.`, answer: String(2 * (x + 2)), wrong: [String(-2 * (x + 2)), String(x + 2 - 2)], hints: ['ఋణ సంఖ్యను ఋణ సంఖ్యతో గుణిస్తే ధన సంఖ్య వస్తుంది.', 'ముందుగా సంఖ్యల పరిమాణాలను గుణించండి.', `(${x + 2}) × 2 = ${2 * (x + 2)}; ఫలితం ధనం.`] },
    'ratio-proportion': { text: 'ఎరుపు, నీలం గోళీల నిష్పత్తి 2:3. ఎరుపు గోళీలు 8 ఉంటే నీలం గోళీలు ఎన్ని?', answer: '12', wrong: ['9', '6'], hints: ['2 నుంచి 8కి వెళ్లే గుణకాన్ని కనుగొనండి.', 'రెండు భాగాలనూ అదే సంఖ్యతో గుణించాలి.', 'గుణకం 4. కాబట్టి 3 × 4 = 12 నీలం గోళీలు.'] },
    'algebraic-expressions': { text: `x = ${x} అయితే 2x + 3 విలువ ఎంత?`, answer: String(2 * x + 3), wrong: [String(2 * (x + 3)), String(2 * x)], hints: ['x స్థానంలో ఇచ్చిన విలువను పెట్టండి.', '3ను కలపడానికి ముందు గుణించండి.', `2 × ${x} + 3 = ${2 * x} + 3 = ${2 * x + 3}.`] },
    'linear-equations': { text: `2x + 3 = ${2 * x + 3} ను పరిష్కరించి x విలువ కనుగొనండి.`, answer: String(x), wrong: [String(x + 3), String((2 * x + 3) / 2)], hints: ['రెండు వైపుల నుంచి 3 తీసివేయండి.', 'తర్వాత రెండు వైపులనూ 2తో భాగించండి.', `2x = ${2 * x}; కాబట్టి x = ${x}.`] },
    exponents: { text: `2^${x} × 2^2 ను సరళీకరించండి.`, answer: `2^${x + 2}`, wrong: [`2^${x * 2}`, `2^${x + 1}`], hints: ['రెండు ఘాతాల ఆధారం ఒకటే.', 'ఒకే ఆధారాలను గుణించినప్పుడు ఘాతాలను కలపండి.', `2^${x} × 2^2 = 2^(${x} + 2) = 2^${x + 2}.`] },
    factorisation: { text: `x² − ${x * x} ను కారణాంకాల రూపంలో రాయండి.`, answer: `(x − ${x})(x + ${x})`, wrong: [`(x − ${x})²`, `(x − ${x * x})(x + 1)`], hints: ['ఇది రెండు వర్గాల భేదం.', 'a² − b² = (a − b)(a + b) సూత్రాన్ని వాడండి.', `x² − ${x}² = (x − ${x})(x + ${x}).`] },
    'coordinate-geometry': { text: `(${x}, −${x}) బిందువు ఏ చతుర్భాగంలో ఉంటుంది?`, answer: 'Quadrant IV', wrong: ['Quadrant II', 'Quadrant III'], hints: ['x, y గుర్తులను పరిశీలించండి.', 'ధన x కుడివైపు; ఋణ y కిందికి సూచిస్తాయి.', '(+, −) బిందువు నాలుగో చతుర్భాగంలో ఉంటుంది.'] },
    'linear-equations-two-variables': { text: `y = 2x + 1 లో x = ${x} అయితే y ఎంత?`, answer: String(2 * x + 1), wrong: [String(x + 1), String(2 * x)], hints: ['ఇచ్చిన x విలువను ప్రతిక్షేపించండి.', 'xను 2తో గుణించి, 1 కలపండి.', `y = 2 × ${x} + 1 = ${2 * x + 1}.`] },
    polynomials: { text: `4x^${x} + 3x + 2 బహుపది డిగ్రీ ఎంత?`, answer: String(Math.max(x, 1)), wrong: ['3', '2'], hints: ['డిగ్రీ అంటే x యొక్క అత్యధిక ఘాతం.', 'వ్యక్తీకరణలోని అన్ని ఘాతాలను పోల్చండి.', `అత్యధిక ఘాతం ${Math.max(x, 1)}.`] },
    'quadratic-equations': { text: `x² − ${2 * x + 1}x + ${x * (x + 1)} = 0 కు మూలాలు ఏవి?`, answer: `${x} and ${x + 1}`, wrong: [`−${x} and ${x + 1}`, `${x} and −${x + 1}`], hints: ['స్థిర పదం గుణితఫలం వచ్చే రెండు సంఖ్యలను కనుగొనండి.', 'వాటి మొత్తం x గుణకానికి సరిపోవాలి.', `(x − ${x})(x − ${x + 1}) = 0; మూలాలు ${x}, ${x + 1}.`] },
    'triangles-similarity': { text: 'సదృశ త్రిభుజాల భుజాల నిష్పత్తి 2:3. చిన్న భుజం 6 సెం.మీ. అయితే దానికి సరిపోలే పెద్ద భుజం ఎంత?', answer: '9 cm', wrong: ['7 cm', '12 cm'], hints: ['2 నుంచి 6కి మారే గుణకాన్ని కనుగొనండి.', 'సరిపోలే భుజాన్నీ అదే గుణకంతో గుణించండి.', 'గుణకం 3; కాబట్టి 3 × 3 = 9 సెం.మీ.'] },
    'basic-trigonometry': { text: 'sin 30° విలువ ఎంత?', answer: '1/2', wrong: ['√3/2', '1'], hints: ['లంబకోణ త్రిభుజంలో 30° భుజ నిష్పత్తిని గుర్తు చేసుకోండి.', 'sin θ = ఎదురుభుజం ÷ కర్ణం.', 'sin 30° = 1/2.'] },
  };
  return drafts[slug]!;
}
export function draft(slug: string, n: number): Draft {
  const x = n + 1;
  switch (slug) {
    case 'whole-numbers-place-value': return { text: `In ${4_000 + x * 100 + 30}, what is the value of the digit ${x % 2 ? '3' : '4'}?`, answer: x % 2 ? '30' : '4000', wrong: [x % 2 ? '3' : '4', x % 2 ? '300' : '400'], hints: ['Look at the digit’s position in the number.', 'Count places from the right: ones, tens, hundreds, thousands.', 'A digit’s value is its face value multiplied by its place value.'] };
    case 'fractions': return { text: `What is 1/${x + 1} + 1/${x + 1}?`, answer: `2/${x + 1}`, wrong: [`2/${2 * (x + 1)}`, `2/${x + 2}`], hints: ['The denominators are already the same.', 'Keep the denominator and add the numerators.', '1/d + 1/d = 2/d.'] };
    case 'decimals-percentages': return { text: `What is ${x * 10}% of 50?`, answer: String(x * 5), wrong: [String(x * 10), String(x * 50)], hints: ['Percent means “out of 100”.', 'Convert the percentage to a decimal and multiply by 50.', `${x * 10}% of 50 = ${x * 10} ÷ 100 × 50 = ${x * 5}.`] };
    case 'integers-sign-rules': return { text: `A cricket team loses ${x + 2} runs in each of 2 overs. What is (-${x + 2}) × (-2)?`, answer: String(2 * (x + 2)), wrong: [String(-2 * (x + 2)), String(x + 2 - 2)], hints: ['A negative times a negative is positive.', 'Multiply the absolute values first.', `(${x + 2}) × 2 = ${2 * (x + 2)}, and the sign is positive.`] };
    case 'ratio-proportion': return { text: `The ratio of red to blue marbles is 2:3. If there are 8 red marbles, how many blue marbles are there?`, answer: '12', wrong: ['9', '6'], hints: ['Compare the scale factor from 2 to 8.', 'Each part is multiplied by the same number.', 'The scale factor is 4, so 3 × 4 = 12 blue marbles.'] };
    case 'algebraic-expressions': return { text: `If x = ${x}, what is the value of 2x + 3?`, answer: String(2 * x + 3), wrong: [String(2 * (x + 3)), String(2 * x)], hints: ['Replace x with its value.', 'Multiply before adding 3.', `2 × ${x} + 3 = ${2 * x} + 3 = ${2 * x + 3}.`] };
    case 'linear-equations': return { text: `Solve 2x + 3 = ${2 * x + 3}.`, answer: String(x), wrong: [String(x + 3), String((2 * x + 3) / 2)], hints: ['Undo the +3 on both sides.', 'Then divide both sides by 2.', `2x = ${2 * x}; x = ${x}.`] };
    case 'exponents': return { text: `Simplify 2^${x} × 2^2.`, answer: `2^${x + 2}`, wrong: [`2^${x * 2}`, `2^${x + 1}`], hints: ['The bases are the same.', 'When multiplying like bases, add the exponents.', `2^${x} × 2^2 = 2^(${x} + 2) = 2^${x + 2}.`] };
    case 'factorisation': return { text: `Which is the factorised form of x² − ${x * x}?`, answer: `(x − ${x})(x + ${x})`, wrong: [`(x − ${x})²`, `(x − ${x * x})(x + 1)`], hints: ['This expression is a difference of two squares.', 'Use a² − b² = (a − b)(a + b).', `x² − ${x}² = (x − ${x})(x + ${x}).`] };
    case 'coordinate-geometry': return { text: `In which quadrant is the point (${x}, −${x})?`, answer: 'Quadrant IV', wrong: ['Quadrant II', 'Quadrant III'], hints: ['Check the signs of x and y.', 'Positive x is right; negative y is down.', 'A point (+, −) lies in Quadrant IV.'] };
    case 'linear-equations-two-variables': return { text: `For y = 2x + 1, what is y when x = ${x}?`, answer: String(2 * x + 1), wrong: [String(x + 1), String(2 * x)], hints: ['Substitute the given x value.', 'Multiply x by 2, then add 1.', `y = 2 × ${x} + 1 = ${2 * x + 1}.`] };
    case 'polynomials': return { text: `What is the degree of the polynomial 4x^${x} + 3x + 2?`, answer: String(Math.max(x, 1)), wrong: ['3', '2'], hints: ['The degree is the greatest exponent of x.', 'Compare all the powers in the expression.', `The greatest exponent is ${Math.max(x, 1)}.`] };
    case 'quadratic-equations': return { text: `Which pair solves x² − ${2 * x + 1}x + ${x * (x + 1)} = 0?`, answer: `${x} and ${x + 1}`, wrong: [`−${x} and ${x + 1}`, `${x} and −${x + 1}`], hints: ['Find two numbers whose product is the constant term.', 'Their sum should match the coefficient of x.', `The factors are (x − ${x})(x − ${x + 1}) = 0.`] };
    case 'triangles-similarity': return { text: `Similar triangles have side ratio 2:3. If the smaller side is 6 cm, what is the matching larger side?`, answer: '9 cm', wrong: ['7 cm', '12 cm'], hints: ['Find the scale factor from 2 to 6.', 'Multiply the matching side by that same scale factor.', `The scale factor is 3, so 3 × 3 = 9 cm.`] };
    default: return { text: 'What is sin 30°?', answer: '1/2', wrong: ['√3/2', '1'], hints: ['Use the side ratio for a 30° angle in a right triangle.', 'sin θ = opposite ÷ hypotenuse.', 'sin 30° = 1/2.'] };
  }
}

export function buildQuestionDrafts(slug: string) {
  return Array.from({ length: 6 }, (_, index) => ({ index, difficulty: (index % 5) + 1, english: draft(slug, index), telugu: teluguDraft(slug, index) }));
}

export function buildMisconceptionText(slug: string, index: number) {
  return {
    en: slug === 'integers-sign-rules' && index === 0 ? 'A negative multiplied by a negative is positive. The sign should be +, not −.' : slug === 'fractions' && index === 0 ? 'When adding fractions with the same denominator, add the numerators and keep the denominator.' : index === 0 ? 'Check which operation should happen first.' : 'Check the sign, place value, or unit in this step.',
    te: slug === 'integers-sign-rules' && index === 0 ? 'ఋణ సంఖ్యను మరో ఋణ సంఖ్యతో గుణిస్తే ధన సంఖ్య వస్తుంది. సంకేతం + కావాలి.' : 'ఈ దశలో సంకేతం, స్థాన విలువ లేదా క్రియను మళ్లీ పరిశీలించండి.',
  };
}

export function buildExplanationText(conceptName: string, english: Draft, telugu: Draft, variant: 'step-by-step' | 'real-life') {
  return variant === 'step-by-step'
    ? { en: `${conceptName}: ${english.hints[0]} ${english.hints[1]} ${english.hints[2]}`, te: `${telugu.hints[0]} ${telugu.hints[1]} ${telugu.hints[2]}` }
    : { en: `A kirana shop, cricket score, or rupee amount can make ${conceptName.toLowerCase()} easier to picture. ${english.hints[1]} Try the check question when you are ready.`, te: `కిరాణా దుకాణం, క్రికెట్ స్కోరు లేదా రూపాయల ఉదాహరణతో ఈ భావనను ఊహించండి. ${telugu.hints[1]} సిద్ధమైనప్పుడు చిన్న ప్రశ్నను ప్రయత్నించండి.` };
}

export async function seedLearningContent(): Promise<void> {
  const bySlug = new Map((await Concept.find().select('_id slug').lean()).map((item) => [item.slug, item._id]));
  for (const concept of curriculum) {
    const conceptId = bySlug.get(concept.slug);
    if (!conceptId) throw new Error(`Seed the concept graph before content: ${concept.slug}`);
    const misconceptionIds = [`${concept.slug}-error-a`, `${concept.slug}-error-b`];
    const misconceptionDocs = await Promise.all(misconceptionIds.map((slug, i) => Misconception.findOneAndUpdate({ slug }, {
      slug, conceptId, text: buildMisconceptionText(concept.slug, i),
    }, { upsert: true, new: true })));
    for (let i = 0; i < 6; i++) {
      const item = draft(concept.slug, i);
      const teItem = teluguDraft(concept.slug, i);
      const choices = [
        { text: { en: item.answer, te: teItem.answer }, isCorrect: true },
        { text: { en: item.wrong[0], te: teItem.wrong[0] }, isCorrect: false, misconceptionId: misconceptionDocs[0]!._id },
        { text: { en: item.wrong[1], te: teItem.wrong[1] }, isCorrect: false, misconceptionId: misconceptionDocs[1]!._id },
      ];
      const question = await Question.findOneAndUpdate({ conceptId, difficulty: (i % 5) + 1, 'text.en': item.text }, {
        conceptId, difficulty: (i % 5) + 1, type: 'multiple-choice', text: { en: item.text, te: teItem.text }, options: choices,
        answer: item.answer, expectedTimeSec: 45 + i * 10,
        hints: item.hints.map((hint, index) => ({ en: hint, te: teItem.hints[index]! })),
      }, { upsert: true, new: true });
      if (i === 0) {
        await Explanation.findOneAndUpdate({ conceptId, variant: 'step-by-step' }, { conceptId, variant: 'step-by-step', text: buildExplanationText(concept.name, item, teItem, 'step-by-step'), checkQuestionId: question._id }, { upsert: true, new: true });
        await Explanation.findOneAndUpdate({ conceptId, variant: 'real-life' }, { conceptId, variant: 'real-life', text: buildExplanationText(concept.name, item, teItem, 'real-life'), checkQuestionId: question._id }, { upsert: true, new: true });
      }
    }
  }
}
