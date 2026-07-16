/**
 * Formatting issue detector.
 *
 * Catches problems like empty brackets, repeated words, lorem-ipsum filler,
 * placeholder names/emails/phones, incomplete sentences, and sample/draft
 * markers that should have been removed before submission.
 */

const patterns = [
  {
    name: 'Empty parentheses',
    regex: /\(\s*\)/g,
    severity: 'medium',
    suggestion: 'Remove empty parentheses or add content',
  },
  {
    name: 'Empty square brackets',
    regex: /\[\s*\]/g,
    severity: 'medium',
    suggestion: 'Remove empty brackets or add content',
  },
  {
    name: 'Empty curly brackets',
    regex: /\{\s*\}/g,
    severity: 'medium',
    suggestion: 'Remove empty brackets or add content',
  },
  {
    name: 'Multiple consecutive punctuation',
    regex: /[.!?]{3,}/g,
    severity: 'low',
    suggestion: 'Remove duplicate punctuation',
  },
  {
    name: 'Repeated words',
    regex: /\b(\w{3,})\s+\1\b/gi,
    severity: 'low',
    suggestion: 'Remove duplicate word',
  },
  {
    name: 'Lorem ipsum text',
    regex: /\blorem ipsum\b/gi,
    severity: 'high',
    suggestion: 'Replace placeholder text with actual content',
  },
  {
    name: 'Sample/example marker',
    regex: /\b(SAMPLE|EXAMPLE|DRAFT|TEST)\s+(TEXT|CONTENT|DATA|DOCUMENT|REPORT)\b/gi,
    severity: 'high',
    suggestion: 'Replace with actual content',
  },
  {
    name: 'Placeholder name',
    regex: /\b(John|Jane)\s+(Doe|Smith)\b/gi,
    severity: 'medium',
    suggestion: 'Replace placeholder name with actual name',
  },
  {
    name: 'Generic email placeholder',
    regex: /\b(example|test|sample|your|name)@(example|test|domain)\.(com|org|co\.uk)\b/gi,
    severity: 'medium',
    suggestion: 'Replace with actual email address',
  },
  {
    name: 'Generic phone placeholder',
    regex: /\b(0{4,}|1234567890|0123456789|0000000000)\b/g,
    severity: 'medium',
    suggestion: 'Replace with actual phone number',
  },
  {
    name: 'Incomplete sentence ending',
    regex: /\b(and|or|the|a|an|to|for|with|of|in|on|at|by)\s*[.!?]?\s*$/gm,
    severity: 'low',
    suggestion: 'Complete the sentence',
  },
  {
    name: 'Double dash placeholder',
    regex: /\s--\s/g,
    severity: 'low',
    suggestion: 'Replace dash placeholder with actual content',
  },
  {
    name: 'Hash placeholder',
    regex: /#{3,}/g,
    severity: 'medium',
    suggestion: 'Replace hash placeholder with actual content',
    captureAll: true,
  },
];

/**
 * Scan document text for formatting issues.
 *
 * Iterates every pattern over the full text, caps matches per pattern,
 * and returns error objects with location data.
 *
 * @param {string} text - Full document text.
 * @returns {Array<{type: string, severity: string, message: string,
 *   location: {section: string, lineStart: number}, suggestion: string,
 *   originalText: string}>}
 */
const detect = (text) => {
  const errors = [];
  const lines = text.split('\n');

  patterns.forEach((pattern) => {
    let match;
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let matchCount = 0;
    const maxMatches = pattern.captureAll ? 200 : 20;

    while ((match = regex.exec(text)) !== null) {
      matchCount++;

      if (matchCount > maxMatches) {
        continue;
      }

      const beforeMatch = text.substring(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const section = findSection(lines, lineNumber);

      errors.push({
        type: 'formatting',
        severity: pattern.severity,
        message: pattern.name,
        location: {
          section: section,
          lineStart: lineNumber,
        },
        suggestion: pattern.suggestion,
        originalText: match[0].substring(0, 50),
      });
    }
  });

  return errors;
};

const findSection = (lines, lineNumber) => {
  for (let i = lineNumber - 1; i >= 0; i--) {
    const line = lines[i];
    if (/^\d+\.(\d+\.?)?\s+[A-Z]/.test(line)) {
      return line.trim().substring(0, 50);
    }
  }
  return 'Document';
};

module.exports = {
  detect,
  patterns,
};
