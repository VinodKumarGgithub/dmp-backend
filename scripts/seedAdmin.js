require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { masterSequelize } = require('../config/db');
const { AdminUser } = require('../models/AdminUser');

 (async () => {
  try {
    await masterSequelize.authenticate();
    await AdminUser.sync();

    const username = process.env.ADMIN_USERNAME || 'admin';
    // Generate URL-safe random password if not provided via env
    const password = process.env.ADMIN_PASSWORD || "admin123";
    const passwordHash = await bcrypt.hash(password, 10);

    const [user, created] = await AdminUser.findOrCreate({
      where: { username },
      defaults: {
        username,
        password_hash: passwordHash,
        role: 'SUPER_ADMIN',
        organization_id: null,
        name: 'Super Admin',
        email: 'superadmin@example.com',
        phone_number: '1234567890',
        profile_picture: null,
        is_blocked: false,
        blocked_reason: null,
        blocked_at: null,
        createdon: new Date(),
        updatedon: new Date(),
      }
    });

    if (!created) {
      // update password if explicitly provided via env
      if (process.env.ADMIN_PASSWORD) {
        user.password_hash = passwordHash;
        await user.save();
        console.log(`✅ Updated password for admin '${username}'.`);
      } else {
        console.log(`ℹ️ Admin '${username}' already exists. Password unchanged.`);
      }
    } else {
      console.log(`✅ Created admin '${username}'.`);
    }

    if (!process.env.ADMIN_PASSWORD) {
      console.log('⚠️ A random password was generated. Store it securely:');
      console.log(password);
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to seed admin:', err.message);
    process.exit(1);
  }
})();


