const checklistConfig = require('./checklistConfig');

const evaluateItem = (text, item) => {
  if (item.notAppliesWhen && item.notAppliesWhen.test(text)) {
    return { status: 'not_applicable', matched: [] };
  }

  if (item.appliesWhenAll) {
    const allMatch = item.appliesWhenAll.every((pattern) => pattern.test(text));
    if (!allMatch) {
      return { status: 'not_applicable', matched: [] };
    }
  }

  if (item.appliesWhenAny) {
    const anyMatch = item.appliesWhenAny.some((pattern) => pattern.test(text));
    if (!anyMatch) {
      return { status: 'not_applicable', matched: [] };
    }
  }

  if (item.appliesWhen && !item.appliesWhen.test(text)) {
    return { status: 'not_applicable', matched: [] };
  }

  const matched = (item.patterns || []).filter((pattern) => pattern.test(text));
  const mode = item.mode || 'any';
  const isSatisfied = mode === 'all'
    ? matched.length === (item.patterns || []).length
    : matched.length > 0;

  return {
    status: isSatisfied ? 'pass' : 'fail',
    matched,
    total: (item.patterns || []).length,
    matchedCount: matched.length,
  };
};

const detect = (text, sections = []) => {
  const errors = [];
  const normalizedText = text.toLowerCase();
  
  const hasSubstantialContent = normalizedText.length > 5000;
  
  if (!hasSubstantialContent) {
    return errors;
  }

  checklistConfig.items.forEach((item) => {
    const result = evaluateItem(text, item);
    if (result.status !== 'fail') return;

    if (item.mode === 'all' && result.matchedCount > 0) {
      errors.push({
        type: 'compliance',
        severity: 'low',
        message: `Checklist ${item.id} partially evidenced: ${item.title}`,
        location: {
          section: item.sectionHint || 'Checklist',
        },
        suggestion: item.suggestion || 'Provide additional content to fully satisfy checklist item',
        originalText: `Checklist ${checklistConfig.version} / ${item.id} (${result.matchedCount}/${result.total} criteria met)`,
      });
    } else {
      errors.push({
        type: 'compliance',
        severity: item.severity || 'medium',
        message: `Checklist ${item.id} not evidenced: ${item.title}`,
        location: {
          section: item.sectionHint || 'Checklist',
        },
        suggestion: item.suggestion || 'Provide required content to satisfy checklist item',
        originalText: `Checklist ${checklistConfig.version} / ${item.id}`,
      });
    }
  });

  return errors;
};

module.exports = {
  detect,
  checklistVersion: checklistConfig.version,
  checklistItems: checklistConfig.items,
};
