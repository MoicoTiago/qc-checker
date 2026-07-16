const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const Team = require('../models/Team');
const Report = require('../models/Report');
require('dotenv').config();

const DEFAULT_PASSWORD = 'Welcome123!';

const demoUsers = [
  // North Team
  { name: 'Sarah Johnson', email: 'sarah.johnson@qcchecker.com', team: 'north', role: 'team_leader' },
  { name: 'Michael Chen', email: 'michael.chen@qcchecker.com', team: 'north', role: 'user' },
  { name: 'Emily Davis', email: 'emily.davis@qcchecker.com', team: 'north', role: 'user' },
  { name: 'James Wilson', email: 'james.wilson@qcchecker.com', team: 'north', role: 'user' },
  { name: 'Lisa Anderson', email: 'lisa.anderson@qcchecker.com', team: 'north', role: 'user' },
  // South Team
  { name: 'Robert Martinez', email: 'robert.martinez@qcchecker.com', team: 'south', role: 'team_leader' },
  { name: 'Jennifer Taylor', email: 'jennifer.taylor@qcchecker.com', team: 'south', role: 'user' },
  { name: 'David Brown', email: 'david.brown@qcchecker.com', team: 'south', role: 'user' },
  { name: 'Amanda White', email: 'amanda.white@qcchecker.com', team: 'south', role: 'user' },
  { name: 'Christopher Lee', email: 'christopher.lee@qcchecker.com', team: 'south', role: 'user' },
];

const reportTemplates = [
  { filename: 'Site_Inspection_Report_001.pdf', type: 'inspection' },
  { filename: 'Quality_Assessment_Feb_2026.pdf', type: 'assessment' },
  { filename: 'Building_Compliance_Check.pdf', type: 'compliance' },
  { filename: 'Safety_Audit_Q1_2026.pdf', type: 'audit' },
  { filename: 'Structural_Analysis_Report.pdf', type: 'analysis' },
  { filename: 'Environmental_Impact_Study.pdf', type: 'environmental' },
  { filename: 'Fire_Safety_Inspection.pdf', type: 'safety' },
  { filename: 'Electrical_Systems_Review.pdf', type: 'electrical' },
  { filename: 'HVAC_Performance_Report.pdf', type: 'hvac' },
  { filename: 'Foundation_Assessment.pdf', type: 'foundation' },
  { filename: 'Roof_Condition_Survey.pdf', type: 'roof' },
  { filename: 'Plumbing_Inspection_Report.pdf', type: 'plumbing' },
  { filename: 'Accessibility_Compliance.pdf', type: 'accessibility' },
  { filename: 'Energy_Efficiency_Audit.pdf', type: 'energy' },
  { filename: 'Seismic_Evaluation.pdf', type: 'seismic' },
];

const errorMessages = {
  placeholder: [
    'Placeholder text found: [INSERT DATE]',
    'Unresolved placeholder: [XXXX]',
    'Template marker not removed: [COMPANY NAME]',
    'Placeholder detected: [INSERT ADDRESS]',
    'Missing value placeholder: [TBD]',
    'Unfilled field: [INSPECTOR NAME]',
  ],
  consistency: [
    'Date inconsistency: Header shows 2025, body shows 2026',
    'Building height differs: 45m vs 48m in different sections',
    'Floor count mismatch: 12 floors vs 14 floors',
    'Address inconsistent across document',
    'Project number varies between sections',
  ],
  compliance: [
    'Missing fire safety certification reference',
    'ADA compliance section incomplete',
    'Building code reference outdated (2018 vs 2024)',
    'Required inspection signature missing',
    'Permit number not verified',
    'Safety checklist item unchecked: Emergency exits',
    'Compliance certificate expiry date passed',
  ],
  formatting: [
    'Inconsistent date format: DD/MM/YYYY and MM-DD-YYYY mixed',
    'Section numbering skips from 3.2 to 3.5',
    'Table header misaligned',
    'Page numbers missing in appendix',
    'Font size inconsistent in headings',
  ],
  missing_data: [
    'Inspector signature not present',
    'Inspection date field empty',
    'Building owner information missing',
    'Square footage not specified',
    'Certificate number field blank',
    'Contact information incomplete',
  ],
};

const generateRandomErrors = () => {
  const errors = [];
  const errorTypes = ['placeholder', 'consistency', 'compliance', 'formatting', 'missing_data'];
  const numErrors = Math.floor(Math.random() * 8);

  for (let i = 0; i < numErrors; i++) {
    const type = errorTypes[Math.floor(Math.random() * errorTypes.length)];
    const messages = errorMessages[type];
    const message = messages[Math.floor(Math.random() * messages.length)];
    const severities = ['low', 'medium', 'high'];
    const severity = severities[Math.floor(Math.random() * severities.length)];

    errors.push({
      type,
      severity,
      message,
      location: {
        section: `Section ${Math.floor(Math.random() * 10) + 1}`,
        page: Math.floor(Math.random() * 20) + 1,
      },
      suggestion: `Review and correct: ${message.toLowerCase()}`,
    });
  }

  return errors;
};

const generateErrorSummary = (errors) => {
  const summary = {
    placeholder: 0,
    consistency: 0,
    compliance: 0,
    formatting: 0,
    missing_data: 0,
  };

  errors.forEach((error) => {
    if (summary[error.type] !== undefined) {
      summary[error.type] += 1;
    }
  });

  return summary;
};

