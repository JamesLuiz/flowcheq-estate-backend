import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { UserSchema, UserRole } from '../src/users/schemas/user.schema';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/nestin_estate';

async function run() {
  try {
    console.log('Connecting to', MONGO_URI);
    await mongoose.connect(MONGO_URI);

    // Ensure model is registered using the same name as the app
    const UserModel = mongoose.models.User || mongoose.model('User', UserSchema);

    const email = 'jameseliezer116@gmail.com';
    const plainPassword = '09093117933Luiz';
    const name = 'ELiezer James';

    const existing: any = await UserModel.findOne({ email: email.toLowerCase() }).exec();

    const hashed = await bcrypt.hash(plainPassword, 10);

    if (existing) {
      console.log('User with email already exists. Updating to admin role and refreshing password...');
      existing.name = name;
      existing.role = UserRole.Admin as any;
      existing.password = hashed;
      existing.verified = true;
      await existing.save();
      console.log('Admin user updated.');
    } else {
      console.log('Creating new admin user...');
      const created = new UserModel({
        name,
        email: email.toLowerCase(),
        password: hashed,
        role: UserRole.Admin,
        verified: true,
      });

      await created.save();
      console.log('Admin user created.');
    }
  } catch (err) {
    console.error('Failed to create/update admin user:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
