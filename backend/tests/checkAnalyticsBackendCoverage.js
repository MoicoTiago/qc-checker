const fs = require('fs');
const path = require('path');

const threshold = 85;
const root = process.cwd();
const lcovPath = path.join(root, 'coverage', 'lcov.info');

const readLines = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8').split('\n');

const findNeedleRange = (relativePath, label, startNeedle, endNeedle) => {
  const lines = readLines(relativePath);
  const startIndex = lines.findIndex((line) => line.includes(startNeedle));
  const endIndex = lines.findIndex(
    (line, index) => index > startIndex && line.includes(endNeedle)
  );

  if (startIndex === -1 || endIndex === -1) {
    throw new Error(`Could not find ${label} in ${relativePath}`);
  }

  return {
    relativePath,
    label,
    startLine: startIndex + 1,
    endLine: endIndex,
  };
};

const ranges = [
  findNeedleRange(
    'routes/adminRoutes.js',
    'routes/adminRoutes.js:/api/admin/analytics analytics tab',
    "// GET /api/admin/analytics?level=company|team|user&teamId=xxx&userId=xxx&compareTeamId=xxx&compareUserId=xxx&range=7|30|90|all",
    "// GET /api/admin/users"
  ),
];

const lcov = fs.readFileSync(lcovPath, 'utf8');
const records = lcov.split('end_of_record');

const getRecord = (relativePath) => {
  const normalizedTarget = relativePath.replace(/\\/g, '/');

  return records.find((record) => {
    const sourceLine = record.split('\n').find((line) => line.startsWith('SF:'));
    return sourceLine && sourceLine.replace(/\\/g, '/').endsWith(normalizedTarget);
  });
};

let aggregateCovered = 0;
let aggregateTotal = 0;

ranges.forEach((range) => {
  const record = getRecord(range.relativePath);

  if (!record) {
    throw new Error(`Could not find ${range.relativePath} in coverage/lcov.info`);
  }

  const coverableLines = record
    .split('\n')
    .filter((line) => line.startsWith('DA:'))
    .map((line) => {
      const [lineNumber, hits] = line.slice(3).split(',').map(Number);
      return { lineNumber, hits };
    })
    .filter(
      ({ lineNumber }) =>
        lineNumber >= range.startLine && lineNumber <= range.endLine
    );

  if (!coverableLines.length) {
    throw new Error(`No coverable lines found for ${range.label}`);
  }

  const covered = coverableLines.filter(({ hits }) => hits > 0).length;
  const total = coverableLines.length;
  const percentage = (covered / total) * 100;

  aggregateCovered += covered;
  aggregateTotal += total;

  console.log(`${range.label}: ${percentage.toFixed(2)}% (${covered}/${total})`);
});

const aggregatePercentage =
  aggregateTotal > 0 ? (aggregateCovered / aggregateTotal) * 100 : 0;

console.log(
  `Backend analytics coverage: ${aggregatePercentage.toFixed(2)}% (${aggregateCovered}/${aggregateTotal} coverable lines)`
);

if (aggregatePercentage < threshold) {
  throw new Error(
    `Backend analytics coverage ${aggregatePercentage.toFixed(2)}% is below the ${threshold}% threshold`
  );
}