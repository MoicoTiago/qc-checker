/**
 * ML-enhanced error detector (uses transformer models via @xenova/transformers).
 *
 * Provides two ML-based checks:
 *  1. Section completeness — classifies whether a section is too short or
 *     still contains boilerplate/template text.
 *  2. Cross-section similarity — computes cosine similarity between section
 *     embeddings to flag suspiciously duplicated content.
 */

const mlService = require('../mlService');

const MIN_SECTION_LENGTH_FOR_ML = 100;
const MIN_CLEAN_PROSE_FOR_ML = 200;
const ML_CONFIDENCE_THRESHOLD = 0.72;

const getCleanProseLength = (content = '') => {
  const normalized = content.replace(/\s+/g, ' ').trim();
  return (normalized.match(/[A-Za-z]/g) || []).length;
};

const getWordCount = (content = '') => {
  return content.split(/\s+/).filter(w => w.length > 2).length;
};

const isAddressLikeSection = (section = {}) => {
  const title = section.title || '';
  const content = section.content || '';
  const combined = `${title}\n${content}`;

  if (/^[\dA-Za-z\s,.'-]+$/.test(content.trim()) && content.split('\n').length <= 4) {
    if (/\b(road|street|lane|avenue|close|drive|court|way|liverpool|merseyside|postcode|london|manchester|birmingham)\b/i.test(combined)) {
      return true;
    }
  }

  return false;
};

const SKIP_SECTION_PATTERNS = [
  /^(table of )?contents?$/i,
  /^executive summary$/i,
  /^appendix\s*[a-z\d]?$/i,
  /^glossary$/i,
  /^references?$/i,
  /^index$/i,
  /^cover\s*(page)?$/i,
  /^title\s*(page)?$/i,
  /^document\s*(information|control)/i,
  /^revision\s*history/i,
  /^amendment\s*record/i,
  /^distribution\s*list/i,
  /^disclaimer$/i,
  /^confidential$/i,
  /^copyright/i,
  /^version\s*control/i,
  /^quality\s*assurance/i,
  /^abbreviations?$/i,
  /^acronyms?$/i,
];

const shouldSkipSection = (section = {}) => {
  const title = (section.title || '').trim();
  const content = (section.content || '').trim();
  
  if (SKIP_SECTION_PATTERNS.some(pattern => pattern.test(title))) {
    return true;
  }
  
  if (isAddressLikeSection(section)) {
    return true;
  }
  
  const nonEmptyLines = content.split('\n').filter(l => l.trim()).length;
  if (nonEmptyLines <= 2) {
    return true;
  }
  
  const wordCount = getWordCount(content);
  if (wordCount < 15) {
    return true;
  }
  
  return false;
};

/**
 * Classify each section's completeness using the ML model.
 *
 * Skips sections that are too short, address-like, or match structural
 * headings (TOC, glossary, etc.).  Remaining sections are truncated to
 * 500 chars and passed to the classifier; only high-confidence
 * placeholder/template results are surfaced.
 *
 * @param {string} text - Full document text (currently unused, reserved).
 * @param {Array<{title: string, content: string}>} sections
 * @returns {Promise<Array>} Error objects for incomplete sections.
 */
const analyzeWithML = async (text, sections = []) => {
  const errors = [];

  if (!mlService.isModelReady()) {
    console.log('ML models not ready, skipping ML-enhanced detection');
    return errors;
  }

  try {
    const eligibleSections = sections.filter(s => !shouldSkipSection(s)).slice(0, 8);
    
    for (const section of eligibleSections) {
      if (section.content && section.content.length > MIN_SECTION_LENGTH_FOR_ML) {
        const cleanProseLength = getCleanProseLength(section.content);
        if (cleanProseLength >= MIN_CLEAN_PROSE_FOR_ML) {
          continue;
        }

        if (process.env.DEBUG_ML_SECTIONS === 'true') {
          console.log(
            `[ML DEBUG] evaluating section="${section.title}" chars=${section.content.length} cleanProse=${cleanProseLength}`
          );
        }

        const completeness = await mlService.analyzeSectionCompleteness(
          section.content.substring(0, 500)
        );

        if (process.env.DEBUG_ML_SECTIONS === 'true' && completeness) {
          console.log(
            `[ML DEBUG] result section="${section.title}" classification="${completeness.classification}" score=${completeness.completenessScore}`
          );
        }

        if (
          completeness &&
          !completeness.isComplete &&
          completeness.completenessScore > ML_CONFIDENCE_THRESHOLD &&
          (completeness.classification === 'placeholder' ||
           completeness.classification === 'template')
        ) {
          errors.push({
            type: 'placeholder',
            severity: completeness.completenessScore > 0.85 ? 'high' : 'medium',
            message: `Section may contain ${completeness.classification === 'placeholder' ? 'placeholder markers' : 'unfilled template text'}`,
            location: {
              section: section.title,
            },
            suggestion: completeness.classification === 'placeholder' 
              ? 'Replace placeholder markers with actual content'
              : 'Complete the template with specific information',
            originalText: section.content.substring(0, 100),
            mlConfidence: completeness.completenessScore,
          });
        }
      }
    }
  } catch (error) {
    console.error('ML analysis error:', error.message);
  }

  return errors;
};

/**
 * Detect suspiciously similar sections via cosine similarity of embeddings.
 *
 * Embeds up to 6 eligible sections (first 500 chars each), then compares
 * every pair.  Pairs above 0.92 similarity whose titles are not substrings
 * of each other are flagged as potential duplicates.
 *
 * @param {Array<{title: string, content: string}>} sections
 * @returns {Promise<Array>} Error objects for near-duplicate section pairs.
 */
const findSimilarSections = async (sections) => {
  const errors = [];

  if (!mlService.isModelReady() || sections.length < 2) {
    return errors;
  }

  try {
    const eligibleSections = sections.filter(s => 
      !shouldSkipSection(s) && 
      s.content && 
      s.content.length > 150
    ).slice(0, 6);
    
    const embeddings = [];
    
    for (const section of eligibleSections) {
      const embedding = await mlService.getEmbedding(section.content.substring(0, 500));
      if (embedding) {
        embeddings.push({ section, embedding });
      }
    }

    for (let i = 0; i < embeddings.length; i++) {
      for (let j = i + 1; j < embeddings.length; j++) {
        const similarity = mlService.calculateSimilarity(
          embeddings[i].embedding,
          embeddings[j].embedding
        );

        if (similarity > 0.92 && embeddings[i].section.title !== embeddings[j].section.title) {
          const title1 = embeddings[i].section.title.toLowerCase();
          const title2 = embeddings[j].section.title.toLowerCase();
          
          if (title1.includes(title2) || title2.includes(title1)) {
            continue;
          }
          
          errors.push({
            type: 'consistency',
            severity: 'medium',
            message: `Sections "${embeddings[i].section.title}" and "${embeddings[j].section.title}" have very similar content (${Math.round(similarity * 100)}% similar)`,
            location: {
              section: embeddings[i].section.title,
            },
            suggestion: 'Review for duplicate or redundant content',
            originalText: `Similarity: ${Math.round(similarity * 100)}%`,
            mlConfidence: similarity,
          });
        }
      }
    }
  } catch (error) {
    console.error('Similarity analysis error:', error.message);
  }

  return errors;
};

module.exports = {
  analyzeWithML,
  findSimilarSections,
};
