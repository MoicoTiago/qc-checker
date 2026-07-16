/**
 * This analyses the extracted text of a report template added for training the ai
 * to validate reports submitted to qc against the newly added template.
 */

// Reused placeholder patterns understood by placeholderDetector
const PLACEHOLDER_PATTERNS = [
  /\[([A-Z][A-Z0-9 _/\\-]{1,60})\]/g,          // [UPPERCASE]
  /\[INSERT\s+[^\]]{1,80}\]/gi,                   // [INSERT ...]
  /\[DESCRIPTION[^\]]{0,80}\]/gi,                 // [DESCRIPTION ...]
  /<([A-Z][A-Z0-9 _-]{1,60})>/g,                 // <UPPERCASE>
  /\{([A-Z][A-Z0-9 _-]{1,60})\}/g,               // {UPPERCASE}
  /\bXXX+\b/g,                                    // XXX
  /\bTBD\b|\bTBA\b|\bTBC\b/g,                    // TBD / TBA / TBC
  /\?\?\?+/g,                                     // ???
];

// Patterns that indicate a section heading in the extracted text.
const SECTION_HEADING_PATTERNS = [
  /^\d+\.?\s+[A-Z][A-Za-z\s\-&]{2,60}$/,         // "1. Section Name"
  /^\d+\.\d+\.?\s+[A-Z][A-Za-z\s\-&]{2,60}$/,    // "1.2 Sub-section"
  /^[A-Z][A-Z\s\-&]{4,60}:?\s*$/,                 // "ALL CAPS HEADING"
  /^Section\s+\d+[.:]\s*.{2,60}/i,                // "Section 3: ..."
];

// Pattern to find lines that look like field labels with nothing after the colon.
const EMPTY_FIELD_PATTERN = /^([A-Z][A-Za-z0-9 '&/().,\-]{2,80}):\s*$/gm;

// Fragments that, if found in a field label, suggest it's not a user-filled field
const IGNORE_FIELD_LABEL_FRAGMENTS = [
  'contents', 'version', 'copyright', 'page', 'appendix', 'revision',
  'date of issue', 'document control', 'table of',
];

/**
 * This will decide whether a field-label line should be ignored.
 * @param {string} label
 * @returns {boolean}
 */
const shouldIgnoreLabel = (label) => {
  const lower = label.toLowerCase();
  return IGNORE_FIELD_LABEL_FRAGMENTS.some((fragment) => lower.includes(fragment));
};

/**
 * Extract section titles from the template text.
 * Returns an array of unique, trimmed section title strings.
 * @param {string} text
 * @returns {string[]}
 */
const extractTemplateSections = (text) => {
  const lines = text.split('\n');
  const sections = new Set();

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.length > 120) continue;

    for (const pattern of SECTION_HEADING_PATTERNS) {
      if (pattern.test(line)) {
        const normalised = line
          .replace(/^\d+(\.\d+)*\.?\s+/, '')
          .replace(/:$/, '')
          .trim();
        if (normalised.length >= 3) {
          sections.add(normalised);
        }
        break;
      }
    }
  }

  return Array.from(sections);
};

/**
 * Extract required field labels — lines like "Visit Date:" with nothing after.
 * @param {string} text
 * @returns {string[]}
 */
const extractRequiredFields = (text) => {
  const fields = new Set();
  let match;

  // Reset lastIndex since it reuses the global regex
  EMPTY_FIELD_PATTERN.lastIndex = 0;

  while ((match = EMPTY_FIELD_PATTERN.exec(text)) !== null) {
    const label = match[1].trim();
    if (label.length >= 3 && !shouldIgnoreLabel(label)) {
      fields.add(label);
    }
  }

  return Array.from(fields);
};

/**
 * Scan the template for unfilled placeholder text and return a deduplicated
 * list of the raw matched strings (up to 50).
 * @param {string} text
 * @returns {string[]}
 */
const extractPlaceholders = (text) => {
  const found = new Set();

  for (const pattern of PLACEHOLDER_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = re.exec(text)) !== null) {
      found.add(match[0]);
      if (found.size >= 50) break;
    }
    if (found.size >= 50) break;
  }

  return Array.from(found);
};

/**
 * Main entry point — given the full extracted text of a template PDF,
 * return a structured analysis object that can be stored in metadata.
 *
 * @param {string} text     
 * @param {object} pdfMeta  
 * @returns {object}
 */
const analyseTemplate = (text, pdfMeta = {}) => {
  const sections = extractTemplateSections(text);
  const requiredFields = extractRequiredFields(text);
  const detectedPlaceholders = extractPlaceholders(text);

  const pdfSections = (pdfMeta.sections || []).map((s) =>
    typeof s === 'object' ? s.title : s
  );
  const allSections = Array.from(new Set([...sections, ...pdfSections])).filter(Boolean);

  return {
    documentType: 'template',
    pageCount: pdfMeta.pageCount || 0,
    sections: allSections,
    requiredFields,
    detectedPlaceholders,
    analysedAt: new Date().toISOString(),
  };
};

module.exports = { analyseTemplate };
