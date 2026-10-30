import './load-env.js';
import mongoose from 'mongoose';
import argon2 from 'argon2';
import { z } from 'zod';
import { User } from './models.js';

const input = z.object({
  MONGODB_URI: z.string().min(1),
  ADMIN_EMAIL: z.string().trim().email().max(254),
  ADMIN_NAME: z.string().trim().min(2).max(100),
  ADMIN_PASSWORD: z.string().min(12).max(128),
}).safeParse(process.env);
if (!input.success) throw new Error('Set MONGODB_URI, ADMIN_EMAIL, ADMIN_NAME, and a 12+ character ADMIN_PASSWORD in the root .env before provisioning an administrator.');

await mongoose.connect(input.data.MONGODB_URI);
try {
  const email = input.data.ADMIN_EMAIL.toLowerCase();
  const existing = await User.findOne({ email });
  if (existing && existing.role !== 'admin') throw new Error('ADMIN_EMAIL already belongs to a non-admin account. Choose a separate email.');
  const admin = await User.findOneAndUpdate(
    { email, role: 'admin' },
    { $set: { role: 'admin', name: input.data.ADMIN_NAME, email, passwordHash: await argon2.hash(input.data.ADMIN_PASSWORD), isActive: true, language: 'en', board: 'CBSE' } },
    { upsert: true, new: true, runValidators: true },
  );
  console.log(`Administrator account ready for ${admin.email}.`);
} finally {
  await mongoose.disconnect();
}
