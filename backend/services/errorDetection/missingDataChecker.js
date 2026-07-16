const requiredSections = [
  { name: 'Summary', pattern: /\b(1\.\s*)?Summary\b/i },
  { name: 'Competent Persons', pattern: /\b(2\.\s*)?Competent Persons?\b/i },
  { name: 'Introduction', pattern: /\b(3\.\s*)?Introduction\b/i },
  { name: 'Premises Details', pattern: /\b(5\.\s*)?Premises Details?\b/i },
  { name: 'Fire Risk Assessment', pattern: /\b(8\.\s*)?Fire Risk Assessment\b/i },
  { name: 'Risk Assessment and Action Plan', pattern: /\b(9\.\s*)?(Risk Assessment (and|&) )?Action Plan\b/i },
];

const requiredFields = [
  {
    name: 'Reference Number',
    pattern: /Reference\s*Number[\s:]+\S{4,}/i,
    section: 'Header',
    headerField: true,
    aliases: ['Reference Number', 'Reference'],
  },
  {
    name: 'Visit Date',
    pattern: /Visit\s*Date[\s:]+\d{1,2}(st|nd|rd|th)?\s+\w+\s+\d{4}/i,
    section: 'Header',
    headerField: true,
    aliases: ['Visit Date', 'Date of Visit', 'Assessment Date'],
  },
  {
    name: 'Site Address',
    pattern: /Site\s*Address[\s:]+[A-Z0-9][a-zA-Z0-9\s,.-]{10,}/i,
    section: 'Header',
    headerField: true,
    aliases: ['Site Address', 'Address'],
  },
  {
    name: 'Consultant Name',
    pattern: /Consultant[\s:]+[A-Z][a-z]+\s+[A-Z][a-z]+/i,
    section: 'Header',
    headerField: true,
    aliases: ['Consultant', 'Assessor'],
  },
  {
    name: 'Evacuation Policy',
    pattern: /Evacuation\s*Policy[\s:]+\S{4,}/i,
    section: '5.9. Fire Evacuation Policy',
  },
  {
    name: 'Risk Level',
    pattern: /(risk\s*to\s*life|risk\s*level|overall\s*risk)[\s:]+\S{4,}/i,
    section: '8. Fire Risk Assessment',
  },
];

