// Lightweight coverage guard for users routes and Users-tab presence.
const fs = require('fs');
const path = require('path');

const adminRoutesPath = path.resolve(__dirname, '../routes/adminRoutes.js');

const dashboardPath = path.resolve(__dirname, '../../frontend/src/pages/AdminDashboard.jsx');

const adminRoutesSource = fs.readFileSync(adminRoutesPath, 'utf8');

const requiredRoutes = [
  { name: 'GET /api/admin/users', pattern: /router\.get\(\s*['"]\/users['"]/ },
  { name: 'DELETE /api/admin/users/:id', pattern: /router\.delete\(\s*['"]\/users\/:id['"]/ },
  { name: 'PATCH /api/admin/users/:id/status', pattern: /router\.patch\(\s*['"]\/users\/:id\/status['"]/ },
];

const missing = requiredRoutes
  .filter((item) => !item.pattern.test(adminRoutesSource))
  .map((item) => item.name);

if (fs.existsSync(dashboardPath)) {
  const dashboardSource = fs.readFileSync(dashboardPath, 'utf8');
  const dashboardChecks = [
    { name: 'Users tab id', pattern: /id:\s*['"]users['"]/i },
    { name: 'Users tab label', pattern: /label:\s*['"]Users['"]/i },
    { name: 'User Management section', pattern: /User Management/i },
  ];

  missing.push(
    ...dashboardChecks
      .filter((item) => !item.pattern.test(dashboardSource))
      .map((item) => item.name)
  );
}

if (missing.length) {
  console.error('Missing Users coverage:', missing.join(', '));
  process.exit(1);
}

console.log('Users backend coverage OK');