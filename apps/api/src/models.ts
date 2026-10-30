import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const options = { timestamps: true, versionKey: false as const };
const SchoolSchema = new Schema({ name: { type: String, required: true, trim: true }, board: { type: String, enum: ['CBSE', 'TELANGANA_SCERT'], default: 'CBSE' } }, options);
export const School = mongoose.model('School', SchoolSchema);

const ClassSchema = new Schema({ name: { type: String, required: true }, code: { type: String, required: true, uppercase: true, unique: true, index: true }, teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true }, schoolId: { type: Schema.Types.ObjectId, ref: 'School' }, classLevel: { type: Number, min: 6, max: 10, required: true }, board: { type: String, enum: ['CBSE', 'TELANGANA_SCERT'], default: 'CBSE' } }, options);
ClassSchema.index({ teacherId: 1, name: 1 }, { unique: true });
export const Classroom = mongoose.model('Classroom', ClassSchema);

const UserSchema = new Schema({ role: { type: String, enum: ['student', 'teacher', 'admin'], required: true, index: true }, name: { type: String, required: true, trim: true }, email: { type: String, lowercase: true, trim: true, sparse: true, unique: true }, passwordHash: String, pinHash: String, rollNo: String, classId: { type: Schema.Types.ObjectId, ref: 'Classroom', index: true }, language: { type: String, enum: ['en', 'te'], default: 'en' }, board: { type: String, enum: ['CBSE', 'TELANGANA_SCERT'], default: 'CBSE' }, classLevel: { type: Number, min: 6, max: 10 }, diagnosticCompletedAt: Date, lastActiveAt: Date, isActive: { type: Boolean, default: true } }, options);
UserSchema.index({ classId: 1, rollNo: 1 }, { unique: true, sparse: true });
export const User = mongoose.model('User', UserSchema);

const ConceptSchema = new Schema({ slug: { type: String, required: true, unique: true, index: true }, name: { type: String, required: true }, nameTe: { type: String, required: true }, classLevel: { type: Number, min: 6, max: 10, required: true }, chapters: { CBSE: String, TELANGANA_SCERT: String }, tags: [String] }, options);
export const Concept = mongoose.model('Concept', ConceptSchema);

const EdgeSchema = new Schema({ prerequisiteId: { type: Schema.Types.ObjectId, ref: 'Concept', required: true, index: true }, dependentId: { type: Schema.Types.ObjectId, ref: 'Concept', required: true, index: true } }, options);
EdgeSchema.index({ prerequisiteId: 1, dependentId: 1 }, { unique: true });
export const PrerequisiteEdge = mongoose.model('PrerequisiteEdge', EdgeSchema);

const QuestionSchema = new Schema({ conceptId: { type: Schema.Types.ObjectId, ref: 'Concept', required: true, index: true }, difficulty: { type: Number, min: 1, max: 5, required: true }, type: { type: String, enum: ['multiple-choice', 'numeric'], default: 'multiple-choice' }, text: { en: String, te: String }, options: [{ text: { en: String, te: String }, isCorrect: Boolean, misconceptionId: { type: Schema.Types.ObjectId, ref: 'Misconception' } }], answer: String, hints: [{ en: String, te: String }], expectedTimeSec: Number }, options);
QuestionSchema.index({ conceptId: 1, difficulty: 1 });
export const Question = mongoose.model('Question', QuestionSchema);

export const Misconception = mongoose.model('Misconception', new Schema({ slug: { type: String, unique: true }, text: { en: String, te: String }, conceptId: { type: Schema.Types.ObjectId, ref: 'Concept', index: true } }, options));
export const Explanation = mongoose.model('Explanation', new Schema({ conceptId: { type: Schema.Types.ObjectId, ref: 'Concept', required: true, index: true }, variant: { type: String, enum: ['step-by-step', 'real-life'], required: true }, text: { en: String, te: String }, checkQuestionId: { type: Schema.Types.ObjectId, ref: 'Question' } }, options));

