const bcrypt = require('bcryptjs');
const User = require('../models/User');

const seedAdmin = async () => {
  try {
    const adminExists = await User.findOne({ role: 'admin' });
    
    if (!adminExists) {
      const salt = await bcrypt.genSalt(10);
      const hashedAdminPassword = await bcrypt.hash('Admin123!', salt);
      
      await User.create({
        name: 'System Admin',
        email: 'admin@qcchecker.com',
        password: hashedAdminPassword,
        role: 'admin',
        status: 'active',
        mustChangePassword: false,
      });
      
      console.log('Default admin created: admin@qcchecker.com / Admin123!');
    }

    const testUserExists = await User.findOne({ email: 'user@qcchecker.com' });
    
    if (!testUserExists) {
      const salt = await bcrypt.genSalt(10);
      const hashedUserPassword = await bcrypt.hash('Welcome123!', salt);
      
      await User.create({
        name: 'Test User',
        email: 'user@qcchecker.com',
        password: hashedUserPassword,
        role: 'user',
        status: 'active',
        mustChangePassword: true,
      });
      
      console.log('Test user created: user@qcchecker.com / Welcome123!');
    }

    const demoUserExists = await User.findOne({ email: 'demo@qcchecker.com' });
    
    if (!demoUserExists) {
      const salt = await bcrypt.genSalt(10);
      const hashedDemoPassword = await bcrypt.hash('Welcome123!', salt);
      
      await User.create({
        name: 'Demo User',
        email: 'demo@qcchecker.com',
        password: hashedDemoPassword,
        role: 'user',
        status: 'active',
        mustChangePassword: true,
      });
      
      console.log('Demo user created: demo@qcchecker.com / Welcome123!');
    }

  } catch (error) {
    console.error('Error seeding users:', error.message);
  }
};

module.exports = seedAdmin;
