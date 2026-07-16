/**
 * @file annotatedPdfService.js
 *
 * Generates an annotated copy of a PDF report with colour-coded highlights
 * on detected errors. Text positions are extracted from the PDF via pdf-parse,
 * errors are mapped to their text coordinates, and semi-transparent highlights
 * are drawn using pdf-lib.
 *
 * Sections 1, 5, 6, 8 use standard axis-aligned highlighting. Section 9 uses
 * rotation-aware highlighting to handle landscape/table layouts correctly.
 *
 * A summary page listing all highlighted errors is appended at the end.
 *
 * @exports generateAnnotatedPdf - accepts a report and returns a Buffer of
 *   the annotated PDF.
 */
const pdfLib = require('pdf-lib');
const fs = require('fs');
const pdfParse = require('pdf-parse');

const ERROR_COLORS = {
  placeholder: { r: 1, g: 0.8, b: 0.2 },
  consistency: { r: 0.4, g: 0.6, b: 1 },
  compliance: { r: 1, g: 0.4, b: 0.4 },
  formatting: { r: 0.8, g: 0.5, b: 1 },
  missing_data: { r: 0.4, g: 0.9, b: 0.5 },
};

const ERROR_LABELS = {
  placeholder: 'Placeholder',
  consistency: 'Consistency',
  compliance: 'Compliance',
  formatting: 'Formatting',
  missing_data: 'Missing Data',
};

const PLACEHOLDER_REGEXES = [
  /X{2,}/g,
  /x{2,}/g,
  /\*{2,}/g,
  /_{3,}/g,
  /#{3,}/g,
  /\?{3,}/g,
  /\.{4,}/g,
  /\[[A-Z][A-Za-z0-9\s_\/,\-()]{1,160}\]/g,
  /\[[a-z][A-Za-z0-9\s_\/,\-()]{2,160}\]/g,
  /\[INSERT[^\]]*\]/gi,
  /\[ADD[^\]]*\]/gi,
  /\[ENTER[^\]]*\]/gi,
  /\[DATE[^\]]*\]/gi,
  /\[NAME[^\]]*\]/gi,
  /\[ADDRESS[^\]]*\]/gi,
  /\b(TBD|TBA|TODO|TBC)\b/g,
  /\bN\/A\b/g,
];