const generateQualityAssessment = (errorCount) => {
  if (errorCount === 0) {
    return { label: 'good', confidence: 0.95, goodScore: 0.95, badScore: 0.05 };
  } else if (errorCount <= 2) {
    const roll = Math.random();
    if (roll > 0.3) {
      return { label: 'good', confidence: 0.75, goodScore: 0.75, badScore: 0.25 };
    }
    return { label: 'uncertain', confidence: 0.55, goodScore: 0.55, badScore: 0.45 };
  } else if (errorCount <= 4) {
    const roll = Math.random();
    if (roll > 0.5) {
      return { label: 'uncertain', confidence: 0.6, goodScore: 0.45, badScore: 0.55 };
    }
    return { label: 'bad', confidence: 0.7, goodScore: 0.3, badScore: 0.7 };
  } else {
    return { label: 'bad', confidence: 0.85, goodScore: 0.15, badScore: 0.85 };
  }
};

const getRandomDate = (daysAgo) => {
  const date = new Date();
  date.setDate(date.getDate() - Math.floor(Math.random() * daysAgo));
  date.setHours(Math.floor(Math.random() * 10) + 8);
  date.setMinutes(Math.floor(Math.random() * 60));
  return date;
};

const seedDemo = async () => {
  try {
    console.log('🌱 Starting demo data seed...\n');

    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    // Check if demo data already exists
    const existingTeam = await Team.findOne({ name: 'North Team' });
    if (existingTeam) {
      console.log('⚠️  Demo data already exists. To re-seed, please clear the database first.');
      console.log('   Run: node utils/clearDemo.js\n');
      process.exit(0);
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, salt);

    // Create users
    console.log('👥 Creating demo users...');
    const createdUsers = {};
    
    for (const userData of demoUsers) {
      const user = await User.create({
        name: userData.name,
        email: userData.email,
        password: hashedPassword,
        role: userData.role,
        status: 'active',
        mustChangePassword: false,
      });
      createdUsers[userData.email] = { ...user.toObject(), team: userData.team };
      console.log(`   ✓ Created: ${userData.name} (${userData.role})`);
    }

    // Get admin for team creation
    const admin = await User.findOne({ role: 'admin' });

    // Create North Team
    console.log('\n🏢 Creating teams...');
    const northMembers = Object.values(createdUsers)
      .filter((u) => u.team === 'north')
      .map((u) => u._id);
    const northLead = Object.values(createdUsers).find(
      (u) => u.team === 'north' && u.role === 'team_leader'
    );

    const northTeam = await Team.create({
      name: 'North Team',
      createdBy: admin._id,
      members: northMembers,
      teamLead: northLead._id,
    });
    console.log(`   ✓ Created: North Team (${northMembers.length} members)`);

    // Create South Team
    const southMembers = Object.values(createdUsers)
      .filter((u) => u.team === 'south')
      .map((u) => u._id);
    const southLead = Object.values(createdUsers).find(
      (u) => u.team === 'south' && u.role === 'team_leader'
    );

    const southTeam = await Team.create({
      name: 'South Team',
      createdBy: admin._id,
      members: southMembers,
      teamLead: southLead._id,
    });
    console.log(`   ✓ Created: South Team (${southMembers.length} members)`);

    // Generate reports for each user
    console.log('\n📄 Generating demo reports...');
    let totalReports = 0;

    for (const userData of Object.values(createdUsers)) {
      const numReports = Math.floor(Math.random() * 12) + 5; // 5-16 reports per user

      for (let i = 0; i < numReports; i++) {
        const template = reportTemplates[Math.floor(Math.random() * reportTemplates.length)];
        const errors = generateRandomErrors();
        const errorSummary = generateErrorSummary(errors);
        const qualityAssessment = generateQualityAssessment(errors.length);
        const createdAt = getRandomDate(60);

        await Report.create({
          filename: `${template.filename.replace('.pdf', '')}_${Date.now()}_${i}.pdf`,
          filePath: `uploads/demo-${Date.now()}-${i}.pdf`,
          fileSize: Math.floor(Math.random() * 5000000) + 500000,
          analyzedBy: userData._id,
          analyzedAt: createdAt,
          status: 'analyzed',
          errors,
          errorCount: errors.length,
          errorSummary,
          qualityAssessment,
          timeSaved: Math.floor(Math.random() * 45) + 5,
          extractedText: `Demo report content for ${template.filename}. This is simulated extracted text for demonstration purposes.`,
          metadata: {
            pageCount: Math.floor(Math.random() * 30) + 5,
            wordCount: Math.floor(Math.random() * 10000) + 2000,
            sections: ['Introduction', 'Methodology', 'Findings', 'Recommendations', 'Conclusion'],
          },
          createdAt,
          updatedAt: createdAt,
        });

        totalReports++;
      }

      console.log(`   ✓ Created ${numReports} reports for ${userData.name}`);
    }

    console.log('\n' + '='.repeat(50));
    console.log('✅ Demo data seeding complete!\n');
    console.log('📊 Summary:');
    console.log(`   • Users created: ${demoUsers.length}`);
    console.log(`   • Teams created: 2 (North Team, South Team)`);
    console.log(`   • Reports generated: ${totalReports}`);
    console.log('\n🔐 Login Credentials:');
    console.log('   Admin:');
    console.log('     Email: admin@qcchecker.com');
    console.log('     Password: Admin123!\n');
    console.log('   North Team Lead:');
    console.log('     Email: sarah.johnson@qcchecker.com');
    console.log('     Password: Welcome123!\n');
    console.log('   South Team Lead:');
    console.log('     Email: robert.martinez@qcchecker.com');
    console.log('     Password: Welcome123!\n');
    console.log('   All other users: Welcome123!');
    console.log('='.repeat(50) + '\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding demo data:', error);
    process.exit(1);
  }
};

seedDemo();