const AttemptSchema = new Schema({ clientId: { type: String, required: true }, activityId: { type: String, required: true, index: true }, studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true }, questionId: { type: Schema.Types.ObjectId, ref: 'Question', required: true }, correct: { type: Boolean, required: true }, hintsUsed: { type: Number, min: 0, max: 3, default: 0 }, timeMs: Number, confidence: { type: String, enum: ['sure', 'unsure', 'guess'], required: true }, misconceptionId: { type: Schema.Types.ObjectId, ref: 'Misconception' }, mode: String, clientTimestamp: Date }, options);
AttemptSchema.index({ studentId: 1, clientId: 1 }, { unique: true });
AttemptSchema.index({ studentId: 1, activityId: 1, createdAt: 1 });
export const Attempt = mongoose.model('Attempt', AttemptSchema);

export const MasteryState = mongoose.model('MasteryState', new Schema({ studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true }, conceptId: { type: Schema.Types.ObjectId, ref: 'Concept', required: true }, mastery: { type: Number, min: 0, max: 1, default: 0 }, baselineMastery: { type: Number, min: 0, max: 1 }, confidence: { type: Number, min: 0, max: 1, default: 0 }, lastUpdated: Date, nextRevisionAt: Date }, options).index({ studentId: 1, conceptId: 1 }, { unique: true }));
export const DecisionLog = mongoose.model('DecisionLog', new Schema({ studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true }, conceptId: { type: Schema.Types.ObjectId, ref: 'Concept' }, activity: String, ruleId: String, reason: { en: String, te: String }, inputs: Schema.Types.Mixed }, options));
export const TeacherOverride = mongoose.model('TeacherOverride', new Schema({ teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true }, studentId: { type: Schema.Types.ObjectId, ref: 'User', index: true }, classId: { type: Schema.Types.ObjectId, ref: 'Classroom', index: true }, group: { type: String, enum: ['ready-to-advance', 'on-track', 'needs-basics'] }, conceptId: { type: Schema.Types.ObjectId, ref: 'Concept', required: true }, action: { type: String, enum: ['assign', 'lock', 'skip'], required: true }, activity: String, isActive: { type: Boolean, default: true } }, options));
TeacherOverride.schema.index({ teacherId: 1, classId: 1, conceptId: 1, studentId: 1, group: 1, isActive: 1 });
export const TeacherGroupPlan = mongoose.model('TeacherGroupPlan', new Schema({ teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true }, classId: { type: Schema.Types.ObjectId, ref: 'Classroom', required: true, index: true }, group: { type: String, enum: ['ready-to-advance', 'on-track', 'needs-basics'], required: true }, activity: { type: String, required: true }, approved: { type: Boolean, default: false }, updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true } }, options).index({ classId: 1, group: 1 }, { unique: true }));
export const Alert = mongoose.model('Alert', new Schema({ classId: { type: Schema.Types.ObjectId, ref: 'Classroom', index: true }, studentId: { type: Schema.Types.ObjectId, ref: 'User', index: true }, type: String, message: { en: String, te: String }, acknowledgedAt: Date }, options));
export const Worksheet = mongoose.model('Worksheet', new Schema({ teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true }, classId: { type: Schema.Types.ObjectId, ref: 'Classroom', required: true, index: true }, group: { type: String, enum: ['ready-to-advance', 'on-track', 'needs-basics'] }, conceptIds: [{ type: Schema.Types.ObjectId, ref: 'Concept' }], questionIds: [{ type: Schema.Types.ObjectId, ref: 'Question' }], language: { type: String, enum: ['en', 'te'], default: 'en' } }, options));
export const StreakState = mongoose.model('StreakState', new Schema({ studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true }, current: { type: Number, default: 0 }, longest: { type: Number, default: 0 }, freezes: { type: Number, min: 0, max: 2, default: 0 }, lastActiveDate: String, history: [String] }, options));
export type UserDocument = InferSchemaType<typeof UserSchema>;
