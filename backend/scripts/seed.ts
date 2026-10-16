import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { readConfig } from '../src/config/env.js';
import { connectDatabase } from '../src/lib/database.js';
import { User } from '../src/models/User.js';
import { Task } from '../src/models/Task.js';

try {
  const config = readConfig();
  const email = z.email().parse(process.env.SEED_EMAIL).toLowerCase();
  const password = z
    .string()
    .min(12)
    .refine((v) => Buffer.byteLength(v) <= 72)
    .parse(process.env.SEED_PASSWORD);
  if (password.startsWith('replace-')) throw new Error('Replace example seed password');
  await connectDatabase(config.MONGODB_URI);
  await Promise.all([User.createIndexes(), Task.createIndexes()]);
  let user = await User.findOne({ email });
  if (!user)
    user = await User.create({
      name: 'Tài khoản Demo',
      email,
      passwordHash: await bcrypt.hash(password, 12),
    });
  const examples = [
    {
      title: 'Hoàn thành Dockerfile',
      description: 'Đóng gói API và frontend, kiểm tra healthcheck.',
      priority: 'high',
      days: 1,
    },
    {
      title: 'Kiểm thử bảo vệ dữ liệu cá nhân',
      description: 'Xác nhận tài khoản A không truy cập công việc của tài khoản B.',
      priority: 'high',
      days: 2,
    },
    {
      title: 'Chuẩn bị tài liệu triển khai AWS',
      description: 'Ghi lại cấu hình EC2, Atlas và CloudWatch.',
      priority: 'medium',
      days: 3,
    },
    {
      title: 'Đọc yêu cầu project Cloud Computing',
      description: 'Chốt phạm vi và lập kế hoạch P0.',
      priority: 'low',
      days: -1,
      completed: true,
    },
    {
      title: 'Cập nhật checklist dự án',
      description: 'Ghi nhận các bước đã kiểm thử.',
      priority: 'medium',
      days: -2,
    },
  ];
  for (const example of examples) {
    await Task.updateOne(
      { userId: user._id, title: example.title },
      {
        $setOnInsert: {
          userId: user._id,
          title: example.title,
          description: example.description,
          priority: example.priority,
          status: example.completed ? 'completed' : 'pending',
          dueAt: new Date(Date.now() + example.days * 86_400_000),
          completedAt: example.completed ? new Date() : null,
        },
      },
      { upsert: true },
    );
  }
  console.log('Demo data ready. Existing tasks and passwords were preserved.');
} catch {
  console.error(
    'Seed failed. Check database access, SEED_EMAIL and SEED_PASSWORD (12+ characters).',
  );
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