const emptyFieldPatterns = [
  {
    name: 'Empty field with colon',
    pattern: /^([A-Z][A-Za-z0-9&'\/(),.\- ]{3,40}):\s*$/gm,
    severity: 'medium',
  },
];

const IGNORE_EMPTY_FIELD_LABELS = new Set([
  'table of contents',
  'contents',
  'copyright',
  'draft',
  'version',
  'page',
  'prepared for',
  'prepared by',
  'site address',
  'fire risk assessment',
  'risk assessment and action plan',
  'summary',
  'introduction',
  'appendix',
  'section',
  'note',
  'notes',
  'warning',
  'important',
  'disclaimer',
  'confidential',
  'document control',
  'revision history',
  'distribution list',
  'signature',
  'annex',
  'figure',
  'table',
  'photo',
  'image',
  'drawing',
  'map',
  'plan',
  'floor plan',
  'site plan',
  'action',
  'recommendation',
  'finding',
  'observation',
  'comment',
  'response',
  'status',
  'priority',
  'category',
  'type',
  'description',
  'details',
  'information',
  'result',
  'conclusion',
  'assessment',
  'review',
  'inspection',
  'check',
  'test',
  'value',
  'score',
  'rating',
  'level',
  'compliance',
  'requirement',
  'guidance',
  'instruction',
  'procedure',
  'policy',
  'scope',
  'area',
  'location',
  'site',
  'premises',
  'building',
  'property',
  'client',
  'owner',
  'manager',
  'contact',
  'email',
  'telephone',
  'phone',
  'address',
  'postcode',
]);

const fieldPresent = (text, keyword, options = {}) => {
  const normalizedText = (text || '').toLowerCase();
  const normalizedKeyword = (keyword || '').toLowerCase();
  const windowLength = options.windowLength || 200;
  const minValueLength = options.minValueLength || 4;
  const maxValueLength = options.maxValueLength || 100;

  let startIndex = 0;
  while (startIndex < normalizedText.length) {
    const idx = normalizedText.indexOf(normalizedKeyword, startIndex);
    if (idx === -1) return false;

    const window = text.slice(idx, idx + windowLength).replace(/\s+/g, ' ');
    const hasColonValue = new RegExp(`:\\s*.{${minValueLength},${maxValueLength}}`).test(window);
    if (hasColonValue) {
      return true;
    }

    startIndex = idx + normalizedKeyword.length;
  }

  return false;
};

const headerFieldPresent = (text, field) => {
  const headerWindow = (text || '').slice(0, 2000);
  const aliases = field.aliases && field.aliases.length ? field.aliases : [field.name];
  return aliases.some((alias) => fieldPresent(headerWindow, alias, { windowLength: 300 }));
};

const headerFieldMentioned = (headerFields = {}, field = {}) => {
  const headerText = (headerFields.rawHeaderText || '').toLowerCase();
  const aliases = field.aliases && field.aliases.length ? field.aliases : [field.name];
  return aliases.some((alias) => headerText.includes(alias.toLowerCase()));
};

const fieldLabelMentioned = (text, keyword) => {
  if (!text || !keyword) return false;
  return text.toLowerCase().includes(keyword.toLowerCase());
};

const isLikelyFieldLabel = (label = '') => {
  const normalized = label.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.length > 50) return false;
  if (/\b(are|were|is|was|has|have|had|will|would|should|could|can|may|might|must|shall|specifies|covers|identified|following|including|such as)\b/.test(normalized)) return false;
  return true;
};

const shouldIgnoreFieldLabel = (fieldName = '') => {
  const normalized = fieldName.trim().toLowerCase();

  if (!normalized) return true;
  if (normalized.length < 3 || normalized.length > 50) return true;
  if (/^\d+(\.\d+)*$/.test(normalized)) return true;

  if (IGNORE_EMPTY_FIELD_LABELS.has(normalized)) {
    return true;
  }

  for (const ignored of IGNORE_EMPTY_FIELD_LABELS) {
    if (normalized.startsWith(ignored) || normalized.endsWith(ignored)) {
      return true;
    }
  }

  if (/\b\d{5,}\b/.test(normalized)) return true;
  if (normalized.split(/\s+/).length > 5) return true;
  if (!isLikelyFieldLabel(fieldName)) return true;

  return false;
};

const detect = (text, sections = [], headerFields = {}) => {
  const errors = [];

  requiredSections.forEach((section) => {
    if (!section.pattern.test(text)) {
      errors.push({
        type: 'missing_data',
        severity: 'high',
        message: `Required section "${section.name}" not found`,
        location: {
          section: 'Document Structure',
        },
        suggestion: `Add the "${section.name}" section to the document`,
        originalText: section.name,
      });
    }
  });

  requiredFields.forEach((field) => {
    if (
      field.name === 'Visit Date' &&
      field.headerField &&
      !headerFields.visitDate &&
      (
        headerFields.hasUsableText === false ||
        !headerFieldMentioned(headerFields, field)
      )
    ) {
      return;
    }

    if (!field.pattern.test(text)) {
      const labelMentioned =
        fieldLabelMentioned(text, field.name) ||
        fieldLabelMentioned(text, field.name.split(' ')[0]);
      const valuePresent =
        (field.headerField && (
          (field.name === 'Visit Date' && headerFields.visitDate) ||
          (field.name === 'Reference Number' && headerFields.referenceNumber) ||
          (field.name === 'Consultant Name' && headerFields.consultant) ||
          headerFieldPresent(text, field)
        )) ||
        fieldPresent(text, field.name) ||
        fieldPresent(text, field.name.split(' ')[0]);

      if (labelMentioned && !valuePresent) {
        errors.push({
          type: 'missing_data',
          severity: 'medium',
          message: `Field "${field.name}" appears to be empty or incomplete`,
          location: {
            section: field.section,
          },
          suggestion: `Provide value for "${field.name}"`,
          originalText: field.name,
        });
      }
    }
  });

  emptyFieldPatterns.forEach((pattern) => {
    let match;
    const regex = new RegExp(pattern.pattern.source, pattern.pattern.flags);
    let matchCount = 0;
    
    while ((match = regex.exec(text)) !== null) {
      const fieldName = match[1]?.trim();
      
      if (fieldName && !shouldIgnoreFieldLabel(fieldName)) {
        matchCount++;
        if (matchCount > 5) continue;
        
        errors.push({
          type: 'missing_data',
          severity: pattern.severity,
          message: `Empty or missing value for "${fieldName}"`,
          location: {
            section: findNearestSection(text, match.index),
          },
          suggestion: `Provide value for "${fieldName}"`,
          originalText: match[0].substring(0, 50),
        });
      }
    }
  });

  return errors;
};

const findNearestSection = (text, position) => {
  const beforeText = text.substring(0, position);
  const lines = beforeText.split('\n');
  
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\d+\.(\d+\.?)?\s+[A-Z]/.test(lines[i])) {
      return lines[i].trim().substring(0, 50);
    }
  }
  return 'Document';
};

module.exports = {
  detect,
  requiredSections,
  requiredFields,
};
