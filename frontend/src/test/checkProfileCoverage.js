import fs from 'node:fs';
import path from 'node:path';

const lineThreshold = 95;
const branchThreshold = 95;
const root = process.cwd();
const lcovPath = path.join(root, 'coverage', 'lcov.info');

const lcov = fs.readFileSync(lcovPath, 'utf8');
const records = lcov.split('end_of_record');
const profileRecord = records.find((record) => {
  const sourceLine = record.split('\n').find((line) => line.startsWith('SF:'));
  return sourceLine && sourceLine.replace(/\\/g, '/').endsWith('src/pages/Profile.jsx');
});

if (!profileRecord) {
  throw new Error('Could not find Profile.jsx in coverage/lcov.info');
}

const coverableLines = profileRecord
  .split('\n')
  .filter((line) => line.startsWith('DA:'))
  .map((line) => {
    const [lineNumber, hits] = line.slice(3).split(',').map(Number);
    return { lineNumber, hits };
  });

const coverableBranches = profileRecord
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

const lineTotal = coverableLines.length;
const lineCovered = coverableLines.filter(({ hits }) => hits > 0).length;
const linePercentage = lineTotal > 0 ? (lineCovered / lineTotal) * 100 : 0;

console.log(
  `Profile page line coverage: ${linePercentage.toFixed(2)}% (${lineCovered}/${lineTotal} coverable lines, threshold ${lineThreshold}%)`
);

if (linePercentage < lineThreshold) {
  throw new Error(
    `Profile page line coverage ${linePercentage.toFixed(2)}% is below the ${lineThreshold}% threshold`
  );
}

if (!coverableBranches.length) {
  throw new Error('No branch coverage entries found for Profile.jsx');
}

const branchTotal = coverableBranches.length;
const branchCovered = coverableBranches.filter(({ hits }) => hits > 0).length;
const branchPercentage = branchTotal > 0 ? (branchCovered / branchTotal) * 100 : 0;

console.log(
  `Profile page branch coverage: ${branchPercentage.toFixed(2)}% (${branchCovered}/${branchTotal} branches, threshold ${branchThreshold}%)`
);

if (branchPercentage < branchThreshold) {
  throw new Error(
    `Profile page branch coverage ${branchPercentage.toFixed(2)}% is below the ${branchThreshold}% threshold`
  );
}
