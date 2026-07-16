let pipeline = null;
let featureExtractor = null;
let classifier = null;
let isInitialized = false;
let isInitializing = false;

const initializeModels = async () => {
  if (isInitialized || isInitializing) return;
  
  isInitializing = true;
  
  try {
    console.log('Loading ML models... (this may take a moment on first run)');
    
    const { pipeline: pipelineFunc } = await import('@xenova/transformers');
    pipeline = pipelineFunc;

    featureExtractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log('Feature extraction model loaded');

    classifier = await pipeline('zero-shot-classification', 'Xenova/mobilebert-uncased-mnli');
    console.log('Classification model loaded');

    isInitialized = true;
    console.log('ML models ready');
  } catch (error) {
    console.error('Error loading ML models:', error.message);
    isInitializing = false;
  }
};

const getEmbedding = async (text) => {
  if (!isInitialized) {
    await initializeModels();
  }
  
  if (!featureExtractor) {
    console.warn('Feature extractor not available');
    return null;
  }

  try {
    const truncatedText = text.substring(0, 512);
    const output = await featureExtractor(truncatedText, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  } catch (error) {
    console.error('Embedding error:', error.message);
    return null;
  }
};

const classifyText = async (text, labels) => {
  if (!isInitialized) {
    await initializeModels();
  }
  
  if (!classifier) {
    console.warn('Classifier not available');
    return null;
  }

  try {
    const truncatedText = text.substring(0, 512);
    const result = await classifier(truncatedText, labels);
    return {
      labels: result.labels,
      scores: result.scores,
      topLabel: result.labels[0],
      topScore: result.scores[0],
    };
  } catch (error) {
    console.error('Classification error:', error.message);
    return null;
  }
};

const calculateSimilarity = (embedding1, embedding2) => {
  if (!embedding1 || !embedding2) return 0;
  if (embedding1.length !== embedding2.length) return 0;

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    norm1 += embedding1[i] * embedding1[i];
    norm2 += embedding2[i] * embedding2[i];
  }

  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
};

const COMPLETENESS_LABELS = [
  'This text is complete professional content with specific details',
  'This text contains unfilled placeholder markers like brackets or XXX',
  'This text is a template with instructions to be replaced',
];

const LABEL_MAP = {
  'This text is complete professional content with specific details': 'complete',
  'This text contains unfilled placeholder markers like brackets or XXX': 'placeholder',
  'This text is a template with instructions to be replaced': 'template',
};

const analyzeSectionCompleteness = async (sectionText) => {
  const result = await classifyText(sectionText, COMPLETENESS_LABELS);
  
  if (!result) return null;

  const mappedLabel = LABEL_MAP[result.topLabel] || result.topLabel;
  const isComplete = mappedLabel === 'complete';
  
  const allScores = {};
  result.labels.forEach((label, i) => {
    const mapped = LABEL_MAP[label] || label;
    allScores[mapped] = result.scores[i];
  });

  return {
    isComplete,
    completenessScore: result.topScore,
    classification: mappedLabel,
    allScores,
  };
};

const ERROR_TYPE_LABELS = [
  'This text has no errors and is properly written',
  'This text contains placeholder markers that need to be filled in',
  'This text has inconsistent or conflicting information',
  'This text is missing required data fields',
];

const ERROR_LABEL_MAP = {
  'This text has no errors and is properly written': 'no error',
  'This text contains placeholder markers that need to be filled in': 'placeholder',
  'This text has inconsistent or conflicting information': 'inconsistent',
  'This text is missing required data fields': 'missing data',
};

const detectErrorType = async (text) => {
  const result = await classifyText(text, ERROR_TYPE_LABELS);
  
  if (!result) return null;

  const mappedLabel = ERROR_LABEL_MAP[result.topLabel] || result.topLabel;

  const allScores = {};
  result.labels.forEach((label, i) => {
    const mapped = ERROR_LABEL_MAP[label] || label;
    allScores[mapped] = result.scores[i];
  });

  return {
    errorType: mappedLabel,
    confidence: result.topScore,
    allScores,
  };
};

const compareDocuments = async (text1, text2) => {
  const embedding1 = await getEmbedding(text1);
  const embedding2 = await getEmbedding(text2);

  if (!embedding1 || !embedding2) {
    return { similarity: 0, error: 'Could not generate embeddings' };
  }

  const similarity = calculateSimilarity(embedding1, embedding2);

  return {
    similarity,
    isSimilar: similarity > 0.8,
    isRelated: similarity > 0.5,
  };
};

const isModelReady = () => isInitialized;

const preloadModels = () => {
  initializeModels().catch(console.error);
};

module.exports = {
  initializeModels,
  getEmbedding,
  classifyText,
  calculateSimilarity,
  analyzeSectionCompleteness,
  detectErrorType,
  compareDocuments,
  isModelReady,
  preloadModels,
};
