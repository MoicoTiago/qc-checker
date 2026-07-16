/**
 * Placeholder / template-text detector.
 *
 * Finds text that was never filled in by the document author — bracketed
 * placeholders like [CLIENT NAME], runs of X or asterisks, date-format
 * stubs (DD/MM/YYYY), TBD markers, guidance notes, and similar patterns.
 */

/**
 * Each pattern entry has a `captureAll` flag: when true the regex will
 * collect ALL occurrences per line (up to a high cap), not just the first.
 */
const patterns = [
  // Square bracket placeholders
  {
    name: 'Square bracket placeholder',
    regex: /\[([A-Z][A-Za-z\s_/]{1,})\]/g,
    severity: 'high',
    suggestion: 'Replace placeholder with actual content',
    captureAll: true,
  },
  {
    name: 'Lowercase bracket placeholder',
    regex: /\[([a-z][a-z\s_]{2,})\]/g,
    severity: 'high',
    suggestion: 'Replace placeholder with actual content',
    captureAll: true,
  },
  
  // Time/Date placeholders
  {
    name: 'Time placeholder',
    regex: /\[00:00\]/g,
    severity: 'high',
    suggestion: 'Replace with actual time',
  },
  {
    name: 'Date placeholder pattern',
    regex: /\b(XX\/XX\/XXXX|DD\/MM\/YYYY|MM\/DD\/YYYY|dd\/mm\/yyyy|YYYY-MM-DD)\b/gi,
    severity: 'high',
    suggestion: 'Replace with actual date',
  },
  
  // X placeholders - IMPORTANT (uppercase)
  {
    name: 'XX placeholder',
    regex: /X{2,}/g,
    severity: 'high',
    suggestion: 'Replace XX with actual value',
    captureAll: true,
  },
  // x placeholders - IMPORTANT (lowercase)
  {
    name: 'xx placeholder',
    regex: /x{4,}/g,
    severity: 'high',
    suggestion: 'Replace xx with actual value',
    captureAll: true,
  },
  
  // Asterisk placeholders - IMPORTANT
  {
    name: 'Asterisk placeholder',
    regex: /\*{2,}/g,
    severity: 'high',
    suggestion: 'Replace asterisk placeholder with actual content',
    captureAll: true,
  },
  {
    name: 'Mixed asterisk and x placeholder',
    regex: /\*{2,}[xX'’\s]{0,6}\*{2,}/g,
    severity: 'high',
    suggestion: 'Replace placeholder mask with actual content',
    captureAll: true,
  },
  {
    name: 'Mixed x and asterisk placeholder',
    regex: /x{2,}[*'’\s]{0,6}x{2,}/gi,
    severity: 'high',
    suggestion: 'Replace placeholder mask with actual content',
    captureAll: true,
  },
  
  // Choice/Option placeholders
  {
    name: 'Choice placeholder',
    regex: /\[([A-Za-z\s]+)\s*\/\s*([A-Za-z\s]+)\]/g,
    severity: 'high',
    suggestion: 'Select one option and remove the others',
  },
  {
    name: 'Yes No NA choice',
    regex: /\b(Yes|No)\s*\/\s*(No|Yes)\s*(\/\s*N\/?A)?\b/g,
    severity: 'medium',
    suggestion: 'Select appropriate option',
  },
  
  // Delete/OR instructions
  {
    name: 'Delete instruction',
    regex: /\*+\s*DELETE[^*\n]*\**/gi,
    severity: 'high',
    suggestion: 'Remove this instruction text',
    captureAll: true,
  },
  {
    name: 'Delete as appropriate',
    regex: /\bdelete\s+(as\s+)?appropriate\b/gi,
    severity: 'high',
    suggestion: 'Delete the non-applicable options',
    captureAll: true,
  },
  {
    name: 'OR instruction',
    regex: /\*+\s*OR\s*\*+/gi,
    severity: 'high',
    suggestion: 'Remove OR instruction and keep only relevant section',
    captureAll: true,
  },
  
  // Template/Guidance text
  {
    name: 'Template instruction',
    regex: /The template text (?:for this section )?is:/gi,
    severity: 'high',
    suggestion: 'This appears to be template guidance - remove or replace',
  },
  {
    name: 'Section guidance - is to',
    regex: /This section is to [^.]{5,80}\./gi,
    severity: 'medium',
    suggestion: 'Replace guidance text with actual content',
  },
  {
    name: 'Section guidance - should',
    regex: /This section should [^.]{5,80}\./gi,
    severity: 'medium',
    suggestion: 'Replace guidance text with actual content',
  },
  {
    name: 'Section guidance - covers',
    regex: /This section covers [^.]{5,80}\./gi,
    severity: 'medium',
    suggestion: 'Replace guidance text with actual content',
  },
  {
    name: 'Section guidance - details',
    regex: /This section details [^.]{5,80}\./gi,
    severity: 'medium',
    suggestion: 'Replace guidance text with actual content',
  },
  {
    name: 'Section guidance - provides',
    regex: /This section provides [^.]{5,80}\./gi,
    severity: 'medium',
    suggestion: 'Replace guidance text with actual content',
  },
  {
    name: 'Section guidance - contains',
    regex: /This section contains [^.]{5,80}\./gi,
    severity: 'medium',
    suggestion: 'Replace guidance text with actual content',
  },
  {
    name: 'Section guidance - includes',
    regex: /This section includes [^.]{5,80}\./gi,
    severity: 'medium',
    suggestion: 'Replace guidance text with actual content',
  },
  {
    name: 'Section guidance - describes',
    regex: /This section describes [^.]{5,80}\./gi,
    severity: 'medium',
    suggestion: 'Replace guidance text with actual content',
  },
  {
    name: 'In this section guidance',
    regex: /In this section[,]?\s+(you should|we|the assessor)[^.]{5,80}\./gi,
    severity: 'medium',
    suggestion: 'Replace guidance text with actual content',
  },
  
  // Instruction text
  {
    name: 'Please instruction',
    regex: /Please\s+(enter|insert|add|provide|complete|fill|specify|state|include|describe|detail|list|note|record)[^.]{3,60}\./gi,
    severity: 'medium',
    suggestion: 'Remove instruction and add actual content',
  },
  {
    name: 'You should instruction',
    regex: /You should\s+[^.]{5,80}\./gi,
    severity: 'medium',
    suggestion: 'Remove instruction text',
  },
  {
    name: 'Ensure instruction',
    regex: /Ensure\s+(that\s+)?[^.]{5,80}\./gi,
    severity: 'medium',
    suggestion: 'Remove instruction text',
  },
  {
    name: 'Remember instruction',
    regex: /Remember to\s+[^.]{5,80}\./gi,
    severity: 'medium',
    suggestion: 'Remove instruction text',
  },
  {
    name: 'Make sure instruction',
    regex: /Make sure\s+(to\s+)?[^.]{5,80}\./gi,
    severity: 'medium',
    suggestion: 'Remove instruction text',
  },
  {
    name: 'Do not forget instruction',
    regex: /(Don't|Do not) forget to\s+[^.]{5,80}\./gi,
    severity: 'medium',
    suggestion: 'Remove instruction text',
  },
  
  // TBD/TBA/TODO
  {
    name: 'TBD placeholder',
    regex: /\b(TBD|TBA|TODO|TBC)\b/g,
    severity: 'medium',
    suggestion: 'Replace with actual information',
    captureAll: true,
  },
  
  // N/A (with context check)
  {
    name: 'N/A placeholder',
    regex: /\bN\/A\b/g,
    severity: 'low',
    suggestion: 'Verify N/A is appropriate or provide actual value',
    checkContext: true,
  },
  
  // Angle bracket placeholders
  {
    name: 'Angle bracket placeholder',
    regex: /<([A-Za-z][A-Za-z\s_]{1,})>/gi,
    severity: 'high',
    suggestion: 'Replace placeholder with actual content',
  },
  
  // Question marks
  {
    name: 'Question mark placeholder',
    regex: /\?{3,}/g,
    severity: 'medium',
    suggestion: 'Replace with actual information',
    captureAll: true,
  },
  
  // Curly bracket placeholders
  {
    name: 'Curly bracket placeholder',
    regex: /\{([A-Za-z][A-Za-z\s_]{0,})\}/gi,
    severity: 'high',
    suggestion: 'Replace placeholder with actual content',
  },
  
  // Insert/Add/Enter instructions
  {
    name: 'Insert instruction',
    regex: /\[INSERT[^\]]*\]/gi,
    severity: 'high',
    suggestion: 'Replace with actual content as instructed',
    captureAll: true,
  },
  {
    name: 'Add instruction',
    regex: /\[ADD[^\]]*\]/gi,
    severity: 'high',
    suggestion: 'Add the required content',
    captureAll: true,
  },
  {
    name: 'Enter instruction',
    regex: /\[ENTER[^\]]*\]/gi,
    severity: 'high',
    suggestion: 'Enter the required information',
    captureAll: true,
  },
  {
    name: 'Type instruction',
    regex: /\[TYPE[^\]]*\]/gi,
    severity: 'high',
    suggestion: 'Type the required information',
    captureAll: true,
  },
  
  // Common field placeholders
  {
    name: 'Name placeholder',
    regex: /\[(CLIENT|COMPANY|SITE|BUILDING|PROPERTY|ASSESSOR|CONSULTANT|YOUR|FULL|FIRST|LAST|CONTACT)\s*(NAME)?\]/gi,
    severity: 'high',
    suggestion: 'Replace with actual name',
    captureAll: true,
  },
  {
    name: 'Address placeholder',
    regex: /\[(SITE\s*)?ADDRESS\]/gi,
    severity: 'high',
    suggestion: 'Replace with actual address',
    captureAll: true,
  },
  {
    name: 'Date field placeholder',
    regex: /\[DATE[^\]]*\]/gi,
    severity: 'high',
    suggestion: 'Replace with actual date',
    captureAll: true,
  },
  {
    name: 'Number placeholder',
    regex: /\[(NUMBER|REF|REFERENCE)[^\]]*\]/gi,
    severity: 'high',
    suggestion: 'Replace with actual number/reference',
    captureAll: true,
  },
  
  // Word template placeholders
  {
    name: 'Click to enter text',
    regex: /\[?Click (here )?to enter [^\]]{2,30}\]?/gi,
    severity: 'high',
    suggestion: 'Enter the required text',
    captureAll: true,
  },
  {
    name: 'Click to select',
    regex: /\[?Click (here )?to select[^\]]{2,30}\]?/gi,
    severity: 'high',
    suggestion: 'Select the required option',
    captureAll: true,
  },
  {
    name: 'Enter text here',
    regex: /\benter\s+(your\s+)?(text|details?|information|data)\s+here\b/gi,
    severity: 'high',
    suggestion: 'Enter the required information',
    captureAll: true,
  },
  {
    name: 'Type here',
    regex: /\btype\s+(your\s+)?(text|details?|information|data|answer|response)\s+here\b/gi,
    severity: 'high',
    suggestion: 'Type the required information',
    captureAll: true,
  },
  
  // Demo/test placeholders
  {
    name: 'Demo placeholder',
    regex: /\(demo\)\s*\w+/gi,
    severity: 'medium',
    suggestion: 'Replace demo text with actual client name',
  },
  {
    name: 'Test placeholder',
    regex: /\b(TEST|TESTING|SAMPLE|EXAMPLE|DEMO)\s+(DATA|TEXT|CONTENT|VALUE|NAME|CLIENT)\b/gi,
    severity: 'high',
    suggestion: 'Replace test/sample data with actual content',
    captureAll: true,
  },
  
  // Underscore/dot placeholders
  {
    name: 'Underscore placeholder',
    regex: /_{3,}/g,
    severity: 'medium',
    suggestion: 'Fill in the blank field',
    captureAll: true,
  },
  {
    name: 'Ellipsis placeholder',
    regex: /\.{4,}/g,
    severity: 'low',
    suggestion: 'Replace with actual content',
    captureAll: true,
  },
  
  // Edit markers
  {
    name: 'Highlight instruction',
    regex: /\[(?:highlighted|highlight|yellow|red|green)\s*(?:text)?[^\]]*\]/gi,
    severity: 'medium',
    suggestion: 'Remove highlighting instruction',
  },
  {
    name: 'Delete/remove marker',
    regex: /\[(?:delete|remove|to be deleted|to be removed)[^\]]*\]/gi,
    severity: 'high',
    suggestion: 'Remove this marked text',
    captureAll: true,
  },
  {
    name: 'Example text marker',
    regex: /\[(?:example|sample|e\.g\.)[^\]]*\]/gi,
    severity: 'medium',
    suggestion: 'Replace example text with actual content',
  },
  {
    name: 'Note to author',
    regex: /\[(?:note|author|editor|reviewer|comment)[^\]]*\]/gi,
    severity: 'medium',
    suggestion: 'Remove editorial note',
  },
  
  // Specific FRA placeholders
  {
    name: 'FRA specific placeholder',
    regex: /\[(PREMISES|LOCATION|STOREY|FLOOR|ROOM|AREA|ZONE|RESPONSIBLE PERSON|DUTY HOLDER|FIRE SAFETY|EVACUATION|ALARM|DETECTION)[^\]]*\]/gi,
    severity: 'high',
    suggestion: 'Replace with actual information',
    captureAll: true,
  },
  
  // Guidance notes
  {
    name: 'Guidance note marker',
    regex: /\bGuidance\s*(?:Note|:)[^.]{5,100}\./gi,
    severity: 'medium',
    suggestion: 'Remove guidance note',
  },
  {
    name: 'Note to assessor',
    regex: /\bNote\s+to\s+(assessor|author|consultant|user)[^.]{5,80}\./gi,
    severity: 'medium',
    suggestion: 'Remove note to assessor',
  },
  
  // Amend/Update instructions
  {
    name: 'Amend instruction',
    regex: /\b(amend|update|modify|change|edit|revise)\s+(as\s+)?(appropriate|necessary|required|needed)\b/gi,
    severity: 'medium',
    suggestion: 'Make the required amendments',
    captureAll: true,
  },
  
  // If applicable markers
  {
    name: 'If applicable instruction',
    regex: /\[(if|where|when)\s+applicable[^\]]*\]/gi,
    severity: 'medium',
    suggestion: 'Determine applicability and update accordingly',
  },
  
  // Complete this section
  {
    name: 'Complete section instruction',
    regex: /\b(complete|fill in|populate)\s+(this\s+)?(section|field|box|area|table)\b/gi,
    severity: 'medium',
    suggestion: 'Complete the section with required information',
    captureAll: true,
  },
  
  // Select from list
  {
    name: 'Select instruction',
    regex: /\bselect\s+(from|one|the|appropriate|an?\s+option)\b/gi,
    severity: 'medium',
    suggestion: 'Make the required selection',
  },
  
  // Tick/check box instructions
  {
    name: 'Tick box instruction',
    regex: /\b(tick|check|mark)\s+(the\s+)?(appropriate|applicable|correct|relevant)\s+(box|option|item)\b/gi,
    severity: 'medium',
    suggestion: 'Select the appropriate option',
  },
  
  // See guidance
  {
    name: 'See guidance reference',
    regex: /\bsee\s+(the\s+)?(guidance|instructions?|notes?|section)\s+(below|above|on page|for)\b/gi,
    severity: 'low',
    suggestion: 'Remove guidance reference and add actual content',
  },
  
  // Refer to
  {
    name: 'Refer to instruction',
    regex: /\brefer\s+to\s+(the\s+)?(guidance|template|example|sample|standard)\b/gi,
    severity: 'low',
    suggestion: 'Remove reference and add actual content',
  },
];

