const buildLoosePattern = (title) => {
  const escaped = title
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
  return new RegExp(escaped, 'i');
};

/**
 * Check whether a field label appears to have a value after it.
 */
const fieldHasValue = (text, label) => {
  const lowerText = text.toLowerCase();
  const lowerLabel = label.toLowerCase();
  let start = 0;

  while (start < lowerText.length) {
    const idx = lowerText.indexOf(lowerLabel, start);
    if (idx === -1) break;

    const window = text.slice(idx, idx + 300).replace(/\s+/g, ' ');
    if (/:\s*.{3,}/.test(window)) return true;

    start = idx + lowerLabel.length;
  }

  return false;
};

/**
 * Detect compliance issues based on the active template's structure.
 *
 * @param {string} text             
 * @param {object} templateMetadata 
 *   {
 *     sections: string[],
 *     requiredFields: string[],
 *   }
 * @returns {Array} errors
 */
const detect = (text, templateMetadata = {}) => {
  const errors = [];
  const { sections = [], requiredFields = [] } = templateMetadata;

  // --- Section checks ---
  for (const section of sections) {
    if (!section || section.length < 3) continue;

    const pattern = buildLoosePattern(section);
    if (!pattern.test(text)) {
      errors.push({
        type: 'compliance',
        severity: 'medium',
        message: `Template section "${section}" not found in report`,
        location: { section: 'Document Structure' },
        suggestion: `Add a section titled "${section}" as required by the active template`,
        originalText: section,
      });
    }
  }

  // --- Required field checks ---
  for (const field of requiredFields) {
    if (!field || field.length < 3) continue;

    const pattern = buildLoosePattern(field);
    if (!pattern.test(text)) {
      errors.push({
        type: 'compliance',
        severity: 'medium',
        message: `Required field "${field}" is missing from report`,
        location: { section: 'Document Fields' },
        suggestion: `Include the field "${field}" as required by the active template`,
        originalText: field,
      });
    } else if (!fieldHasValue(text, field)) {
      errors.push({
        type: 'compliance',
        severity: 'low',
        message: `Required field "${field}" appears to be empty`,
        location: { section: 'Document Fields' },
        suggestion: `Provide a value for the field "${field}"`,
        originalText: field,
      });
    }
  }

  return errors;
};

module.exports = { detect };
