const fs = require('fs');
const pdfParse = require('pdf-parse');

const renderPage = async (pageData) => {
  const textContent = await pageData.getTextContent({
    normalizeWhitespace: true,
    disableCombineTextItems: false,
  });

  let lastY = null;
  let text = '';

  for (const item of textContent.items) {
    if (lastY === item.transform[5] || lastY === null) {
      text += item.str;
    } else {
      text += `\n${item.str}`;
    }
    lastY = item.transform[5];
  }

  return text;
};

const cleanExtractedText = (rawText) => {
  if (!rawText || typeof rawText !== 'string') return rawText;

  const lines = rawText.split('\n');
  const cleanedLines = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      cleanedLines.push('');
      continue;
    }

    const dashRatio = (trimmed.match(/[-|=]/g) || []).length / trimmed.length;
    if (dashRatio > 0.6 && trimmed.length > 3) {
      continue;
    }

    const multiSpaceCount = (trimmed.match(/  +/g) || []).length;
    const meaningfulCharCount = trimmed.replace(/[\s\-|]/g, '').length;
    if (multiSpaceCount >= 3 && meaningfulCharCount < 60) {
      continue;
    }

    if (/^(-|N\/A|\d{1,3}|[A-Z])$/.test(trimmed)) {
      continue;
    }

    if (/^Copyright \d{4}/.test(trimmed) || /^Page \d+ of \d+/.test(trimmed)) {
      continue;
    }

    if (/^[LR]\s+(High|Medium|Low)\s*[-\d]*/.test(trimmed)) {
      continue;
    }

    if (/\s[LR]\s+(High|Medium|Low)/.test(trimmed) && meaningfulCharCount < 80) {
      continue;
    }

    const cleaned = trimmed.replace(/ {2,}/g, ' ');
    cleanedLines.push(cleaned);
  }

  return cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n');
};

const normalizeSectionTitle = (line = '') =>
  line
    .trim()
    .replace(/\d+$/, '')
    .replace(/\s{2,}/g, ' ');

const extractHeaderFields = (text = '') => {
  const header = text.slice(0, 800);
  const compactHeader = header.replace(/\s+/g, ' ').trim();
  return {
    visitDate: header.match(/Visit\s*Date[:\s]+([^\n]{5,30})/i)?.[1]?.trim() || '',
    referenceNumber: header.match(/Reference\s*Number[:\s]+([^\n]{3,20})/i)?.[1]?.trim() || '',
    consultant: header.match(/Consultant[:\s]+([^\n]{5,50})/i)?.[1]?.trim() || '',
    rawHeaderText: header,
    hasUsableText: compactHeader.length >= 80,
  };
};

const isAddressLikeLine = (line = '') => {
  const trimmed = line.trim();
  if (!trimmed) return false;

  if (/^\d+[A-Za-z]?\s+[A-Z][A-Za-z0-9'.,\- ]+$/.test(trimmed)) return true;
  if (/^[A-Z][A-Za-z'.,\- ]+,\s*[A-Z][A-Za-z'.,\- ]+$/.test(trimmed)) return true;
  if (/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(trimmed)) return true;

  return false;
};

const extractTextFromPDF = async (filePath) => {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer, { pagerender: renderPage });
    const text = cleanExtractedText(data.text);
    
    return {
      text,
      numPages: data.numpages,
      info: data.info,
      headerFields: extractHeaderFields(text),
    };
  } catch (error) {
    console.error('PDF extraction error:', error);
    throw new Error('Failed to extract text from PDF');
  }
};

const extractSections = (text) => {
  const sections = [];
  const lines = text.split('\n').filter(line => line.trim());
  
  let currentSection = {
    title: 'Document Start',
    content: [],
    startLine: 0,
  };
  
  const sectionPatterns = [
    /^(\d+\.?\s+[A-Z][A-Za-z\s]+)/,
    /^(Section\s+\d+[.:]\s*.+)/i,
    /^([A-Z][A-Z\s]{2,}:?)$/,
    /^(\d+\.\d+\.?\s+.+)/,
  ];
  
  lines.forEach((line, index) => {
    const trimmedLine = line.trim();
    let isNewSection = false;

    if (isAddressLikeLine(trimmedLine)) {
      currentSection.content.push(trimmedLine);
      return;
    }
    
    for (const pattern of sectionPatterns) {
      if (pattern.test(trimmedLine)) {
        if (currentSection.content.length > 0) {
          sections.push({
            ...currentSection,
            content: currentSection.content.join('\n'),
          });
        }
        
        currentSection = {
          title: normalizeSectionTitle(trimmedLine),
          content: [],
          startLine: index,
        };
        isNewSection = true;
        break;
      }
    }
    
    if (!isNewSection) {
      currentSection.content.push(line);
    }
  });
  
  if (currentSection.content.length > 0) {
    sections.push({
      ...currentSection,
      content: currentSection.content.join('\n'),
    });
  }

  const mergedSections = [];

  for (const section of sections) {
    const contentLength = (section.content || '').replace(/\s+/g, ' ').trim().length;
    if (mergedSections.length > 0 && contentLength > 0 && contentLength < 150) {
      const previous = mergedSections[mergedSections.length - 1];
      previous.content = `${previous.content}\n${section.title}\n${section.content}`.trim();
      continue;
    }

    mergedSections.push(section);
  }

  return mergedSections;
};

const estimateReadTime = (text) => {
  const words = text.split(/\s+/).length;
  const wordsPerMinute = 200;
  return Math.ceil(words / wordsPerMinute);
};

const processDocument = async (filePath) => {
  const extraction = await extractTextFromPDF(filePath);
  const sections = extractSections(extraction.text);
  const readTimeMinutes = estimateReadTime(extraction.text);
  
  return {
    text: extraction.text,
    numPages: extraction.numPages,
    info: extraction.info,
    headerFields: extraction.headerFields,
    sections,
    readTimeMinutes,
    wordCount: extraction.text.split(/\s+/).length,
  };
};

module.exports = {
  cleanExtractedText,
  extractTextFromPDF,
  extractSections,
  extractHeaderFields,
  estimateReadTime,
  processDocument,
};