const IGNORED_BRACKETS = [
  /^\[\d+\]$/,
  /^\[[ivxlcdm]+\]$/i,
  /^\[[a-z]\]$/i,
  /^\[Fig(\.|ure)?\s*\d/i,
  /^\[Table\s*\d/i,
  /^\[Ref\.?\s*\d/i,
  /^\[Source/i,
  /^\[Image\s*\d/i,
  /^\[Photo\s*\d/i,
  /^\[Appendix\s*[A-Z\d]/i,
  /^\[Section\s*\d/i,
  /^\[See\s+(also\s+)?(section|page|appendix|figure|table)/i,
  /^\[Page\s*\d/i,
  /^\[Note\s*\d/i,
  /^\[BS\s*\d/i,
  /^\[EN\s*\d/i,
  /^\[ISO\s*\d/i,
  /^\[PAS\s*\d/i,
  /^\[L\d/i,
  /^\[P\d/i,
  /^\[M\]/i,
  /^\[sic\]/i,
];

const GUIDANCE_EXCEPTIONS = [
  /risk level estimator/i,
  /simple risk level estimator/i,
  /likelihood of fire/i,
  /potential consequences/i,
  /trivial.*tolerable.*moderate/i,
  /the following simple risk level estimator is based on/i,
  /this assessment is based on/i,
  /this report is based on/i,
  /this document is based on/i,
  /this section is not applicable/i,
  /this section does not apply/i,
];

const shouldIgnoreBracket = (match) => {
  return IGNORED_BRACKETS.some(pattern => pattern.test(match));
};

const isGuidanceException = (line = '') =>
  GUIDANCE_EXCEPTIONS.some((pattern) => pattern.test(line));

const isStandaloneToken = (line = '', token = '') => {
  if (!line || !token) return true;
  const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const surrounding = line.replace(new RegExp(escapedToken, 'i'), '').trim();
  return surrounding.length < 30;
};

const isInTableOfContents = (lines, lineNumber) => {
  const start = Math.max(0, lineNumber - 20);
  const contextLines = lines.slice(start, lineNumber);
  for (const line of contextLines) {
    if (/table of contents|contents page|contents$/i.test(line.trim())) {
      return true;
    }
  }
  return false;
};

/**
 * Scan document text for placeholder patterns.
 *
 * Iterates every pattern over every line, applies false-positive filters
 * (ignored bracket references, guidance exceptions, table-of-contents
 * context), and returns an array of error objects with location data.
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
      const beforeMatch = text.substring(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const line = lines[lineNumber - 1] || '';

      if (pattern.name.includes('bracket placeholder') && shouldIgnoreBracket(match[0])) {
        continue;
      }

      if (pattern.name === 'N/A placeholder') {
        if (!isStandaloneToken(line, match[0])) {
          continue;
        }
        if (/\b(not applicable|where applicable|if applicable)\b/i.test(line)) {
          continue;
        }
      }

      if (pattern.name === 'TBD placeholder' && !isStandaloneToken(line, match[0])) {
        continue;
      }

      if (pattern.name.includes('guidance') && isGuidanceException(line)) {
        continue;
      }

      if (isInTableOfContents(lines, lineNumber)) {
        continue;
      }

      matchCount++;
      if (matchCount > maxMatches) {
        continue;
      }

      const section = findSection(lines, lineNumber);

      errors.push({
        type: 'placeholder',
        severity: pattern.severity,
        message: `${pattern.name} detected`,
        location: {
          section: section,
          lineStart: lineNumber,
        },
        suggestion: pattern.suggestion,
        originalText: match[0].substring(0, 100),
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
    if (/^(Section\s+)?\d+[.:]\s*/i.test(line)) {
      return line.trim().substring(0, 50);
    }
  }
  return 'Document';
};

module.exports = {
  detect,
  patterns,
};
