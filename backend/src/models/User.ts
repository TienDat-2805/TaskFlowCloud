import { Schema, model } from 'mongoose';

const schema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true },
);
schema.index({ email: 1 }, { unique: true });

export const User = model('User', schema);
export function publicUser(user: { _id: unknown; name: string; email: string; createdAt: Date }) {
  return { id: String(user._id), name: user.name, email: user.email, createdAt: user.createdAt };
}
