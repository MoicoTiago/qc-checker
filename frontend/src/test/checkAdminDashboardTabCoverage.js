import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourcePath = path.join(root, 'src', 'pages', 'AdminDashboard.jsx');
const lcovPath = path.join(root, 'coverage', 'lcov.info');

const sourceLines = fs.readFileSync(sourcePath, 'utf8').split('\n');
const lcov = fs.readFileSync(lcovPath, 'utf8');
const records = lcov.split('end_of_record');
const adminRecord = records.find((record) => {
  const sourceLine = record.split('\n').find((line) => line.startsWith('SF:'));
  return sourceLine && sourceLine.replace(/\\/g, '/').endsWith('src/pages/AdminDashboard.jsx');
});

if (!adminRecord) {
  throw new Error('Could not find AdminDashboard.jsx in coverage/lcov.info');
}

const lcovLines = adminRecord
  .split('\n')
  .filter((line) => line.startsWith('DA:'))
  .map((line) => {
    const [lineNumber, hits] = line.slice(3).split(',').map(Number);
    return { lineNumber, hits };
  });

const lcovBranches = adminRecord
  .split('\n')
  .filter((line) => line.startsWith('BRDA:'))
  .map((line) => {
    const [lineNumber, block, branch, hits] = line.slice(5).split(',');
    return {
      lineNumber: Number(lineNumber),
      block: Number(block),
      branch: Number(branch),
      hits: hits === '-' ? 0 : Number(hits),
    };
  });

const getTabRange = (label, lineThreshold, branchThreshold, startNeedle, endNeedle) => {
  const startIndex = sourceLines.findIndex((line) => line.includes(startNeedle));
  const endIndex = sourceLines.findIndex(
    (line, index) => index > startIndex && line.includes(endNeedle)
  );

  if (startIndex === -1 || endIndex === -1) {
    throw new Error(`Could not find the ${label} tab block in AdminDashboard.jsx`);
  }

  return {
    label,
    lineThreshold,
    branchThreshold,
    startLine: startIndex + 1,
    endLine: endIndex,
  };
};

const checkLineRange = ({ label, lineThreshold, startLine, endLine }) => {
  const coveredLines = lcovLines.filter(
    ({ lineNumber }) => lineNumber >= startLine && lineNumber <= endLine
  );

  const total = coveredLines.length;
  const covered = coveredLines.filter(({ hits }) => hits > 0).length;
  const percentage = total > 0 ? (covered / total) * 100 : 0;

  console.log(
    `${label} tab line coverage: ${percentage.toFixed(2)}% (${covered}/${total} coverable lines, threshold ${lineThreshold}%)`
  );

  if (percentage < lineThreshold) {
    throw new Error(
      `${label} tab line coverage ${percentage.toFixed(2)}% is below the ${lineThreshold}% threshold`
    );
  }
};

const checkBranchRange = ({ label, branchThreshold, startLine, endLine }) => {
  const coveredBranches = lcovBranches.filter(
    ({ lineNumber }) => lineNumber >= startLine && lineNumber <= endLine
  );

  if (!coveredBranches.length) {
    throw new Error(`No branch coverage entries found for the ${label} tab block`);
  }

  const total = coveredBranches.length;
  const covered = coveredBranches.filter(({ hits }) => hits > 0).length;
  const percentage = total > 0 ? (covered / total) * 100 : 0;

  console.log(
    `${label} tab branch coverage: ${percentage.toFixed(2)}% (${covered}/${total} branches, threshold ${branchThreshold}%)`
  );

  if (percentage < branchThreshold) {
    throw new Error(
      `${label} tab branch coverage ${percentage.toFixed(2)}% is below the ${branchThreshold}% threshold`
    );
  }
};

[
  getTabRange('Manage', 100, 100, "activeTab === 'manage'", "activeTab === 'reports'"),
  getTabRange('Reports', 100, 100, "activeTab === 'reports'", "activeTab === 'training'"),
  getTabRange('Teams', 100, 87, "activeTab === 'teams'", "activeTab === 'security'"),
  getTabRange('Security', 80, 80, "{activeTab === 'security' && (", "showCreateUserModal"),
].forEach((range) => {
  checkLineRange(range);
  checkBranchRange(range);
});
