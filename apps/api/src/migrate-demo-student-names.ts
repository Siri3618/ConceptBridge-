import './load-env.js';
import mongoose from 'mongoose';
import { Classroom, User } from './models.js';
import { demoStudentName } from './demo-students.js';

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('Set MONGODB_URI before migrating demo student names.');

await mongoose.connect(uri);
try {
  let matched = 0;
  let renamed = 0;
  const classes = await Classroom.find({ code: { $in: ['DEMO06', 'DEMO07', 'DEMO08', 'DEMO09', 'DEMO10'] } }).select('_id code').lean();
  for (const classroom of classes) {
    const count = classroom.code === 'DEMO10' ? 40 : 8;
    for (let roll = 1; roll <= count; roll++) {
      const rollNo = String(roll).padStart(2, '0');
      const result = await User.updateOne(
        { classId: classroom._id, role: 'student', rollNo },
        { $set: { name: demoStudentName(rollNo)! } },
      );
      matched += result.matchedCount;
      renamed += result.modifiedCount;
    }
  }
  console.log(`Demo student name migration complete: ${renamed} renamed of ${matched} existing students across ${classes.length} demo classes. Credentials and learning records were not changed.`);
} finally {
  await mongoose.disconnect();
}