const WRAPPED_PLACEHOLDER_REGEXES = [
  /\*{2,}[A-Za-z0-9][A-Za-z0-9\s&/(),.'-]{0,120}\*{2,}/g,
  /#{2,}[A-Za-z0-9][A-Za-z0-9\s&/(),.'-]{0,120}#{2,}/g,
  /_{2,}[A-Za-z0-9][A-Za-z0-9\s&/(),.'-]{0,120}_{2,}/g,
];

const ALLOWED_SECTIONS = [1, 5, 6, 8, 9];
const getSectionNumber = (sectionText) => {
  if (!sectionText) return null;
  const match = sectionText.match(/^(\d+)/) || sectionText.match(/(\d+)\./);
  if (match) return parseInt(match[1], 10);
  const keywords = {
    summary: 1,
    header: 1,
    document: 1,
    competent: 2,
    introduction: 3,
    terms: 4,
    definitions: 4,
    premises: 5,
    'fire hazards': 6,
    hazard: 6,
    management: 7,
    'fire risk': 8,
    'risk assessment': 8,
    'action plan': 9,
    recommendations: 9,
    actions: 9,
  };
  const lower = (sectionText || '').toLowerCase();
  for (const [kw, num] of Object.entries(keywords)) {
    if (lower.includes(kw)) return num;
  }
  return null;
};

const isInAllowedSection = (error) => {
  const section = error.location?.section || '';
  const num = getSectionNumber(section);
  return num !== null && ALLOWED_SECTIONS.includes(num);
};

const getCorrectErrorType = (error) => {
  const orig = error.originalText || '';
  for (const pat of PLACEHOLDER_REGEXES) {
    const r = new RegExp(pat.source, pat.flags);
    if (r.test(orig)) return 'placeholder';
  }
  return error.type || 'placeholder';
};

const truncateText = (text, max) => {
  const s = String(text || '').replace(/[^\x20-\x7E]/g, '').trim();
  return s.length <= max ? s : s.substring(0, max - 3) + '...';
};

const normalizeComparableText = (text) =>
  String(text || '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const textMatchesPlaceholder = (text) => {
  if (!text || text.length < 2) return false;
  for (const pat of PLACEHOLDER_REGEXES) {
    const r = new RegExp(pat.source, pat.flags);
    if (r.test(text)) return true;
  }
  return false;
};

const cleanExtractedLineForAnnotation = (rawLine) => {
  const line = String(rawLine || '');
  const trimmed = line.trim();

  if (trimmed.length === 0) {
    return '';
  }

  const dashRatio = (trimmed.match(/[-|=]/g) || []).length / trimmed.length;
  if (dashRatio > 0.6 && trimmed.length > 3) {
    return null;
  }

  const multiSpaceCount = (trimmed.match(/  +/g) || []).length;
  const meaningfulCharCount = trimmed.replace(/[\s\-|]/g, '').length;
  if (multiSpaceCount >= 3 && meaningfulCharCount < 60) {
    return null;
  }

  if (/^(-|N\/A|\d{1,3}|[A-Z])$/.test(trimmed)) {
    return null;
  }

  if (/^Copyright \d{4}/.test(trimmed) || /^Page \d+ of \d+/.test(trimmed)) {
    return null;
  }

  if (/^[LR]\s+(High|Medium|Low)\s*[-\d]*/.test(trimmed)) {
    return null;
  }

  if (/\s[LR]\s+(High|Medium|Low)/.test(trimmed) && meaningfulCharCount < 80) {
    return null;
  }

  return trimmed.replace(/ {2,}/g, ' ');
};

const isBoilerplateLine = (text) => {
  const trimmed = String(text || '').trim();
  if (!trimmed) return false;

  return (
    /^copyright \d{4}/i.test(trimmed) ||
    /^page \d+ of$/i.test(trimmed) ||
    /^page \d+ of \d+$/i.test(trimmed) ||
    /^draft based on ver\./i.test(trimmed) ||
    /^\(demo\)\s+/i.test(trimmed) ||
    /^fire risk assessment\s*-/i.test(trimmed) ||
    /^\d{1,2}(st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4}$/i.test(trimmed) ||
    /^(item description|action required|l\/r|priority|rating|freq|photograph|progress\s*\/|completion notes)$/i.test(trimmed) ||
    /^no action is required at present\.?$/i.test(trimmed)
  );
};

const getSectionId = (text) => {
  const match = String(text || '').trim().match(/^(\d+\.\d+)\./);
  return match ? match[1] : null;
};

const getItemLayoutMetrics = (item) => {
  const transform = item.transform || [];
  const a = Number(transform[0]) || 0;
  const b = Number(transform[1]) || 0;
  const c = Number(transform[2]) || 0;
  const d = Number(transform[3]) || 0;
  const e = Number(transform[4]) || 0;
  const f = Number(transform[5]) || 0;

  const inlineMagnitude = Math.hypot(a, b) || 1;
  const inlineUnit = { x: a / inlineMagnitude, y: b / inlineMagnitude };

  let blockMagnitude = Math.hypot(c, d);
  let blockUnit;
  if (blockMagnitude > 0.001) {
    blockUnit = { x: c / blockMagnitude, y: d / blockMagnitude };
  } else {
    blockMagnitude = Math.max(Number(item.height) || inlineMagnitude, 1);
    blockUnit = { x: -inlineUnit.y, y: inlineUnit.x };
  }

  const origin = { x: e, y: f };

  return {
    origin,
    inlineUnit,
    inlineMagnitude,
    blockUnit,
    blockMagnitude,
    inlineCoord: origin.x * inlineUnit.x + origin.y * inlineUnit.y,
    lineCoord: origin.x * blockUnit.x + origin.y * blockUnit.y,
  };
};

const buildRawLinesFromItems = (items, pageNum, viewportHeight) => {
  const sortableItems = items
    .filter((item) => item?.str)
    .map((item) => ({
      text: item.str,
      transform: item.transform,
      width: item.width || 0,
      height: item.height || 0,
      ...getItemLayoutMetrics(item),
    }))
    .sort((a, b) => {
      const lineDelta = b.lineCoord - a.lineCoord;
      if (Math.abs(lineDelta) > 1.5) return lineDelta;
      return a.inlineCoord - b.inlineCoord;
    });

  const rawLines = [];
  let currentLine = null;

  for (const item of sortableItems) {
    if (!currentLine || Math.abs(item.lineCoord - currentLine.lineCoord) > 1.5) {
      if (currentLine?.items?.length) {
        rawLines.push({
          pageNum,
          viewportHeight,
          rawText: currentLine.items.map((lineItem) => lineItem.text).join(''),
          items: currentLine.items.map((lineItem, index, arr) => {
            const start =
              index === 0 ? 0 : arr.slice(0, index).reduce((sum, part) => sum + part.text.length, 0);
            return {
              text: lineItem.text,
              transform: lineItem.transform,
              width: lineItem.width,
              height: lineItem.height,
              start,
              end: start + lineItem.text.length,
            };
          }),
        });
      }
      currentLine = {
        lineCoord: item.lineCoord,
        items: [],
      };
    }

    currentLine.items.push(item);
  }

  if (currentLine?.items?.length) {
    rawLines.push({
      pageNum,
      viewportHeight,
      rawText: currentLine.items.map((lineItem) => lineItem.text).join(''),
      items: currentLine.items.map((lineItem, index, arr) => {
        const start =
          index === 0 ? 0 : arr.slice(0, index).reduce((sum, part) => sum + part.text.length, 0);
        return {
          text: lineItem.text,
          transform: lineItem.transform,
          width: lineItem.width,
          height: lineItem.height,
          start,
          end: start + lineItem.text.length,
        };
      }),
    });
  }

  return rawLines;
};

const buildRawPageLines = async (pdfBuffer) => {
  const pageMap = {};
  let currentPage = 0;

  await pdfParse(pdfBuffer, {
    max: 200,
    pagerender: async (pageData) => {
      currentPage++;
      try {
        const textContent = await pageData.getTextContent({
          normalizeWhitespace: true,
          disableCombineTextItems: false,
        });
        const viewport = pageData.getViewport({ scale: 1.0 });
        const rawLines = buildRawLinesFromItems(
          textContent.items,
          currentPage,
          viewport.height
        );

        pageMap[currentPage] = {
          viewportHeight: viewport.height,
          rawLines,
        };
      } catch (e) {
        console.log(`    Page ${currentPage}: extraction error - ${e.message}`);
      }
      return '';
    },
  }).catch(() => {});

  return { pageMap, totalPages: currentPage };
};

const extractLegacyPageItems = async (pdfBuffer) => {
  const pageItems = {};
  let currentPage = 0;

  await pdfParse(pdfBuffer, {
    max: 200,
    pagerender: async (pageData) => {
      currentPage++;
      try {
        const textContent = await pageData.getTextContent();
        const viewport = pageData.getViewport({ scale: 1.0 });
        const items = [];

        for (const item of textContent.items) {
          if (!item.str || !item.str.trim()) continue;
          items.push({
            text: item.str,
            transform: item.transform,
            width: item.width || item.str.length * 5,
            vpHeight: viewport.height,
          });
        }

        pageItems[currentPage] = items;
      } catch (e) {
        console.log(`    Page ${currentPage}: legacy extraction error - ${e.message}`);
      }
      return '';
    },
  }).catch(() => {});

  return { pageItems, totalPages: currentPage };
};

const buildCleanedLineRecords = (pageMap, totalPages) => {
  const records = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = pageMap[pageNum] || { viewportHeight: 0, rawLines: [] };

    for (const rawLine of page.rawLines) {
      const cleanedText = cleanExtractedLineForAnnotation(rawLine.rawText);
      if (cleanedText === null) continue;

      records.push({
        lineNumber: 0,
        pageNum,
        viewportHeight: page.viewportHeight,
        rawText: rawLine.rawText,
        cleanedText,
        items: rawLine.items,
      });
    }

    if (pageNum < totalPages) {
      records.push({
        lineNumber: 0,
        pageNum,
        viewportHeight: page.viewportHeight,
        rawText: '',
        cleanedText: '',
        items: [],
        isPageBreak: true,
      });
    }
  }

  const collapsedRecords = [];
  let blankRunLength = 0;

  for (const record of records) {
    if (!record.cleanedText) {
      blankRunLength++;
      if (blankRunLength > 2) continue;
    } else {
      blankRunLength = 0;
    }
    collapsedRecords.push(record);
  }

  return collapsedRecords.map((record, index) => ({
    ...record,
    lineNumber: index + 1,
  }));
};

const getCharacterWidthWeight = (char) => {
  if (char === ' ') return 0.33;
  if (/[\[\]\(\)\{\}\/\\|]/.test(char)) return 0.45;
  if (/[.,;:'`!]/.test(char)) return 0.28;
  if (/[-_]/.test(char)) return 0.36;
  if (/[ilIjtfr]/.test(char)) return 0.4;
  if (/[mwMW@#%&]/.test(char)) return 0.9;
  if (/[A-Z]/.test(char)) return 0.72;
  if (/[0-9]/.test(char)) return 0.6;
  return 0.56;
};

const getWeightedTextUnits = (text) =>
  [...String(text || '')].reduce(
    (sum, char) => sum + getCharacterWidthWeight(char),
    0
  );

const getWeightedSubstringUnits = (text, fromChar, toChar) =>
  [...String(text || '').slice(fromChar, toChar)].reduce(
    (sum, char) => sum + getCharacterWidthWeight(char),
    0
  );

const getRectForItemSegment = (item, fromChar = 0, toChar = null) => {
  const text = String(item.text || '');
  const totalChars = Math.max(text.length, 1);
  const safeFrom = Math.max(0, Math.min(fromChar, totalChars));
  const safeTo = Math.max(safeFrom, Math.min(toChar ?? totalChars, totalChars));
  const totalUnits = Math.max(getWeightedTextUnits(text), 0.001);
  const startRatio =
    getWeightedSubstringUnits(text, 0, safeFrom) / totalUnits;
  const endRatio =
    getWeightedSubstringUnits(text, 0, safeTo) / totalUnits;
  const {
    origin,
    inlineUnit,
    blockUnit,
    blockMagnitude,
  } = getItemLayoutMetrics(item);
  const runWidth = Math.max(Number(item.width) || 0, 1);
  const runHeight = Math.max(Number(item.height) || blockMagnitude || 10, 8);
  const inlinePadding = 2;

  const startPoint = {
    x:
      origin.x +
      inlineUnit.x * Math.max(runWidth * startRatio - inlinePadding, 0),
    y:
      origin.y +
      inlineUnit.y * Math.max(runWidth * startRatio - inlinePadding, 0),
  };
  const endPoint = {
    x:
      origin.x +
      inlineUnit.x * Math.min(runWidth * endRatio + inlinePadding, runWidth),
    y:
      origin.y +
      inlineUnit.y * Math.min(runWidth * endRatio + inlinePadding, runWidth),
  };

  const corners = [
    startPoint,
    endPoint,
    {
      x: startPoint.x + blockUnit.x * runHeight,
      y: startPoint.y + blockUnit.y * runHeight,
    },
    {
      x: endPoint.x + blockUnit.x * runHeight,
      y: endPoint.y + blockUnit.y * runHeight,
    },
  ];

  const minX = Math.min(...corners.map((point) => point.x)) - 2;
  const minY = Math.min(...corners.map((point) => point.y)) - 2;
  const maxX = Math.max(...corners.map((point) => point.x)) + 2;
  const maxY = Math.max(...corners.map((point) => point.y)) + 2;

  return {
    x: minX,
    y: minY,
    width: Math.max(maxX - minX, 10),
    height: Math.max(maxY - minY, 10),
  };
};

const mergeRects = (rects) => {
  const validRects = rects.filter(
    (rect) =>
      rect &&
      Number.isFinite(rect.x) &&
      Number.isFinite(rect.y) &&
      Number.isFinite(rect.width) &&
      Number.isFinite(rect.height)
  );

  if (!validRects.length) return null;

  const minX = Math.min(...validRects.map((rect) => rect.x));
  const minY = Math.min(...validRects.map((rect) => rect.y));
  const maxX = Math.max(...validRects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...validRects.map((rect) => rect.y + rect.height));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
};

const getLineRect = (lineRecord) =>
  mergeRects((lineRecord.items || []).map((item) => getRectForItemSegment(item)));

const findAllPlaceholderTextMatches = (text) => {
  const haystack = String(text || '');
  const matches = [];

  for (const pattern of [...WRAPPED_PLACEHOLDER_REGEXES, ...PLACEHOLDER_REGEXES]) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(haystack)) !== null) {
      const value = match[0];
      if (!value) break;

      matches.push({
        text: value,
        start: match.index,
        end: match.index + value.length,
      });

      if (regex.lastIndex === match.index) {
        regex.lastIndex++;
      }
    }
  }

  const dedupedMatches = [];
  const seen = new Set();

  for (const match of matches.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.end - a.end;
  })) {
    const key = `${match.start}:${match.end}:${match.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedupedMatches.push(match);
  }

  return dedupedMatches.filter((match, index, allMatches) => {
    const matchLength = match.end - match.start;
    return !allMatches.some((otherMatch) => {
      if (otherMatch === match) return false;

      const otherLength = otherMatch.end - otherMatch.start;
      return (
        otherLength > matchLength &&
        otherMatch.start <= match.start &&
        otherMatch.end >= match.end
      );
    });
  });
};

const findRectsByRawSubstring = (lineRecord, originalText) => {
  const haystack = String(lineRecord.rawText || '');
  const needle = String(originalText || '').trim();
  if (!haystack || !needle) return [];

  const loweredHaystack = haystack.toLowerCase();
  const loweredNeedle = needle.toLowerCase();
  const matches = [];
  let searchStart = 0;

  while (searchStart < loweredHaystack.length) {
    const matchIndex = loweredHaystack.indexOf(loweredNeedle, searchStart);
    if (matchIndex === -1) break;

    const matchStart = matchIndex;
    const matchEnd = matchIndex + needle.length;
    const rects = [];

    for (const item of lineRecord.items || []) {
      const overlapStart = Math.max(matchStart, item.start);
      const overlapEnd = Math.min(matchEnd, item.end);
      if (overlapStart >= overlapEnd) continue;

      rects.push(
        getRectForItemSegment(
          item,
          overlapStart - item.start,
          overlapEnd - item.start
        )
      );
    }

    const rect = mergeRects(rects) || getLineRect(lineRecord);
    if (rect) {
      matches.push({ rect, matchType: 'raw-substring', matchStart });
    }

    searchStart = matchIndex + Math.max(needle.length, 1);
  }

  return matches;
};

const findRectsByPlaceholderFallback = (lineRecord, error) => {
  const originalText = String(error.originalText || '').trim();
  const placeholderMatches = findAllPlaceholderTextMatches(lineRecord.rawText);
  if (!placeholderMatches.length) return [];

  const exactPlaceholderFragments = findAllPlaceholderTextMatches(originalText)
    .map((match) => match.text)
    .filter(Boolean);

  const exactFragmentMatches = exactPlaceholderFragments.length
    ? placeholderMatches.filter((match) => exactPlaceholderFragments.includes(match.text))
    : [];
  const filteredMatches = exactFragmentMatches.length
    ? exactFragmentMatches
    : placeholderMatches;

  return filteredMatches
    .map((match) => {
      const rects = [];

      for (const item of lineRecord.items || []) {
        const overlapStart = Math.max(match.start, item.start);
        const overlapEnd = Math.min(match.end, item.end);
        if (overlapStart >= overlapEnd) continue;

        rects.push(
          getRectForItemSegment(
            item,
            overlapStart - item.start,
            overlapEnd - item.start
          )
        );
      }

      const rect = mergeRects(rects) || getLineRect(lineRecord);
      if (!rect) return null;

      return {
        rect,
        matchType: 'placeholder-fallback',
        matchStart: match.start,
      };
    })
    .filter(Boolean);
};

const findRectsByNormalizedItemMatch = (lineRecord, originalText) => {
  const normalizedNeedle = normalizeComparableText(originalText);
  if (!normalizedNeedle) return [];

  const exactItemRects = (lineRecord.items || [])
    .filter((item) => normalizeComparableText(item.text).includes(normalizedNeedle))
    .map((item) => ({
      rect: getRectForItemSegment(item),
      matchType: 'item-match',
      matchStart: item.start,
    }));
  if (exactItemRects.length) {
    return exactItemRects;
  }

  const tokens = normalizedNeedle
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);

  if (!tokens.length) return [];

  const matchedItemRects = (lineRecord.items || [])
    .filter((item) => {
      const normalizedItemText = normalizeComparableText(item.text);
      return tokens.some((token) => normalizedItemText.includes(token));
    })
    .map((item) => ({
      rect: getRectForItemSegment(item),
      matchType: 'item-match',
      matchStart: item.start,
    }));

  return matchedItemRects;
};

const findHighlightMatchesOnLine = (lineRecord, error) => {
  const originalText = String(error.originalText || '').trim();

  if (originalText) {
    const rawMatches = findRectsByRawSubstring(lineRecord, originalText);
    if (rawMatches.length) {
      return rawMatches;
    }

    const itemMatches = findRectsByNormalizedItemMatch(lineRecord, originalText);
    if (itemMatches.length) {
      return itemMatches;
    }

    const normalizedLineText = normalizeComparableText(lineRecord.cleanedText);
    const normalizedNeedle = normalizeComparableText(originalText);
    if (normalizedNeedle && normalizedLineText.includes(normalizedNeedle)) {
      const lineRect = getLineRect(lineRecord);
      if (lineRect) {
        return [{ rect: lineRect, matchType: 'line-match', matchStart: 0 }];
      }
    }

    if (
      textMatchesPlaceholder(originalText) ||
      error.type === 'placeholder' ||
      error.type === 'missing_data'
    ) {
      const placeholderMatches = findRectsByPlaceholderFallback(lineRecord, error);
      if (placeholderMatches.length) {
        return placeholderMatches;
      }
    }
  } else {
    const lineRect = getLineRect(lineRecord);
    if (
      lineRect &&
      error.location?.lineStart &&
      lineRecord.lineNumber === error.location.lineStart
    ) {
      return [{ rect: lineRect, matchType: 'line-fallback', matchStart: 0 }];
    }
  }

  return [];
};

const buildMatchKey = (pageNum, lineNumber, rect, matchStart = null) => {
  if (Number.isFinite(matchStart) && matchStart >= 0) {
    return [pageNum, lineNumber, matchStart].join(':');
  }

  return [
    pageNum,
    Math.round(rect.x),
    Math.round(rect.y),
    Math.round(rect.width),
    Math.round(rect.height),
  ].join(':');
};

const normalizeSectionKey = (text) =>
  normalizeComparableText(text)
    .replace(/\s+/g, ' ')
    .replace(/existing controls and observations.*$/, '')
    .trim();

/** Scans cleaned lines for section headings (N.N. pattern followed by
 *  "existing controls and observations") and returns an array of
 *  { sectionId, key, startIndex, endIndex } ranges. */
const buildSectionRanges = (cleanedLines) => {
  const headingIndexes = cleanedLines
    .map((lineRecord, index) => ({ lineRecord, index }))
    .filter(({ lineRecord, index }) => {
      if (!/^\d+\.\d+\./.test((lineRecord.cleanedText || '').trim())) {
        return false;
      }

      const lookahead = cleanedLines
        .slice(index + 1, index + 5)
        .map((entry) => normalizeComparableText(entry.cleanedText))
        .filter(Boolean);

      return lookahead.some(
        (text) =>
          text === 'existing controls and observations' ||
          text.startsWith('existing controls and observations')
      );
    });

  return headingIndexes.map(({ lineRecord, index }, headingPosition) => {
    const nextIndex = headingIndexes[headingPosition + 1]?.index ?? cleanedLines.length;
    return {
      sectionId: getSectionId(lineRecord.cleanedText),
      key: normalizeSectionKey(lineRecord.cleanedText),
      startIndex: index,
      endIndex: nextIndex,
    };
  });
};

const getPagesForSectionNumber = (cleanedLines, sectionRanges, targetSectionNumber) => {
  const pages = new Set();

  for (const range of sectionRanges) {
    if (getSectionNumber(range.key) !== targetSectionNumber) continue;

    for (let index = range.startIndex; index < range.endIndex; index++) {
      const lineRecord = cleanedLines[index];
      if (lineRecord?.pageNum) {
        pages.add(lineRecord.pageNum);
      }
    }
  }

  return pages;
};

const getCandidateLinesForError = (error, cleanedLines, sectionRanges) => {
  const sectionKey = normalizeSectionKey(error.location?.section || '');
  const sectionId = getSectionId(error.location?.section || '');
  const matchingRange =
    sectionRanges.find((range) => sectionId && range.sectionId === sectionId) ||
    sectionRanges.find(
      (range) =>
        range.key &&
        sectionKey &&
        (sectionKey.startsWith(range.key) || range.key.startsWith(sectionKey))
    );

  const candidateLines = matchingRange
    ? cleanedLines.slice(matchingRange.startIndex, matchingRange.endIndex)
    : cleanedLines;

  const filteredLines = candidateLines.filter(
    (record) => record.items?.length && !isBoilerplateLine(record.cleanedText)
  );
  const targetLineNumber = Number(error.location?.lineStart) || null;
  const normalizedNeedle = normalizeComparableText(error.originalText || '');
  const isPlaceholderError =
    textMatchesPlaceholder(error.originalText || '') ||
    error.type === 'placeholder' ||
    error.type === 'missing_data';

  return filteredLines.sort((a, b) => {
    const aLineDistance = targetLineNumber
      ? Math.abs((a.lineNumber || 0) - targetLineNumber)
      : Number.MAX_SAFE_INTEGER;
    const bLineDistance = targetLineNumber
      ? Math.abs((b.lineNumber || 0) - targetLineNumber)
      : Number.MAX_SAFE_INTEGER;
    if (aLineDistance !== bLineDistance) return aLineDistance - bLineDistance;

    const aText = normalizeComparableText(a.cleanedText || a.rawText);
    const bText = normalizeComparableText(b.cleanedText || b.rawText);
    const aNeedleScore = normalizedNeedle && aText.includes(normalizedNeedle) ? 1 : 0;
    const bNeedleScore = normalizedNeedle && bText.includes(normalizedNeedle) ? 1 : 0;
    if (aNeedleScore !== bNeedleScore) return bNeedleScore - aNeedleScore;

    const aPlaceholderScore =
      isPlaceholderError && findAllPlaceholderTextMatches(a.rawText).length
        ? findAllPlaceholderTextMatches(a.rawText).length
        : 0;
    const bPlaceholderScore =
      isPlaceholderError && findAllPlaceholderTextMatches(b.rawText).length
        ? findAllPlaceholderTextMatches(b.rawText).length
        : 0;
    if (aPlaceholderScore !== bPlaceholderScore) {
      return bPlaceholderScore - aPlaceholderScore;
    }

    if ((a.pageNum || 0) !== (b.pageNum || 0)) return (a.pageNum || 0) - (b.pageNum || 0);
    return (a.lineNumber || 0) - (b.lineNumber || 0);
  });
};

const getAnnotationSpecificity = (error) => {
  const originalText = String(error.originalText || '').trim();
  const normalized = normalizeComparableText(originalText);
  const alphaNumericCount = (normalized.match(/[a-z0-9]/g) || []).length;
  return alphaNumericCount * 10 + originalText.length;
};

const findBestHighlightMatch = (
  error,
  cleanedLines,
  sectionRanges,
  usedMatchKeys = null
) => {
  const candidateLines = getCandidateLinesForError(error, cleanedLines, sectionRanges);

  for (const lineRecord of candidateLines) {
    const lineMatches = findHighlightMatchesOnLine(lineRecord, error);
    for (const lineMatch of lineMatches) {
      const key = buildMatchKey(
        lineRecord.pageNum,
        lineRecord.lineNumber,
        lineMatch.rect,
        lineMatch.matchStart
      );
      if (usedMatchKeys?.has(key)) continue;

      return {
        ...lineMatch,
        pageNum: lineRecord.pageNum,
        lineNumber: lineRecord.lineNumber,
        key,
      };
    }
  }

  return null;
};

/** Maps each error to its best highlight rectangle, processing more-specific
 *  errors first and tracking used match keys to avoid duplicate highlights.
 *  Unmatched errors may share a key with an already-claimed highlight. */
const planAnnotationMatches = (errors, cleanedLines, sectionRanges) => {
  const usedMatchKeys = new Set();
  const plannedMatches = new Array(errors.length).fill(null);

  const sortedEntries = errors
    .map((error, index) => ({ error, index }))
    .sort((a, b) => {
      const scoreDelta = getAnnotationSpecificity(b.error) - getAnnotationSpecificity(a.error);
      if (scoreDelta !== 0) return scoreDelta;
      return a.index - b.index;
    });

  for (const entry of sortedEntries) {
    const match = findBestHighlightMatch(
      entry.error,
      cleanedLines,
      sectionRanges,
      usedMatchKeys
    );

    if (!match) continue;

    usedMatchKeys.add(match.key);
    plannedMatches[entry.index] = match;
  }

  for (let index = 0; index < errors.length; index++) {
    if (plannedMatches[index]) continue;

    const sharedMatch = findBestHighlightMatch(
      errors[index],
      cleanedLines,
      sectionRanges,
      null
    );

    if (sharedMatch && usedMatchKeys.has(sharedMatch.key)) {
      plannedMatches[index] = {
        ...sharedMatch,
        shared: true,
      };
    }
  }

  return plannedMatches;
};

const clampRectToPage = (rect, pageWidth, pageHeight) => {
  if (!rect) return null;

  const x = Math.max(2, Math.min(rect.x, pageWidth - 2));
  const y = Math.max(2, Math.min(rect.y, pageHeight - 2));
  const width = Math.max(10, Math.min(rect.width, pageWidth - x - 2));
  const height = Math.max(10, Math.min(rect.height, pageHeight - y - 2));

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return null;
  }

  return { x, y, width, height };
};

const getBadgePosition = (rect, duplicateIndex = 0) => {
  const baseX = Math.max(rect.x - 12, 3);
  const baseY = rect.y + rect.height / 2 - 2;

  return {
    x: Math.max(baseX - duplicateIndex * 10, 3),
    y: baseY + duplicateIndex * 10,
  };
};

/** Standard axis-aligned highlighting for non-rotated pages (sections 1,5,6,8). */
const drawLegacyHighlightsOnPage = (
  page,
  pageNum,
  items,
  boldFont,
  pageHighlights,
  highlightState
) => {
  if (!items?.length) return;

  const { width: pageWidth, height: pageHeight } = page.getSize();

  for (const item of items) {
    if (!textMatchesPlaceholder(item.text)) continue;

    const tx = item.transform[4];
    const ty = item.transform[5];
    const fontSize =
      Math.abs(item.transform[3]) || Math.abs(item.transform[0]) || 10;
    const width = Math.max(item.width || 20, 20);
    const height = fontSize + 4;

    const drawX = Math.max(tx, 2);
    const drawY = ty;
    const drawW = Math.min(Math.max(width, 15), pageWidth - drawX - 5);
    const drawH = Math.max(height, 10);

    if (
      !Number.isFinite(drawX) ||
      !Number.isFinite(drawY) ||
      !Number.isFinite(drawW) ||
      !Number.isFinite(drawH)
    ) {
      continue;
    }

    if (drawX < 0 || drawY < 0 || drawX > pageWidth || drawY > pageHeight) {
      continue;
    }

    highlightState.highlightIndex++;
    pageHighlights.set(pageNum, (pageHighlights.get(pageNum) || 0) + 1);

    page.drawRectangle({
      x: drawX,
      y: drawY - 2,
      width: drawW,
      height: drawH,
      color: pdfLib.rgb(1, 0.8, 0.2),
      opacity: 0.35,
    });

    const cx = Math.max(drawX - 12, 3);
    const cy = drawY + drawH / 2 - 2;
    page.drawCircle({
      x: cx,
      y: cy,
      size: 7,
      color: pdfLib.rgb(0.8, 0.64, 0.16),
      opacity: 0.9,
    });
    page.drawText(`${highlightState.highlightIndex}`, {
      x: highlightState.highlightIndex > 9 ? cx - 4 : cx - 2.5,
      y: cy - 3,
      size: 6,
      font: boldFont,
      color: pdfLib.rgb(0, 0, 0),
    });
  }
};

/** Rotation-aware highlighting for section 9 pages where text transforms may
 *  be rotated (landscape tables). Uses per-character segment rects instead of
 *  simple axis-aligned bounding boxes. */
const drawRotationAwareLegacyHighlightsOnPage = (
  page,
  pageNum,
  items,
  boldFont,
  pageHighlights,
  highlightState
) => {
  if (!items?.length) return;

  const { width: pageWidth, height: pageHeight } = page.getSize();

  for (const item of items) {
    const matches = findAllPlaceholderTextMatches(item.text);
    if (!matches.length) continue;

    for (const match of matches) {
      const rect = clampRectToPage(
        getRectForItemSegment(item, match.start, match.end),
        pageWidth,
        pageHeight
      );
      if (!rect) continue;

      highlightState.highlightIndex++;
      pageHighlights.set(pageNum, (pageHighlights.get(pageNum) || 0) + 1);

      page.drawRectangle({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        color: pdfLib.rgb(1, 0.8, 0.2),
        opacity: 0.35,
      });

      const badge = getBadgePosition(rect, 0);
      page.drawCircle({
        x: badge.x,
        y: badge.y,
        size: 7,
        color: pdfLib.rgb(0.8, 0.64, 0.16),
        opacity: 0.9,
      });
      page.drawText(`${highlightState.highlightIndex}`, {
        x: highlightState.highlightIndex > 9 ? badge.x - 4 : badge.x - 2.5,
        y: badge.y - 3,
        size: 6,
        font: boldFont,
        color: pdfLib.rgb(0, 0, 0),
      });
    }
  }
};

/**
 * Main annotation pipeline:
 * 1. Load the source PDF
 * 2. Extract text items and viewport info per page
 * 3. Build cleaned line records with positional data
 * 4. Detect section ranges from heading patterns
 * 5. Plan annotation matches (error → highlight rect)
 * 6. Draw highlights per page (standard or rotation-aware)
 * 7. Append a summary page listing all highlighted errors
 *
 * @param {Object} report - Mongoose report document with filePath and errors[]
 * @returns {Promise<Buffer>} The annotated PDF as a Buffer
 */
const generateAnnotatedPdf = async (report) => {
  const pdfBytes = fs.readFileSync(report.filePath);
  const pdfDoc = await pdfLib.PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pdfLibPages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(pdfLib.StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(pdfLib.StandardFonts.HelveticaBold);
  const totalPages = pdfLibPages.length;

  const allErrors = report.errors.map((error) =>
    error.toObject ? error.toObject() : error
  );
  const filtered = allErrors.filter(isInAllowedSection);

  console.log(`\n=== PDF Annotation ===`);
  console.log(
    `Pages: ${totalPages}, Errors total: ${allErrors.length}, Filtered for sections ${ALLOWED_SECTIONS.join(
      ','
    )}: ${filtered.length} (section 9 uses legacy placeholder detection with rotation-aware highlighting, others use legacy highlighting)`
  );

  const { pageMap, totalPages: extractedPages } = await buildRawPageLines(pdfBytes);
  const cleanedLines = buildCleanedLineRecords(pageMap, extractedPages);
  const sectionRanges = buildSectionRanges(cleanedLines);
  const section9Pages = getPagesForSectionNumber(cleanedLines, sectionRanges, 9);
  const { pageItems: legacyPageItems } = await extractLegacyPageItems(pdfBytes);
  console.log(
    `  Text extracted from ${Object.keys(pageMap).length} pages, cleaned line map size: ${cleanedLines.length}, sections mapped: ${sectionRanges.length}, section 9 pages: ${section9Pages.size}`
  );

  let highlightIndex = 0;
  const pageHighlights = new Map();

  const highlightState = { get highlightIndex() { return highlightIndex; }, set highlightIndex(value) { highlightIndex = value; } };

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = pdfLibPages[pageNum - 1];
    if (!page) continue;

    if (section9Pages.has(pageNum)) {
      drawRotationAwareLegacyHighlightsOnPage(
        page,
        pageNum,
        legacyPageItems[pageNum],
        boldFont,
        pageHighlights,
        highlightState
      );
      continue;
    }

    drawLegacyHighlightsOnPage(
      page,
      pageNum,
      legacyPageItems[pageNum],
      boldFont,
      pageHighlights,
      highlightState
    );
  }

  for (const [pageNum, pageCount] of [...pageHighlights.entries()].sort(
    (a, b) => a[0] - b[0]
  )) {
    console.log(`    Page ${pageNum}: ${pageCount} errors highlighted`);
  }

  console.log(
    `  Total errors highlighted: ${highlightIndex}`
  );

  let sumPage = pdfDoc.addPage([612, 792]);
  const { width: pw, height: ph } = sumPage.getSize();
  let y = ph - 50;

  sumPage.drawRectangle({
    x: 0,
    y: ph - 80,
    width: pw,
    height: 80,
    color: pdfLib.rgb(0.15, 0.15, 0.25),
  });
  sumPage.drawText('QC Error Summary', {
    x: 40,
    y: ph - 50,
    size: 24,
    font: boldFont,
    color: pdfLib.rgb(1, 1, 1),
  });
  sumPage.drawText(truncateText(report.filename, 70), {
    x: 40,
    y: ph - 70,
    size: 10,
    font,
    color: pdfLib.rgb(0.7, 0.7, 0.7),
  });

  y = ph - 110;
  sumPage.drawText(
    `Errors highlighted: ${highlightIndex} | Errors in report: ${allErrors.length}`,
    {
      x: 40,
      y,
      size: 14,
      font: boldFont,
      color: pdfLib.rgb(0.6, 0.1, 0.1),
    }
  );

  y -= 40;
  const summary = {};
  filtered.forEach((error) => {
    const errorType = getCorrectErrorType(error);
    summary[errorType] = (summary[errorType] || 0) + 1;
  });

  let xOff = 40;
  for (const [type, count] of Object.entries(summary)) {
    const color = ERROR_COLORS[type] || ERROR_COLORS.placeholder;
    const cr = Number(color.r) || 0.5;
    const cg = Number(color.g) || 0.5;
    const cb = Number(color.b) || 0.5;
    sumPage.drawRectangle({
      x: xOff,
      y: y - 20,
      width: 80,
      height: 25,
      color: pdfLib.rgb(cr, cg, cb),
      opacity: 0.3,
      borderColor: pdfLib.rgb(cr, cg, cb),
      borderWidth: 1,
    });
    sumPage.drawText(`${count} ${ERROR_LABELS[type] || type}`, {
      x: xOff + 5,
      y: y - 12,
      size: 8,
      font: boldFont,
      color: pdfLib.rgb(cr * 0.7, cg * 0.7, cb * 0.7),
    });
    xOff += 90;
    if (xOff > pw - 100) {
      xOff = 40;
      y -= 35;
    }
  }

  y -= 50;
  sumPage.drawText('Error Details:', {
    x: 40,
    y,
    size: 12,
    font: boldFont,
    color: pdfLib.rgb(0.2, 0.2, 0.2),
  });
  y -= 20;

  const addPage = () => {
    sumPage = pdfDoc.addPage([612, 792]);
    y = ph - 50;
    return sumPage;
  };

  filtered.forEach((error, idx) => {
    if (y < 80) sumPage = addPage();
    const errorType = getCorrectErrorType(error);
    const color = ERROR_COLORS[errorType] || ERROR_COLORS.placeholder;
    const cr = Number(color.r) || 0.5;
    const cg = Number(color.g) || 0.5;
    const cb = Number(color.b) || 0.5;

    sumPage.drawRectangle({
      x: 40,
      y: y - 40,
      width: pw - 80,
      height: 45,
      color: pdfLib.rgb(0.97, 0.97, 0.97),
      borderColor: pdfLib.rgb(cr, cg, cb),
      borderWidth: 1,
    });
    sumPage.drawText(`#${idx + 1} [${ERROR_LABELS[errorType] || 'Error'}]`, {
      x: 50,
      y: y - 12,
      size: 9,
      font: boldFont,
      color: pdfLib.rgb(cr, cg, cb),
    });
    sumPage.drawText(truncateText(error.message || '', 65), {
      x: 130,
      y: y - 12,
      size: 9,
      font,
      color: pdfLib.rgb(0.2, 0.2, 0.2),
    });

    let detail = '';
    if (error.location?.section) {
      detail += `Section: ${truncateText(error.location.section, 20)}  `;
    }
    if (error.location?.lineStart) {
      detail += `Line: ${error.location.lineStart}`;
    }
    if (detail) {
      sumPage.drawText(detail, {
        x: 50,
        y: y - 26,
        size: 7,
        font,
        color: pdfLib.rgb(0.5, 0.5, 0.5),
      });
    }

    if (error.originalText) {
      sumPage.drawText(truncateText(`"${error.originalText}"`, 75), {
        x: 50,
        y: y - 36,
        size: 7,
        font,
        color: pdfLib.rgb(0.5, 0.3, 0.3),
      });
    }
    y -= 52;
  });

  console.log('=== Done ===\n');
  return Buffer.from(await pdfDoc.save());
};

module.exports = {
  generateAnnotatedPdf,
  __test__: {
    cleanExtractedLineForAnnotation,
    buildRawLinesFromItems,
    buildCleanedLineRecords,
    buildSectionRanges,
    findAllPlaceholderTextMatches,
    findHighlightMatchesOnLine,
    findBestHighlightMatch,
    planAnnotationMatches,
    getRectForItemSegment,
    normalizeComparableText,
  },
};
