const mongoose = require('mongoose');
const User = require('../models/User');
const Team = require('../models/Team');
const Report = require('../models/Report');
require('dotenv').config();

const demoEmails = [
  'sarah.johnson@qcchecker.com',
  'michael.chen@qcchecker.com',
  'emily.davis@qcchecker.com',
  'james.wilson@qcchecker.com',
  'lisa.anderson@qcchecker.com',
  'robert.martinez@qcchecker.com',
  'jennifer.taylor@qcchecker.com',
  'david.brown@qcchecker.com',
  'amanda.white@qcchecker.com',
  'christopher.lee@qcchecker.com',
];

const clearDemo = async () => {
  try {
    console.log('🧹 Clearing demo data...\n');

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    // Get demo user IDs
    const demoUsers = await User.find({ email: { $in: demoEmails } }).select('_id');
    const demoUserIds = demoUsers.map((u) => u._id);

    // Delete reports by demo users
    const reportResult = await Report.deleteMany({ analyzedBy: { $in: demoUserIds } });
    console.log(`✓ Deleted ${reportResult.deletedCount} demo reports`);

    // Delete teams
    const teamResult = await Team.deleteMany({ name: { $in: ['North Team', 'South Team'] } });
    console.log(`✓ Deleted ${teamResult.deletedCount} demo teams`);

    // Delete demo users
    const userResult = await User.deleteMany({ email: { $in: demoEmails } });
    console.log(`✓ Deleted ${userResult.deletedCount} demo users`);

    console.log('\n✅ Demo data cleared successfully!\n');
    console.log('You can now run: node utils/seedDemo.js\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error clearing demo data:', error);
    process.exit(1);
  }
};

clearDemo();
