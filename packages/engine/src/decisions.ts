import { ENGINE_CONFIG } from './config.js';
import { DECISION_RULES } from './rules.js';
export type Activity = 'Learn' | 'Solve' | 'Test' | 'Revise' | 'Challenge';
export interface DecisionInput {
  conceptId: string;
  mastery: number;
  confidence: number;
  revisionDue?: boolean;
  recentErrors?: number;
  rewindTargetId?: string;
  teacherOverride?: { activity: Activity; conceptId?: string; locked?: boolean };
}
export interface EngineDecision { activity: Activity; conceptId: string; ruleId: string; reason: { en: string; te: string }; inputs: DecisionInput }
const reasons: Record<string, { en: string; te: string }> = {
  'teacher-override': { en: 'Your teacher set this activity for you.', te: 'మీ ఉపాధ్యాయుడు ఈ అభ్యాసాన్ని మీ కోసం ఎంచుకున్నారు.' },
  'revision-due': { en: 'A short review now can help this idea stay fresh.', te: 'ఈ చిన్న పునశ్చరణ ఈ భావనను గుర్తుంచుకోవడంలో సహాయపడుతుంది.' },
  'root-cause-rewind': { en: 'A related earlier idea needs practice first, so we’ll strengthen that step together.', te: 'సంబంధిత మునుపటి భావనకు ముందుగా సాధన అవసరం. దాన్ని కలిసి బలపరుద్దాం.' },
  'learn-low-mastery': { en: 'Let’s build this idea with a clear explanation before more practice.', te: 'మరింత సాధనకు ముందు స్పష్టమైన వివరణతో ఈ భావనను నేర్చుకుందాం.' },
  'learn-after-errors': { en: 'A different explanation may make the tricky step clearer.', te: 'మరో వివరణ ఈ కష్టమైన దశను స్పష్టంగా అర్థం చేసుకోవడంలో సహాయపడవచ్చు.' },
  'solve-practice': { en: 'A few guided questions can help this idea feel more familiar.', te: 'కొన్ని మార్గదర్శక ప్రశ్నలు ఈ భావనను మరింత పరిచయం చేస్తాయి.' },
  'test-confirmation': { en: 'You’re getting comfortable with this idea. Let’s check what you can do independently.', te: 'ఈ భావనపై మీకు నమ్మకం పెరుగుతోంది. మీరు స్వయంగా ఏమి చేయగలరో చూద్దాం.' },
  'challenge-mastery': { en: 'You have a strong foundation here. Try a new kind of problem.', te: 'ఈ భావనపై మీకు మంచి పట్టు ఉంది. కొత్త రకమైన ప్రశ్నను ప్రయత్నించండి.' },
};
const ruleReason = (id: string) => reasons[id]!;

export function decideNextActivity(input: DecisionInput): EngineDecision {
  let activity: Activity;
  let conceptId = input.conceptId;
  let ruleId: string;
  if (input.teacherOverride) {
    ({ activity } = input.teacherOverride);
    conceptId = input.teacherOverride.conceptId ?? input.conceptId;
    ruleId = 'teacher-override';
  } else if (input.revisionDue) { activity = 'Revise'; ruleId = 'revision-due'; }
  else if (input.rewindTargetId) { activity = 'Learn'; conceptId = input.rewindTargetId; ruleId = 'root-cause-rewind'; }
  else if (input.mastery < ENGINE_CONFIG.mastery.learnBelow) { activity = 'Learn'; ruleId = 'learn-low-mastery'; }
  else if ((input.recentErrors ?? 0) >= 2) { activity = 'Learn'; ruleId = 'learn-after-errors'; }
  else if (input.mastery < ENGINE_CONFIG.mastery.solveBelow) { activity = 'Solve'; ruleId = 'solve-practice'; }
  else if (input.mastery < ENGINE_CONFIG.mastery.challengeAt) { activity = 'Test'; ruleId = 'test-confirmation'; }
  else { activity = 'Challenge'; ruleId = 'challenge-mastery'; }
  return { activity, conceptId, ruleId, reason: ruleReason(ruleId), inputs: { ...input } };
}

export function listDecisionRules() { return DECISION_RULES; }
