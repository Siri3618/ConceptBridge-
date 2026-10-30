import './load-env.js';
import mongoose from 'mongoose';
import argon2 from 'argon2';
import { Classroom, School, User } from './models.js';
import { seedKnowledgeGraph } from './seed-graph.js';
import { seedLearningContent } from './seed-content.js';
import { seedTeacherDemoData } from './seed-teacher-demo.js';
import { demoStudentName } from './demo-students.js';

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('Set MONGODB_URI before seeding.');
await mongoose.connect(uri);
await seedKnowledgeGraph();
await seedLearningContent();
const school = await School.findOneAndUpdate({ name: 'ConceptBridge Demo School' }, { name: 'ConceptBridge Demo School', board: 'CBSE' }, { upsert: true, new: true });
const teacher = await User.findOneAndUpdate({ email: 'teacher@conceptbridge.demo' }, { role: 'teacher', name: 'Demo Teacher', email: 'teacher@conceptbridge.demo', passwordHash: await argon2.hash('LearnMath2026!'), language: 'en', board: 'CBSE', isActive: true }, { upsert: true, new: true });
const classroom = await Classroom.findOneAndUpdate({ code: 'DEMO10' }, { name: 'Class 10 Demo', code: 'DEMO10', teacherId: teacher._id, schoolId: school._id, classLevel: 10, board: 'CBSE' }, { upsert: true, new: true });
for (let i = 1; i <= 40; i++) {
  const rollNo = String(i).padStart(2, '0');
  await User.findOneAndUpdate(
    { classId: classroom._id, rollNo, role: 'student' },
    {
      $set: { name: demoStudentName(rollNo)! },
      $setOnInsert: {
        role: 'student', rollNo, classId: classroom._id,
        pinHash: await argon2.hash(String(1000 + i)),
        language: i % 5 === 0 ? 'te' : 'en', board: 'CBSE', classLevel: 10, isActive: true,
      },
    },
    { upsert: true },
  );
}
await seedTeacherDemoData(String(classroom._id));
for (const classLevel of [6, 7, 8, 9] as const) {
  const code = `DEMO${String(classLevel).padStart(2, '0')}`;
  const demoClass = await Classroom.findOneAndUpdate({ teacherId: teacher._id, name: `Class ${classLevel} Demo` }, { name: `Class ${classLevel} Demo`, code, teacherId: teacher._id, schoolId: school._id, classLevel, board: 'CBSE' }, { upsert: true, new: true });
  for (let i = 1; i <= 8; i++) {
    const rollNo = String(i).padStart(2, '0');
    await User.findOneAndUpdate(
      { classId: demoClass._id, rollNo, role: 'student' },
      {
        $set: { name: demoStudentName(rollNo)! },
        $setOnInsert: {
          role: 'student', rollNo, classId: demoClass._id,
          pinHash: await argon2.hash(`${classLevel}0${String(i).padStart(2, '0')}`),
          language: i % 5 === 0 ? 'te' : 'en', board: 'CBSE', classLevel, isActive: true,
        },
      },
      { upsert: true },
    );
  }
  await seedTeacherDemoData(String(demoClass._id), classLevel);
}
console.log('Demo users ready: teacher@conceptbridge.demo / LearnMath2026!; classes DEMO06-DEMO10; class 10 rolls 01-40 use PINs 1001-1040, and class 6-9 rolls 01-08 use PINs [class level]001-[class level]008.');
await mongoose.disconnect();
