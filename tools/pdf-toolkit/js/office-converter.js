(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const panel = $('panel-office');
  if (!panel) return;

  const state = {
    cancelled: false,
    busy: false,
    analysis: null,
    originalTables: [],
    tables: [],
    selectedTable: 0,
    ocrWorker: null,
    pdfDocument: null,
  };

  function setStatus(message, type = '') {
    const el = $('officeStatus');
    el.textContent = message;
    el.className = `status ${type}`.trim();
  }

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = String(value ?? '');
    return div.innerHTML;
  }

  function baseName(filename) {
    return String(filename || 'document').replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'document';
  }

  function downloadBlob(data, filename, type = 'application/octet-stream') {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1800);
  }

  function median(values) {
    const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!finite.length) return 0;
    const middle = Math.floor(finite.length / 2);
    return finite.length % 2 ? finite[middle] : (finite[middle - 1] + finite[middle]) / 2;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeText(value) {
    return String(value || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
  }

  function normalizeRepeatedText(value) {
    return normalizeText(value).toLowerCase().replace(/\d+/g, '#').replace(/[^\p{L}\p{N}#]+/gu, ' ').trim();
  }

  function parsePageRanges(input, pageCount) {
    const raw = String(input || '').trim();
    if (!raw) return Array.from({ length: pageCount }, (_, i) => i);
    const indexes = [];
    for (const token of raw.split(',')) {
      const part = token.trim();
      if (!part) continue;
      if (/^\d+$/.test(part)) {
        const page = Number(part);
        if (page < 1 || page > pageCount) throw new Error(`Page ${page} is outside this document.`);
        indexes.push(page - 1);
        continue;
      }
      const match = part.match(/^(\d+)\s*-\s*(\d+)$/);
      if (!match) throw new Error(`Invalid page range: ${part}`);
      const start = Number(match[1]);
      const end = Number(match[2]);
      if (start < 1 || end > pageCount || start > end) throw new Error(`Invalid page range: ${part}`);
      for (let page = start; page <= end; page += 1) indexes.push(page - 1);
    }
    return [...new Set(indexes)];
  }

  function setBusy(busy) {
    state.busy = busy;
    $('officeAnalyze').disabled = busy;
    $('officeCancel').disabled = !busy;
    $('officeProgress').hidden = !busy;
    if (!busy) $('officeProgress').value = 0;
  }

  function updateProgress(value, message) {
    $('officeProgress').value = clamp(Math.round(value), 0, 100);
    if (message) setStatus(message, 'working');
  }

  function yieldToBrowser() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  async function loadPdfJs(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return window.pdfjsLib.getDocument({ data: bytes }).promise;
  }

  function lineJoin(items) {
    const ordered = [...items].sort((a, b) => a.x - b.x);
    let text = '';
    let previous = null;
    for (const item of ordered) {
      const part = normalizeText(item.text);
      if (!part) continue;
      if (previous) {
        const gap = item.x - (previous.x + previous.width);
        const previousChars = Math.max(1, previous.text.length);
        const charWidth = Math.max(2, previous.width / previousChars);
        const noSpaceBefore = /^[,.;:!?%)\]}]/.test(part);
        const noSpaceAfter = /[(\[{]$/.test(previous.text);
        if (!noSpaceBefore && !noSpaceAfter && gap > Math.max(0.8, charWidth * 0.25)) text += ' ';
      }
      text += part;
      previous = item;
    }
    return normalizeText(text);
  }

  function groupItemsIntoLines(items, pageWidth) {
    const ordered = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
    const lines = [];
    for (const item of ordered) {
      const tolerance = Math.max(2.5, item.fontSize * 0.42);
      let best = null;
      let bestDistance = Infinity;
      for (let i = Math.max(0, lines.length - 7); i < lines.length; i += 1) {
        const distance = Math.abs(lines[i].baseline - item.y);
        if (distance <= tolerance && distance < bestDistance) {
          best = lines[i];
          bestDistance = distance;
        }
      }
      if (!best) {
        best = { baseline: item.y, items: [], yTop: item.y - item.fontSize, yBottom: item.y + item.fontSize * 0.25 };
        lines.push(best);
      }
      best.items.push(item);
      best.baseline = (best.baseline * (best.items.length - 1) + item.y) / best.items.length;
      best.yTop = Math.min(best.yTop, item.y - item.fontSize);
      best.yBottom = Math.max(best.yBottom, item.y + item.fontSize * 0.25);
    }

    return lines.map((line, index) => {
      line.items.sort((a, b) => a.x - b.x);
      const text = lineJoin(line.items);
      const x = Math.min(...line.items.map((item) => item.x));
      const right = Math.max(...line.items.map((item) => item.x + item.width));
      const fontSize = median(line.items.map((item) => item.fontSize)) || 10;
      const boldVotes = line.items.filter((item) => item.bold).length;
      const italicVotes = line.items.filter((item) => item.italic).length;
      return {
        index,
        text,
        x,
        right,
        width: Math.max(0, right - x),
        baseline: line.baseline,
        yTop: line.yTop,
        yBottom: line.yBottom,
        height: Math.max(fontSize, line.yBottom - line.yTop),
        fontSize,
        bold: boldVotes >= Math.max(1, line.items.length / 2),
        italic: italicVotes >= Math.max(1, line.items.length / 2),
        items: line.items,
        center: (x + right) / 2,
        pageWidth,
        repeated: false,
        confidence: median(line.items.map((item) => item.confidence).filter(Number.isFinite)),
      };
    }).filter((line) => line.text).sort((a, b) => a.yTop - b.yTop || a.x - b.x).map((line, index) => ({ ...line, index }));
  }

  function extractSelectableItems(page, textContent) {
    const viewport = page.getViewport({ scale: 1 });
    const styles = textContent.styles || {};
    const items = [];
    for (const source of textContent.items || []) {
      const text = normalizeText(source.str);
      if (!text) continue;
      const transformed = window.pdfjsLib.Util.transform(viewport.transform, source.transform || [1, 0, 0, 1, 0, 0]);
      const fontSize = Math.max(5, Math.hypot(transformed[2], transformed[3]) || Math.hypot(transformed[0], transformed[1]) || source.height || 10);
      const style = styles[source.fontName] || {};
      const fontLabel = `${source.fontName || ''} ${style.fontFamily || ''}`.toLowerCase();
      const width = Math.max(1, Number(source.width || 0) * viewport.scale || text.length * fontSize * 0.5);
      items.push({
        text,
        x: transformed[4],
        y: transformed[5],
        width,
        fontSize,
        bold: /bold|black|heavy|semibold|demi/.test(fontLabel),
        italic: /italic|oblique/.test(fontLabel),
      });
    }
    return { items, width: viewport.width, height: viewport.height };
  }

  async function renderPageForOcr(page, quality = 'high') {
    const natural = page.getViewport({ scale: 1 });
    const longest = Math.max(natural.width, natural.height);
    const target = quality === 'high' ? 3200 : 2400;
    const scale = Math.min(4, Math.max(2, target / Math.max(1, longest)));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    await page.render({ canvasContext: context, viewport, background: 'white' }).promise;

    // OCR quality matters more than visual fidelity here. Keep the full-resolution
    // render instead of shrinking every page to 1000px, which was destroying small
    // characters, punctuation and table values on scanned documents.
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    let min = 255; let max = 0;
    for (let i = 0; i < image.data.length; i += 4) {
      const gray = Math.round(image.data[i] * 0.299 + image.data[i + 1] * 0.587 + image.data[i + 2] * 0.114);
      image.data[i] = gray; image.data[i + 1] = gray; image.data[i + 2] = gray;
      if (gray < min) min = gray;
      if (gray > max) max = gray;
    }
    const range = Math.max(32, max - min);
    for (let i = 0; i < image.data.length; i += 4) {
      const gray = Math.round((image.data[i] - min) * 255 / range);
      image.data[i] = gray; image.data[i + 1] = gray; image.data[i + 2] = gray;
    }
    context.putImageData(image, 0, 0);
    return { canvas, pageWidth: natural.width, pageHeight: natural.height };
  }

  async function ensureOfficeOcrWorker(language) {
    if (state.ocrWorker) return state.ocrWorker;
    if (!window.Tesseract) throw new Error('OCR could not be loaded. Check your internet connection and refresh the page.');
    state.ocrWorker = await window.Tesseract.createWorker(language, 1, {
      logger: (message) => {
        if (!state.busy || typeof message.progress !== 'number') return;
        const base = Number($('officeProgress').dataset.pageBase || 0);
        const span = Number($('officeProgress').dataset.pageSpan || 5);
        $('officeProgress').value = clamp(base + message.progress * span, 0, 99);
        if (message.status) setStatus(`${message.status} ${Math.round(message.progress * 100)}%`, 'working');
      },
    });
    return state.ocrWorker;
  }

  function ocrWordsToItems(data, canvasWidth, canvasHeight, pageWidth, pageHeight) {
    const scaleX = pageWidth / canvasWidth;
    const scaleY = pageHeight / canvasHeight;
    const words = Array.isArray(data?.words) ? data.words : [];
    if (words.length) {
      return words.map((word) => {
        const box = word.bbox || {};
        const text = normalizeText(word.text);
        const x0 = Number(box.x0 || 0);
        const y0 = Number(box.y0 || 0);
        const x1 = Number(box.x1 || x0 + Math.max(1, text.length * 7));
        const y1 = Number(box.y1 || y0 + 12);
        const confidence = Number(word.confidence);
        return {
          text,
          x: x0 * scaleX,
          y: y1 * scaleY,
          width: Math.max(1, (x1 - x0) * scaleX),
          fontSize: Math.max(6, (y1 - y0) * scaleY * 0.85),
          bold: false,
          italic: false,
          confidence: Number.isFinite(confidence) ? confidence : null,
        };
      }).filter((item) => item.text);
    }
    const lines = Array.isArray(data?.lines) ? data.lines : [];
    if (lines.length) {
      return lines.map((line) => {
        const box = line.bbox || {};
        const text = normalizeText(line.text);
        const x0 = Number(box.x0 || 0);
        const y0 = Number(box.y0 || 0);
        const x1 = Number(box.x1 || x0 + Math.max(1, text.length * 7));
        const y1 = Number(box.y1 || y0 + 18);
        const confidence = Number(line.confidence);
        return {
          text,
          x: x0 * scaleX,
          y: y1 * scaleY,
          width: Math.max(1, (x1 - x0) * scaleX),
          fontSize: Math.max(6, (y1 - y0) * scaleY * 0.9),
          bold: false,
          italic: false,
          confidence: Number.isFinite(confidence) ? confidence : null,
        };
      }).filter((item) => item.text);
    }
    const fallbackLines = String(data?.text || '').split(/\r?\n/).map(normalizeText).filter(Boolean);
    return fallbackLines.map((text, index) => ({
      text, x: pageWidth * 0.06, y: pageHeight * 0.08 + index * 14,
      width: Math.min(pageWidth * 0.88, text.length * 6), fontSize: 10, bold: false, italic: false, confidence: null,
    }));
  }

  function classifyLines(lines) {
    const candidateFonts = lines.filter((line) => line.text.length > 20).map((line) => line.fontSize);
    const bodyFont = median(candidateFonts) || median(lines.map((line) => line.fontSize)) || 10;
    for (const line of lines) {
      const short = line.text.length <= 135;
      const ratio = line.fontSize / Math.max(1, bodyFont);
      const letters = line.text.replace(/[^\p{L}]/gu, '');
      const uppercase = letters.length >= 4 && letters === letters.toUpperCase();
      const bullet = /^\s*(?:[•●▪◦–—-]|\d+[.)]|[A-Za-z][.)])\s+/.test(line.text);
      let kind = 'body';
      if (bullet) kind = 'list';
      else if (short && (ratio >= 1.55 || (ratio >= 1.38 && line.bold))) kind = 'heading1';
      else if (short && (ratio >= 1.22 || (uppercase && line.bold))) kind = 'heading2';
      else if (short && line.bold && line.text.length < 80) kind = 'heading3';
      line.kind = kind;
      line.bodyFont = bodyFont;
      const pageCenter = line.pageWidth / 2;
      if (Math.abs(line.center - pageCenter) < line.pageWidth * 0.06 && line.width < line.pageWidth * 0.8) line.alignment = 'center';
      else if (line.x > line.pageWidth * 0.52) line.alignment = 'right';
      else line.alignment = 'left';
    }
    return bodyFont;
  }

  function segmentLine(line, mode, sensitivity) {
    if (!line.items?.length) return [{ text: line.text, x: line.x, right: line.right }];
    const items = [...line.items].sort((a, b) => a.x - b.x);
    const charWidths = items.map((item) => item.width / Math.max(1, item.text.length)).filter((value) => value > 0 && value < 50);
    const charWidth = median(charWidths) || line.fontSize * 0.5;
    const sensitivityFactor = sensitivity === 'aggressive' ? 1.35 : sensitivity === 'strict' ? 2.5 : 1.85;
    const modeFactor = mode === 'statement' || mode === 'table' ? 0.9 : 1;
    const gapThreshold = Math.max(9, line.fontSize * sensitivityFactor * modeFactor, charWidth * 2.1 * modeFactor);
    const segments = [];
    let current = null;
    for (const item of items) {
      if (!current) {
        current = { items: [item], x: item.x, right: item.x + item.width };
        continue;
      }
      const gap = item.x - current.right;
      if (gap > gapThreshold) {
        current.text = lineJoin(current.items);
        segments.push(current);
        current = { items: [item], x: item.x, right: item.x + item.width };
      } else {
        current.items.push(item);
        current.right = Math.max(current.right, item.x + item.width);
      }
    }
    if (current) {
      current.text = lineJoin(current.items);
      segments.push(current);
    }
    return segments.filter((segment) => segment.text);
  }

  function hasNumericData(text) {
    return /(?:^|\s)[(+-]?(?:[$€£₹¥]\s*)?\d[\d,.]*(?:\.\d+)?%?(?:\s|$)/.test(text);
  }

  function clusterAnchors(values, tolerance) {
    const ordered = [...values].sort((a, b) => a - b);
    const clusters = [];
    for (const value of ordered) {
      const previous = clusters[clusters.length - 1];
      if (!previous || Math.abs(value - previous.mean) > tolerance) clusters.push({ mean: value, values: [value] });
      else {
        previous.values.push(value);
        previous.mean = previous.values.reduce((sum, item) => sum + item, 0) / previous.values.length;
      }
    }
    return clusters.map((cluster) => cluster.mean);
  }

  function detectWrappedTables(lines, pageNumber, pageWidth, options) {
    // Generic coordinate-based table reconstruction.
    //
    // Do not depend on a particular document's column names. Instead:
    // 1. Find a compact group of nearby lines with repeated horizontal anchors.
    // 2. Cluster x-start positions into candidate columns.
    // 3. Use stable row starts to keep wrapped lines in the same row.
    // 4. Assign each text item to the nearest column.
    //
    // This is intentionally conservative: ordinary prose should remain prose.

    if (!Array.isArray(lines) || lines.length < 3) return [];

    const visible = lines.filter((line) =>
      line &&
      !line.repeated &&
      normalizeText(line.text) &&
      (line.items || []).length
    );
    if (visible.length < 3) return [];

    const tolerance = Math.max(7, Math.min(18, pageWidth * 0.018));
    const anchors = [];

    for (const line of visible) {
      const items = [...(line.items || [])]
        .filter((item) => normalizeText(item.text))
        .sort((a, b) => a.x - b.x);

      // Only use meaningful item starts. Very dense character-level fragments
      // are poor column anchors.
      const starts = [];
      for (const item of items) {
        if (!starts.length || item.x - starts[starts.length - 1] > tolerance) {
          starts.push(item.x);
        }
      }
      if (starts.length >= 2 && starts.length <= 8) anchors.push(starts);
    }

    if (anchors.length < 3) return [];

    // Count recurring x anchors across nearby lines.
    const flat = anchors.flat();
    const clusters = clusterAnchors(flat, tolerance);
    if (clusters.length < 2 || clusters.length > 8) return [];

    const support = clusters.map((anchor) => ({
      anchor,
      count: flat.filter((x) => Math.abs(x - anchor) <= tolerance).length,
    }));

    // A real column normally appears on several lines. Require either strong
    // support or participation in a compact multi-column pattern.
    const supported = support
      .filter((item) => item.count >= Math.max(2, Math.ceil(visible.length * 0.12)))
      .map((item) => item.anchor)
      .sort((a, b) => a - b);

    if (supported.length < 2) return [];

    // Candidate groups: neighboring anchors form columns when they repeatedly
    // occur on the same vertical run.
    const candidateColumns = supported;
    const columnForX = (x) => {
      let best = 0;
      let distance = Infinity;
      candidateColumns.forEach((anchor, index) => {
        const d = Math.abs(x - anchor);
        if (d < distance) {
          distance = d;
          best = index;
        }
      });
      return best;
    };

    const rowGap = (a, b) => Math.max(
      14,
      Math.min(34, Math.max(a.bodyFont || a.fontSize || 10, b.bodyFont || b.fontSize || 10) * 2.4)
    );

    const candidates = visible.map((line, index) => {
      const items = [...(line.items || [])].sort((a, b) => a.x - b.x);
      const occupied = new Set(items.map((item) => columnForX(item.x)));
      return {
        line,
        index,
        items,
        occupied,
        startsAtFirst: items.length && Math.abs(items[0].x - candidateColumns[0]) <= Math.max(tolerance, 14),
        multiColumn: occupied.size >= 2,
      };
    });

    // Look for contiguous runs where several columns are repeatedly occupied.
    const runs = [];
    let run = [];

    for (const candidate of candidates) {
      const previous = run[run.length - 1];
      const close = !previous ||
        candidate.line.yTop - previous.line.yBottom <= rowGap(previous.line, candidate.line);

      if (close && (candidate.multiColumn || candidate.startsAtFirst)) {
        run.push(candidate);
      } else {
        if (run.length >= 3) runs.push(run);
        run = (candidate.multiColumn || candidate.startsAtFirst) ? [candidate] : [];
      }
    }
    if (run.length >= 3) runs.push(run);

    if (!runs.length) return [];

    const results = [];

    for (const group of runs) {
      // Reject runs that look like ordinary prose: a table candidate should
      // repeatedly occupy at least three columns, or two columns with stable
      // left/right anchors.
      const occupancy = candidateColumns.map((_, column) =>
        group.filter((entry) => entry.occupied.has(column)).length
      );

      const activeColumns = occupancy.filter((count) =>
        count >= Math.max(2, Math.ceil(group.length * 0.22))
      ).length;

      if (activeColumns < 2) continue;

      // Require spatial evidence of multiple columns.
      const multiColumnLines = group.filter((entry) => entry.occupied.size >= 2).length;
      if (multiColumnLines < Math.max(2, Math.ceil(group.length * 0.25))) continue;

      // Build rows. A new row begins when text returns to the left-most
      // column after the previous row, or when vertical spacing indicates a
      // fresh row. Continuation lines stay in the current row.
      const rows = [];
      let current = null;
      const usedLineIndexes = [];

      for (const entry of group) {
        const line = entry.line;
        const startsFirst = entry.startsAtFirst;

        if (!current || (startsFirst && current.length && (
          line.yTop - current[current.length - 1].yBottom > rowGap(current[current.length - 1], line)
          || entry.items.some((item) => columnForX(item.x) === 0)
        ))) {
          if (current) rows.push(current);
          current = [];
        }

        current.push(line);
        usedLineIndexes.push(line.index);
      }
      if (current) rows.push(current);

      if (rows.length < 2) continue;

      const tableRows = [];

      for (const rowLines of rows) {
        const cells = Array.from({ length: candidateColumns.length }, () => []);

        for (const line of rowLines) {
          const items = [...(line.items || [])]
            .filter((item) => normalizeText(item.text))
            .sort((a, b) => a.x - b.x);

          for (const item of items) {
            let column = columnForX(item.x);

            // If the item starts well after the final detected anchor, attach
            // it to the last column rather than inventing a new column.
            column = Math.max(0, Math.min(candidateColumns.length - 1, column));

            const value = normalizeText(item.text);
            if (value) cells[column].push(value);
          }
        }

        const normalizedCells = cells.map((cell) => normalizeText(cell.join(" ")));
        const nonEmpty = normalizedCells.filter(Boolean).length;

        if (nonEmpty >= 2) tableRows.push(normalizedCells);
      }

      if (tableRows.length < 2) continue;

      // Remove empty trailing columns, but keep the table's left-to-right
      // structure intact.
      let lastUsed = tableRows.reduce((max, row) => {
        for (let i = row.length - 1; i >= 0; i -= 1) {
          if (row[i]) return Math.max(max, i);
        }
        return max;
      }, -1);

      if (lastUsed < 1) continue;
      const trimmedRows = tableRows.map((row) => row.slice(0, lastUsed + 1));

      // Reject obvious paragraph-like false positives.
      const rowWidths = trimmedRows.map((row) => row.filter(Boolean).length);
      const avgWidth = rowWidths.reduce((a, b) => a + b, 0) / rowWidths.length;
      if (avgWidth < 1.8) continue;

      const confidence = Math.min(
        0.94,
        0.55 +
        Math.min(0.22, activeColumns * 0.04) +
        Math.min(0.17, multiColumnLines / Math.max(1, group.length) * 0.25)
      );

      const lineIndexes = [...new Set(usedLineIndexes)];

      results.push({
        id: `p${pageNumber}-coordinate-table-${results.length + 1}`,
        pageNumber,
        title: `Page ${pageNumber} — Table ${results.length + 1}`,
        rows: trimmedRows,
        confidence,
        lineIndexes,
        yTop: Math.min(...group.map((entry) => entry.line.yTop)),
        yBottom: Math.max(...group.map((entry) => entry.line.yBottom)),
      });
    }

    return results;
  }


  function filterPlausibleTables(tables) {
    return tables.filter((table) => {
      if (!table?.rows || table.rows.length < 2) return false;
      const width = table.rows[0]?.length || 0;
      if (width < 2) return false;

      const longCells = table.rows.flat().filter((cell) =>
        String(cell || '').length > 220
      ).length;

      // A generic text block with a few arbitrary gaps is not a table.
      if (width <= 2 && longCells >= Math.max(2, Math.ceil(table.rows.length * 0.5))) {
        return false;
      }

      const populated = table.rows.map((row) =>
        row.filter((cell) => normalizeText(cell)).length
      );
      const average = populated.reduce((a, b) => a + b, 0) / populated.length;

      return average >= 1.7;
    });
  }

  function detectTables(lines, pageNumber, pageWidth, options) {
    const wrapped = detectWrappedTables(lines, pageNumber, pageWidth, options);
    if (wrapped.length) return wrapped;

    const { mode, sensitivity } = options;
    const candidates = lines.map((line) => {
      const segments = segmentLine(line, mode, sensitivity);
      const numeric = hasNumericData(line.text);
      const useful = segments.length >= 2 && segments.length <= 16 && (numeric || mode === 'table' || mode === 'statement' || segments.length >= 3);
      return { line, segments, useful };
    });

    const groups = [];
    let group = [];
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const previous = group[group.length - 1];
      const gap = previous ? candidate.line.yTop - previous.line.yBottom : 0;
      const close = !previous || gap < Math.max(28, candidate.line.bodyFont * 2.8);
      if (candidate.useful && close) group.push(candidate);
      else {
        if (group.length >= 2) groups.push(group);
        group = candidate.useful ? [candidate] : [];
      }
    }
    if (group.length >= 2) groups.push(group);

    const sensitivityMinimum = sensitivity === 'aggressive' ? 0.31 : sensitivity === 'strict' ? 0.58 : 0.44;
    const tables = [];
    groups.forEach((rows, groupIndex) => {
      const anchors = clusterAnchors(rows.flatMap((row) => row.segments.map((segment) => segment.x)), Math.max(10, pageWidth * 0.018));
      if (anchors.length < 2 || anchors.length > 16) return;
      const matrix = rows.map((row) => {
        const cells = Array.from({ length: anchors.length }, () => '');
        row.segments.forEach((segment) => {
          let bestIndex = 0;
          let bestDistance = Infinity;
          anchors.forEach((anchor, anchorIndex) => {
            const distance = Math.abs(segment.x - anchor);
            if (distance < bestDistance) { bestDistance = distance; bestIndex = anchorIndex; }
          });
          cells[bestIndex] = normalizeText(`${cells[bestIndex]} ${segment.text}`);
        });
        return cells;
      });
      const occupancy = anchors.map((_, column) => matrix.filter((row) => row[column]).length);
      const minimumOccupancy = Math.max(2, Math.ceil(matrix.length * (sensitivity === 'aggressive' ? 0.22 : 0.34)));
      const keepColumns = occupancy.map((count, index) => ({ count, index })).filter((item) => item.count >= minimumOccupancy).map((item) => item.index);
      if (keepColumns.length < 2) return;
      const cleaned = matrix.map((row) => keepColumns.map((column) => row[column] || ''));
      const filledPerRow = cleaned.map((row) => row.filter(Boolean).length);
      const consistency = filledPerRow.reduce((sum, count) => sum + count / keepColumns.length, 0) / cleaned.length;
      const numericCells = cleaned.flat().filter((value) => hasNumericData(value)).length;
      const nonEmptyCells = cleaned.flat().filter(Boolean).length || 1;
      const numericRatio = numericCells / nonEmptyCells;
      let confidence = 0.16;
      confidence += Math.min(0.24, cleaned.length * 0.035);
      confidence += Math.min(0.2, keepColumns.length * 0.045);
      confidence += consistency * 0.24;
      confidence += Math.min(0.18, numericRatio * 0.55);
      if (mode === 'table' || mode === 'statement') confidence += 0.08;
      if (keepColumns.length === 2 && numericRatio < 0.12 && cleaned.length < 4) confidence -= 0.24;
      confidence = clamp(confidence, 0, 0.99);
      if (confidence < sensitivityMinimum) return;
      const lineIndexes = rows.map((row) => row.line.index);
      tables.push({
        id: `p${pageNumber}-t${groupIndex + 1}`,
        pageNumber,
        title: `Page ${pageNumber} — Table ${tables.length + 1}`,
        rows: cleaned,
        confidence,
        lineIndexes,
        yTop: Math.min(...rows.map((row) => row.line.yTop)),
        yBottom: Math.max(...rows.map((row) => row.line.yBottom)),
      });
    });
    return filterPlausibleTables(tables);
  }

  function mergeParagraphText(current, next) {
    const left = normalizeText(current);
    const right = normalizeText(next);
    if (!left) return right;
    if (!right) return left;
    if (/[-‐‑]$/.test(left) && /^[\p{Ll}]/u.test(right)) return `${left.slice(0, -1)}${right}`;
    return `${left} ${right}`;
  }

  function createPageBlocks(page, options) {
    const lines = page.lines.filter((line) => !line.repeated);
    classifyLines(lines);
    const tables = detectTables(lines, page.pageNumber, page.width, options);
    const tableByFirstLine = new Map();
    const tableLines = new Set();
    for (const table of tables) {
      tableByFirstLine.set(Math.min(...table.lineIndexes), table);
      table.lineIndexes.forEach((index) => tableLines.add(index));
    }

    const blocks = [];
    let currentParagraph = null;
    const flushParagraph = () => {
      if (currentParagraph) blocks.push(currentParagraph);
      currentParagraph = null;
    };

    for (const line of lines) {
      if (tableByFirstLine.has(line.index)) {
        flushParagraph();
        blocks.push({ type: 'table', table: tableByFirstLine.get(line.index), yTop: line.yTop });
        continue;
      }
      if (tableLines.has(line.index)) continue;
      if (/^\s*\d+\s*$/.test(line.text) && (line.yTop < page.height * 0.08 || line.yTop > page.height * 0.92)) continue;

      if (line.kind.startsWith('heading')) {
        flushParagraph();
        blocks.push({ type: line.kind, text: line.text, bold: line.bold, italic: line.italic, alignment: line.alignment, yTop: line.yTop });
        continue;
      }
      if (line.kind === 'list') {
        flushParagraph();
        const text = line.text.replace(/^\s*(?:[•●▪◦–—-]|\d+[.)]|[A-Za-z][.)])\s+/, '');
        blocks.push({ type: 'list', text, bold: line.bold, italic: line.italic, alignment: line.alignment, yTop: line.yTop });
        continue;
      }

      if (!currentParagraph) {
        currentParagraph = { type: 'paragraph', text: line.text, bold: line.bold, italic: line.italic, alignment: line.alignment, yTop: line.yTop, lastLine: line };
        continue;
      }
      const previous = currentParagraph.lastLine;
      const verticalGap = line.yTop - previous.yBottom;
      const indentGap = Math.abs(line.x - previous.x);
      const sameColumn = indentGap < Math.max(22, page.width * 0.045);
      const sameStyle = Math.abs(line.fontSize - previous.fontSize) < Math.max(2.5, previous.bodyFont * 0.28);
      const close = verticalGap < Math.max(12, previous.bodyFont * 1.15);
      const likelyContinuation = close && sameColumn && sameStyle && previous.kind === 'body';
      if (likelyContinuation) {
        currentParagraph.text = mergeParagraphText(currentParagraph.text, line.text);
        currentParagraph.bold = currentParagraph.bold && line.bold;
        currentParagraph.italic = currentParagraph.italic && line.italic;
        currentParagraph.lastLine = line;
      } else {
        flushParagraph();
        currentParagraph = { type: 'paragraph', text: line.text, bold: line.bold, italic: line.italic, alignment: line.alignment, yTop: line.yTop, lastLine: line };
      }
    }
    flushParagraph();
    blocks.forEach((block) => { delete block.lastLine; });
    return { ...page, tables, blocks };
  }

  function markRepeatedHeadersAndFooters(pages) {
    if (pages.length < 2 || !$('officeRemoveHeaders').checked) return;
    const frequency = new Map();
    pages.forEach((page) => {
      const seen = new Set();
      page.lines.forEach((line) => {
        const nearEdge = line.yTop < page.height * 0.13 || line.yBottom > page.height * 0.87;
        if (!nearEdge) return;
        const key = normalizeRepeatedText(line.text);
        if (key.length < 3 || seen.has(key)) return;
        seen.add(key);
        frequency.set(key, (frequency.get(key) || 0) + 1);
      });
    });
    const threshold = Math.max(2, Math.ceil(pages.length * 0.55));
    pages.forEach((page) => {
      page.lines.forEach((line) => {
        const nearEdge = line.yTop < page.height * 0.13 || line.yBottom > page.height * 0.87;
        const key = normalizeRepeatedText(line.text);
        if (nearEdge && key && (frequency.get(key) || 0) >= threshold) line.repeated = true;
      });
    });
  }

  function confidenceLabel(value) {
    if (value >= 0.78) return 'High';
    if (value >= 0.55) return 'Medium';
    return 'Review';
  }

  function deepCopyTables(tables) {
    return tables.map((table) => ({ ...table, rows: table.rows.map((row) => [...row]) }));
  }

  function createFallbackTables(pages) {
    return pages.map((page) => ({
      id: `p${page.pageNumber}-text`,
      pageNumber: page.pageNumber,
      title: `Page ${page.pageNumber} — Extracted rows`,
      confidence: 0.35,
      fallback: true,
      rows: [['Line', 'Text'], ...page.lines.filter((line) => !line.repeated).map((line, index) => [String(index + 1), line.text])],
    })).filter((table) => table.rows.length > 1);
  }

  async function analyzePdf() {
    const file = $('officeFile').files[0];
    if (!file) return setStatus('Select a PDF file.', 'error');
    if (!window.pdfjsLib) return setStatus('PDF.js could not be loaded. Check your internet connection and refresh.', 'error');

    resetResults(false);
    state.cancelled = false;
    setBusy(true);
    updateProgress(1, 'Opening PDF…');

    try {
      const pdfJs = await loadPdfJs(file);
      state.pdfDocument = pdfJs;
      const pageIndexes = parsePageRanges($('officeRanges').value, pdfJs.numPages);
      if (!pageIndexes.length) throw new Error('No pages were selected.');
      const mode = $('officeMode').value;
      const sensitivity = $('officeTableSensitivity').value;
      const ocrMode = mode === 'scan' ? 'always' : $('officeOcrMode').value;
      const language = $('officeOcrLanguage').value;
      const ocrQuality = $('officeOcrQuality')?.value || 'high';
      const pages = [];
      const warnings = [];
      let selectablePages = 0;
      let ocrPages = 0;
      let blankPages = 0;

      for (let position = 0; position < pageIndexes.length; position += 1) {
        if (state.cancelled) throw new Error('Conversion analysis was cancelled.');
        const pageNumber = pageIndexes[position] + 1;
        const page = await pdfJs.getPage(pageNumber);
        const progressStart = 4 + (position / pageIndexes.length) * 82;
        const progressSpan = 82 / pageIndexes.length;
        $('officeProgress').dataset.pageBase = String(progressStart);
        $('officeProgress').dataset.pageSpan = String(Math.max(2, progressSpan * 0.75));
        updateProgress(progressStart, `Analyzing page ${position + 1} of ${pageIndexes.length}…`);

        let source = 'selectable';
        let extracted;
        const textContent = await page.getTextContent({ includeMarkedContent: true, disableCombineTextItems: false });
        extracted = extractSelectableItems(page, textContent);
        const characterCount = extracted.items.reduce((sum, item) => sum + item.text.length, 0);
        const shouldOcr = ocrMode === 'always' || (ocrMode === 'auto' && characterCount < 24);
        if (shouldOcr) {
          source = 'ocr';
          const rendered = await renderPageForOcr(page, ocrQuality);
          const worker = await ensureOfficeOcrWorker(language);
          if (worker.setParameters) {
            await worker.setParameters({
              preserve_interword_spaces: '1',
              tessedit_pageseg_mode: '6',
            });
          }
          const result = await worker.recognize(rendered.canvas);
          extracted = {
            items: ocrWordsToItems(result.data, rendered.canvas.width, rendered.canvas.height, rendered.pageWidth, rendered.pageHeight),
            width: rendered.pageWidth,
            height: rendered.pageHeight,
          };
          rendered.canvas.width = 1;
          rendered.canvas.height = 1;
          ocrPages += 1;
        } else if (characterCount > 0) selectablePages += 1;

        const lines = groupItemsIntoLines(extracted.items, extracted.width);
        if (!lines.length) {
          blankPages += 1;
          warnings.push(`Page ${pageNumber}: no readable text was detected.`);
        }
        pages.push({ pageNumber, width: extracted.width, height: extracted.height, lines, source });
        updateProgress(progressStart + progressSpan * 0.9, `Page ${position + 1} analyzed.`);
        await yieldToBrowser();
      }

      markRepeatedHeadersAndFooters(pages);
      const structuredPages = pages.map((page) => createPageBlocks(page, { mode, sensitivity }));
      const detectedTables = structuredPages.flatMap((page) => page.tables);
      const paragraphs = structuredPages.flatMap((page) => page.blocks).filter((block) => block.type === 'paragraph').length;
      const headings = structuredPages.flatMap((page) => page.blocks).filter((block) => block.type.startsWith('heading')).length;
      const lists = structuredPages.flatMap((page) => page.blocks).filter((block) => block.type === 'list').length;
      detectedTables.filter((table) => table.confidence < 0.58).forEach((table) => warnings.push(`${table.title}: uncertain column alignment; review the table preview.`));
      if (!detectedTables.length) warnings.push('No confident tables were detected. Excel/CSV will use page-and-line fallback sheets unless you retry with Table mode or Aggressive sensitivity.');
      if (ocrPages) warnings.push(`${ocrPages} page${ocrPages === 1 ? '' : 's'} used OCR. Review names, numbers and table boundaries carefully.`);
      if (pageIndexes.length > 80) warnings.push('Large document: exporting a very large DOCX or workbook may use substantial device memory.');

      const recommendedWordMode = ocrPages > selectablePages ? 'hybrid' : (detectedTables.length && ocrPages ? 'hybrid' : 'editable');
      const lowConfidenceLines = structuredPages.flatMap((page) => page.lines || []).filter((line) => Number.isFinite(line.confidence) && line.confidence < 70).length;
      if (lowConfidenceLines) warnings.push(`${lowConfidenceLines} OCR line${lowConfidenceLines === 1 ? '' : 's'} had lower recognition confidence. Check names, dates, amounts and signatures before relying on the exported text.`);

      state.analysis = {
        fileName: file.name,
        pageCount: pdfJs.numPages,
        selectedPages: pageIndexes.map((index) => index + 1),
        pages: structuredPages,
        tables: detectedTables,
        stats: { paragraphs, headings, lists, tableCount: detectedTables.length, selectablePages, ocrPages, blankPages },
        recommendedWordMode,
        warnings,
        analyzedAt: new Date(),
      };
      state.originalTables = deepCopyTables(detectedTables.length ? detectedTables : createFallbackTables(structuredPages));
      state.tables = deepCopyTables(state.originalTables);
      state.selectedTable = 0;
      renderResults();
      updateProgress(100, 'Structure analysis completed.');
      setStatus(`Analyzed ${pageIndexes.length} page${pageIndexes.length === 1 ? '' : 's'}: ${paragraphs} paragraphs, ${headings} headings and ${detectedTables.length} detected table${detectedTables.length === 1 ? '' : 's'}.`, 'success');
    } catch (error) {
      setStatus(humanError(error), /cancel/i.test(String(error?.message)) ? '' : 'error');
    } finally {
      if (state.ocrWorker) await state.ocrWorker.terminate().catch(() => {});
      state.ocrWorker = null;
      setBusy(false);
    }
  }

  function renderResults() {
    if (!state.analysis) return;
    const { stats, selectedPages, warnings } = state.analysis;
    $('officeResults').hidden = false;
    const recommended = state.analysis.recommendedWordMode === 'hybrid' ? 'Layout-preserving Word' : 'Editable Word';
    const rec = $('officeRecommendation');
    if (rec) {
      rec.hidden = false;
      rec.innerHTML = `<div class="recommendation-icon">✦</div><div><strong>Recommended for this document: ${escapeHtml(recommended)}</strong><span>${state.analysis.stats.ocrPages ? 'Some pages need OCR, so keeping the original page image protects layout, signatures and tables while editable OCR remains available.' : 'The PDF contains selectable text, so a clean editable reconstruction is usually the most direct option.'}</span></div><button type="button" id="officeUseRecommendation">Use recommendation</button>`;
      $('officeUseRecommendation').onclick = () => { $('officeWordMode').value = state.analysis.recommendedWordMode; renderOutputPreview(); rec.classList.add('applied'); };
    }
    const chip = $('officeOutputChip');
    if (chip) chip.textContent = `${state.analysis.stats.ocrPages ? 'OCR' : 'TEXT'} • ${state.analysis.stats.tableCount} TABLE${state.analysis.stats.tableCount === 1 ? '' : 'S'}`;
    $('officeSummary').innerHTML = [
      ['Pages', selectedPages.length],
      ['Paragraphs', stats.paragraphs],
      ['Headings', stats.headings],
      ['Lists', stats.lists],
      ['Tables', stats.tableCount],
      ['OCR pages', stats.ocrPages],
    ].map(([label, value]) => `<div class="office-metric"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`).join('');

    const warningBox = $('officeWarnings');
    if (warnings.length) {
      warningBox.hidden = false;
      warningBox.innerHTML = `<strong>Review notes</strong><ul>${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>`;
    } else {
      warningBox.hidden = true;
      warningBox.innerHTML = '';
    }
    renderOutputPreview();
  }

  function renderOutputPreview() {
    if (!state.analysis) return;
    const output = $('officeOutput').value;
    const spreadsheet = output === 'xlsx' || output === 'csv';
    $('officeDocumentPreview').hidden = spreadsheet;
    const hasDetectedTables = state.analysis.stats.tableCount > 0;
    $('officeTableWorkspace').hidden = spreadsheet ? !state.tables.length : !hasDetectedTables;
    $('officeExport').textContent = output === 'docx' ? 'Export Word document' : output === 'xlsx' ? 'Export Excel workbook' : 'Export CSV file(s)';
    const selectedWordMode = $('officeWordMode')?.value || 'smart';
    const previewWordMode = selectedWordMode === 'smart' && state.analysis ? state.analysis.recommendedWordMode : selectedWordMode;
    $('officePreviewHelp').textContent = output === 'docx'
      ? ((previewWordMode === 'visual')
        ? 'High-fidelity mode keeps each selected PDF page as an image, preserving logos, signatures, tables and layout.'
        : (previewWordMode === 'hybrid'
          ? 'Hybrid mode keeps the original page image and adds editable OCR content for each page.'
          : 'Editable mode reconstructs headings, paragraphs, lists and tables. Best for clean selectable PDFs.'))
      : 'Review and edit detected table cells. Each table becomes a separate Excel sheet or CSV file.';

    if (!spreadsheet) renderDocumentPreview();
    if (spreadsheet || hasDetectedTables) renderTableSelector();
  }

  function renderDocumentPreview() {
    const container = $('officeDocumentPreview');
    const pages = state.analysis.pages.slice(0, 12);
    let blockCount = 0;
    const fragments = [];
    for (const page of pages) {
      fragments.push(`<section class="office-preview-page"><div class="office-page-label">Page ${page.pageNumber} • ${page.source === 'ocr' ? 'OCR' : 'Selectable text'}</div>`);
      for (const block of page.blocks) {
        if (blockCount >= 120) break;
        blockCount += 1;
        if (block.type === 'table') {
          const rows = getCurrentTableRows(block.table.id, block.table.rows).slice(0, 8);
          fragments.push(`<div class="office-mini-table">${rows.map((row) => `<div>${row.map((cell) => `<span>${escapeHtml(cell)}</span>`).join('')}</div>`).join('')}</div>`);
        } else if (block.type.startsWith('heading')) {
          const level = block.type === 'heading1' ? 'h3' : block.type === 'heading2' ? 'h4' : 'h5';
          fragments.push(`<${level}>${escapeHtml(block.text)}</${level}>`);
        } else if (block.type === 'list') fragments.push(`<p class="office-list-item">• ${escapeHtml(block.text)}</p>`);
        else fragments.push(`<p>${escapeHtml(block.text)}</p>`);
      }
      if (blockCount >= 120) fragments.push('<p class="mode-help">Preview shortened for performance. The full selected document will be exported.</p>');
      fragments.push('</section>');
      if (blockCount >= 120) break;
    }
    container.innerHTML = fragments.join('');
  }

  function renderTableSelector() {
    const select = $('officeTableSelect');
    select.innerHTML = '';
    if (!state.tables.length) {
      $('officeTableWorkspace').hidden = true;
      return;
    }
    state.tables.forEach((table, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = `${table.title} (${confidenceLabel(table.confidence)} confidence)`;
      select.appendChild(option);
    });
    state.selectedTable = clamp(state.selectedTable, 0, state.tables.length - 1);
    select.value = String(state.selectedTable);
    renderSelectedTable();
  }

  function renderSelectedTable() {
    const table = state.tables[state.selectedTable];
    const preview = $('officeTablePreview');
    preview.innerHTML = '';
    if (!table) return;
    const maxColumns = Math.max(1, ...table.rows.map((row) => row.length));
    table.rows.forEach((row, rowIndex) => {
      const tr = document.createElement('tr');
      tr.dataset.row = String(rowIndex);
      for (let column = 0; column < maxColumns; column += 1) {
        const cell = rowIndex === 0 && $('officeFirstRowHeader').checked ? document.createElement('th') : document.createElement('td');
        cell.contentEditable = 'true';
        cell.spellcheck = false;
        cell.dataset.row = String(rowIndex);
        cell.dataset.column = String(column);
        cell.textContent = row[column] || '';
        cell.addEventListener('input', () => {
          while (table.rows[rowIndex].length <= column) table.rows[rowIndex].push('');
          table.rows[rowIndex][column] = normalizeText(cell.textContent);
          if ($('officeOutput').value === 'docx') renderDocumentPreview();
        });
        tr.appendChild(cell);
      }
      preview.appendChild(tr);
    });
  }

  function cleanCurrentTable() {
    const table = state.tables[state.selectedTable];
    if (!table) return;
    let rows = table.rows.map((row) => row.map(normalizeText));
    rows = rows.filter((row) => row.some(Boolean));
    const maxColumns = Math.max(0, ...rows.map((row) => row.length));
    const keep = [];
    for (let column = 0; column < maxColumns; column += 1) {
      if (rows.some((row) => normalizeText(row[column]))) keep.push(column);
    }
    table.rows = rows.length && keep.length ? rows.map((row) => keep.map((column) => row[column] || '')) : [['']];
    renderSelectedTable();
  }

  function getCurrentTableRows(id, fallback) {
    return state.tables.find((table) => table.id === id)?.rows || fallback || [];
  }

  function alignmentValue(docxApi, alignment) {
    if (alignment === 'center') return docxApi.AlignmentType.CENTER;
    if (alignment === 'right') return docxApi.AlignmentType.RIGHT;
    return docxApi.AlignmentType.LEFT;
  }

  function wordTable(docxApi, table) {
    const rows = getCurrentTableRows(table.id, table.rows);
    const { Table, TableRow, TableCell, Paragraph, TextRun, WidthType, BorderStyle } = docxApi;
    const border = { style: BorderStyle.SINGLE, size: 1, color: 'D9DEE8' };
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
      rows: rows.map((row, rowIndex) => new TableRow({
        tableHeader: rowIndex === 0 && $('officeFirstRowHeader').checked,
        children: row.map((cell) => new TableCell({
          shading: rowIndex === 0 && $('officeFirstRowHeader').checked ? { fill: 'EEF2FF' } : undefined,
          children: [new Paragraph({ children: [new TextRun({ text: String(cell || ''), bold: rowIndex === 0 && $('officeFirstRowHeader').checked, size: 18 })] })],
        })),
      })),
    });
  }

  async function canvasToPngBytes(canvas) {
    const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Could not render PDF page image.')), 'image/png', 0.95));
    return new Uint8Array(await blob.arrayBuffer());
  }

  async function renderOriginalPageImage(pageNumber) {
    if (!state.pdfDocument) throw new Error('The source PDF is no longer available. Analyze the PDF again before exporting.');
    const page = await state.pdfDocument.getPage(pageNumber);
    const natural = page.getViewport({ scale: 1 });
    const scale = Math.min(3.0, Math.max(2.0, 2000 / Math.max(natural.width, natural.height)));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const context = canvas.getContext('2d', { alpha: false });
    await page.render({ canvasContext: context, viewport, background: 'white' }).promise;
    return { data: await canvasToPngBytes(canvas), width: canvas.width, height: canvas.height };
  }

  async function exportVisualDocx(hybrid = false) {
    if (!window.docx) throw new Error('The Word export library could not be loaded. Check your connection and refresh.');
    const d = window.docx;
    const { Document, Packer, Paragraph, TextRun, ImageRun, PageBreak } = d;
    const children = [];
    const pageWidth = 540;
    const pageHeight = 765;

    for (let index = 0; index < state.analysis.selectedPages.length; index += 1) {
      const pageNumber = state.analysis.selectedPages[index];
      const image = await renderOriginalPageImage(pageNumber);
      const ratio = Math.min(pageWidth / image.width, pageHeight / image.height);
      const imageWidth = Math.max(1, Math.round(image.width * ratio));
      const imageHeight = Math.max(1, Math.round(image.height * ratio));

      // The source page gets its own clean Word page. In hybrid mode the OCR
      // deliberately starts on a NEW page; putting OCR below the image makes
      // the document look broken and can split the editable text unpredictably.
      children.push(new Paragraph({
        alignment: d.AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
        children: [new ImageRun({ data: image.data, transformation: { width: imageWidth, height: imageHeight } })],
      }));
      children.push(new Paragraph({ children: [new PageBreak()] }));

      if (hybrid) {
        children.push(new Paragraph({
          heading: d.HeadingLevel.HEADING_1,
          children: [new TextRun({ text: `Editable OCR — Page ${pageNumber}`, bold: true, size: 26 })],
        }));
        children.push(new Paragraph({
          children: [new TextRun({
            text: 'This section is the editable reconstruction. The page immediately before it is the faithful visual copy of the original PDF page.',
            italics: true, size: 18,
          })],
          spacing: { after: 180 },
        }));
        const blocks = state.analysis.pages.find((page) => page.pageNumber === pageNumber)?.blocks || [];
        if (!blocks.length) {
          children.push(new Paragraph({ children: [new TextRun({ text: 'No editable OCR text was detected on this page.', size: 20 })] }));
        }
        for (const block of blocks) {
          if (block.type === 'table') {
            children.push(wordTable(d, block.table));
            children.push(new Paragraph({ children: [] }));
          } else {
            const options = {
              alignment: alignmentValue(d, block.alignment),
              spacing: { after: block.type.startsWith('heading') ? 120 : 100, line: 276 },
              children: [new TextRun({ text: block.text, bold: block.bold, italics: block.italic, size: block.type.startsWith('heading') ? 24 : 20 })],
            };
            if (block.type === 'heading1') options.heading = d.HeadingLevel.HEADING_1;
            if (block.type === 'heading2') options.heading = d.HeadingLevel.HEADING_2;
            if (block.type === 'heading3') options.heading = d.HeadingLevel.HEADING_3;
            if (block.type === 'list') options.bullet = { level: 0 };
            children.push(new Paragraph(options));
          }
        }
      }

      if (index < state.analysis.selectedPages.length - 1) {
        children.push(new Paragraph({ children: [new PageBreak()] }));
      }
    }

    const document = new Document({
      creator: 'Velzarytha PDF Toolkit',
      title: baseName(state.analysis.fileName),
      description: hybrid ? 'Faithful PDF pages followed by editable OCR from Velzarytha' : 'Faithful PDF-to-Word conversion by Velzarytha',
      styles: {
        default: { document: { run: { font: 'Arial', size: 20 }, paragraph: { spacing: { after: 100, line: 276 } } } },
      },
      sections: [{ properties: { page: { margin: { top: 360, right: 540, bottom: 360, left: 540 } } }, children }],
    });
    const blob = await Packer.toBlob(document);
    const suffix = hybrid ? 'faithful-editable' : 'faithful-copy';
    downloadBlob(blob, `${baseName(state.analysis.fileName)}-${suffix}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  }

  async function exportDocx() {
    if (!window.docx) throw new Error('The Word export library could not be loaded. Check your connection and refresh.');
    const d = window.docx;
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, PageBreak } = d;
    const children = [];
    state.analysis.pages.forEach((page, pageIndex) => {
      page.blocks.forEach((block) => {
        if (block.type === 'table') {
          children.push(wordTable(d, block.table));
          children.push(new Paragraph({ children: [] }));
          return;
        }
        const options = {
          alignment: alignmentValue(d, block.alignment),
          spacing: { after: block.type.startsWith('heading') ? 120 : 150, line: 276 },
          children: [new TextRun({ text: block.text, bold: block.bold, italics: block.italic, size: block.type.startsWith('heading') ? 26 : 22 })],
        };
        if (block.type === 'heading1') options.heading = HeadingLevel.HEADING_1;
        if (block.type === 'heading2') options.heading = HeadingLevel.HEADING_2;
        if (block.type === 'heading3') options.heading = HeadingLevel.HEADING_3;
        if (block.type === 'list') options.bullet = { level: 0 };
        children.push(new Paragraph(options));
      });
      if ($('officePageBreaks').checked && pageIndex < state.analysis.pages.length - 1) children.push(new Paragraph({ children: [new PageBreak()] }));
    });
    const document = new Document({
      creator: 'Velzarytha PDF Toolkit',
      title: baseName(state.analysis.fileName),
      description: 'Structured conversion from PDF by Velzarytha',
      styles: {
        default: { document: { run: { font: 'Arial', size: 22 }, paragraph: { spacing: { after: 140, line: 276 } } } },
      },
      sections: [{ properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } }, children }],
    });
    const blob = await Packer.toBlob(document);
    downloadBlob(blob, `${baseName(state.analysis.fileName)}-structured.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  }

  function inferCell(text) {
    const raw = normalizeText(text);
    if (!$('officeInferValues').checked || !raw) return { value: raw };
    const negative = /^\(.*\)$/.test(raw);
    const stripped = raw.replace(/[()]/g, '').replace(/[$€£₹¥,\s]/g, '');
    if (/^[+-]?\d+(?:\.\d+)?%$/.test(stripped)) return { value: Number(stripped.slice(0, -1)) / 100, format: '0.00%' };
    if (/^[+-]?\d+(?:\.\d+)?$/.test(stripped) && !/^0\d{2,}$/.test(stripped)) {
      const number = Number(stripped) * (negative ? -1 : 1);
      const currency = /[$€£₹¥]/.test(raw);
      return { value: number, format: currency ? '#,##0.00;[Red]-#,##0.00' : Number.isInteger(number) ? '0' : '0.00########' };
    }
    const dateMatch = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
    if (dateMatch) {
      const first = Number(dateMatch[1]);
      const second = Number(dateMatch[2]);
      let year = Number(dateMatch[3]);
      if (year < 100) year += year >= 70 ? 1900 : 2000;
      const month = first > 12 ? second : first;
      const day = first > 12 ? first : second;
      const date = new Date(Date.UTC(year, month - 1, day));
      if (!Number.isNaN(date.getTime())) return { value: date, format: 'yyyy-mm-dd' };
    }
    return { value: raw };
  }

  function safeSheetName(name, used) {
    let cleaned = String(name || 'Table').replace(/[\\/?*:[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Table';
    let candidate = cleaned;
    let counter = 2;
    while (used.has(candidate.toLowerCase())) {
      const suffix = ` ${counter}`;
      candidate = `${cleaned.slice(0, 31 - suffix.length)}${suffix}`;
      counter += 1;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  }

  function createWorksheet(table) {
    const rows = table.rows.map((row) => row.map((cell) => inferCell(cell)));
    const aoa = rows.map((row) => row.map((cell) => cell.value));
    const sheet = window.XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
    rows.forEach((row, rowIndex) => row.forEach((cell, columnIndex) => {
      if (!cell.format) return;
      const address = window.XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      if (sheet[address]) sheet[address].z = cell.format;
    }));
    const maxColumns = Math.max(1, ...table.rows.map((row) => row.length));
    sheet['!cols'] = Array.from({ length: maxColumns }, (_, column) => ({
      wch: clamp(Math.max(8, ...table.rows.map((row) => String(row[column] || '').length + 2)), 8, 42),
    }));
    if ($('officeFirstRowHeader').checked && table.rows.length && maxColumns) {
      sheet['!autofilter'] = { ref: window.XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: table.rows.length - 1, c: maxColumns - 1 } }) };
    }
    return sheet;
  }

  async function exportXlsx() {
    if (!window.XLSX) throw new Error('The Excel export library could not be loaded. Check your connection and refresh.');
    if (!state.tables.length) throw new Error('No table or fallback rows are available for spreadsheet export.');
    const workbook = window.XLSX.utils.book_new();
    const used = new Set();
    if ($('officeAddReport').checked) {
      const reportRows = [
        ['Velzarytha structured PDF conversion'],
        ['Source file', state.analysis.fileName],
        ['Selected pages', state.analysis.selectedPages.join(', ')],
        ['Detected tables', state.analysis.stats.tableCount],
        ['OCR pages', state.analysis.stats.ocrPages],
        ['Generated', state.analysis.analyzedAt.toISOString()],
        [],
        ['Review notes'],
        ...state.analysis.warnings.map((warning) => [warning]),
      ];
      const report = window.XLSX.utils.aoa_to_sheet(reportRows);
      report['!cols'] = [{ wch: 28 }, { wch: 70 }];
      window.XLSX.utils.book_append_sheet(workbook, report, safeSheetName('Conversion Report', used));
    }
    state.tables.forEach((table, index) => {
      const name = safeSheetName(table.fallback ? `Page ${table.pageNumber}` : `P${table.pageNumber} Table ${index + 1}`, used);
      window.XLSX.utils.book_append_sheet(workbook, createWorksheet(table), name);
    });
    const data = window.XLSX.write(workbook, { type: 'array', bookType: 'xlsx', compression: true, cellDates: true });
    downloadBlob(data, `${baseName(state.analysis.fileName)}-tables.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  function csvEscape(value) {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  async function exportCsv() {
    if (!state.tables.length) throw new Error('No table or fallback rows are available for CSV export.');
    const files = state.tables.map((table, index) => ({
      name: `${baseName(state.analysis.fileName)}-page-${table.pageNumber}-table-${index + 1}.csv`,
      content: `\uFEFF${table.rows.map((row) => row.map(csvEscape).join(',')).join('\r\n')}`,
    }));
    if (files.length === 1) return downloadBlob(files[0].content, files[0].name, 'text/csv;charset=utf-8');
    if (!window.JSZip) throw new Error('ZIP library could not be loaded.');
    const zip = new window.JSZip();
    files.forEach((file) => zip.file(file.name, file.content));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    downloadBlob(blob, `${baseName(state.analysis.fileName)}-csv-tables.zip`, 'application/zip');
  }

  async function exportOffice() {
    if (!state.analysis) return setStatus('Analyze the PDF before exporting.', 'error');
    $('officeExport').disabled = true;
    setStatus('Creating structured output…', 'working');
    try {
      const output = $('officeOutput').value;
      if (output === 'docx') {
        const mode = $('officeWordMode')?.value || 'smart';
        const resolvedMode = mode === 'smart' ? (state.analysis.recommendedWordMode || 'hybrid') : mode;
        if (resolvedMode === 'visual') await exportVisualDocx(false);
        else if (resolvedMode === 'hybrid') await exportVisualDocx(true);
        else await exportDocx();
      }
      else if (output === 'xlsx') await exportXlsx();
      else await exportCsv();
      setStatus(`${output.toUpperCase()} export completed. Review the downloaded file before relying on it.`, 'success');
    } catch (error) {
      setStatus(humanError(error), 'error');
    } finally {
      $('officeExport').disabled = false;
    }
  }

  function humanError(error) {
    console.error(error);
    const message = String(error?.message || error || 'Unknown error');
    if (/password|encrypt/i.test(message)) return 'This PDF is password-protected. Unlock an authorized copy first, then run the conversion.';
    if (/Invalid PDF|Failed to parse/i.test(message)) return 'The selected file does not appear to be a valid supported PDF.';
    return message;
  }

  function resetResults(clearStatus = true) {
    state.analysis = null;
    state.pdfDocument = null;
    state.originalTables = [];
    state.tables = [];
    state.selectedTable = 0;
    $('officeResults').hidden = true;
    $('officeSummary').innerHTML = '';
    $('officeDocumentPreview').innerHTML = '';
    $('officeTablePreview').innerHTML = '';
    $('officeTableSelect').innerHTML = '';
    $('officeWarnings').innerHTML = '';
    $('officeWarnings').hidden = true;
    const recommendation = $('officeRecommendation');
    if (recommendation) { recommendation.hidden = true; recommendation.classList.remove('applied'); recommendation.innerHTML = ''; }
    const chip = $('officeOutputChip');
    if (chip) chip.textContent = 'READY';
    if (clearStatus) setStatus('');
  }

  $('officeAnalyze').addEventListener('click', analyzePdf);
  $('officeCancel').addEventListener('click', () => {
    state.cancelled = true;
    setStatus('Cancelling conversion analysis…', 'working');
    if (state.ocrWorker) state.ocrWorker.terminate().catch(() => {});
  });
  $('officeOutput').addEventListener('change', renderOutputPreview);
  $('officeWordMode').addEventListener('change', renderOutputPreview);
  $('officeFirstRowHeader').addEventListener('change', () => {
    if (state.analysis) {
      renderSelectedTable();
      if ($('officeOutput').value === 'docx') renderDocumentPreview();
    }
  });
  $('officeTableSelect').addEventListener('change', () => {
    state.selectedTable = Number($('officeTableSelect').value || 0);
    renderSelectedTable();
  });
  $('officeCleanTable').addEventListener('click', cleanCurrentTable);
  $('officeAddRow').addEventListener('click', () => {
    const table = state.tables[state.selectedTable];
    if (!table) return;
    const columns = Math.max(1, ...table.rows.map((row) => row.length));
    table.rows.push(Array.from({ length: columns }, () => ''));
    renderSelectedTable();
  });
  $('officeAddColumn').addEventListener('click', () => {
    const table = state.tables[state.selectedTable];
    if (!table) return;
    table.rows.forEach((row) => row.push(''));
    renderSelectedTable();
  });
  $('officeResetEdits').addEventListener('click', () => {
    state.tables = deepCopyTables(state.originalTables);
    state.selectedTable = 0;
    renderOutputPreview();
    setStatus('Preview edits were reset to the detected structure.', 'success');
  });
  $('officeExport').addEventListener('click', exportOffice);
  $('officeFile').addEventListener('change', () => resetResults());

  const toolSearch = document.getElementById('toolSearch');
  if (toolSearch) {
    toolSearch.addEventListener('input', () => {
      const query = toolSearch.value.trim().toLowerCase();
      document.querySelectorAll('.tool-card').forEach((card) => {
        const haystack = card.textContent.toLowerCase();
        card.hidden = !!query && !haystack.includes(query);
      });
    });
  }
  document.querySelectorAll('[data-jump-tool]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.getAttribute('data-jump-tool');
      const card = document.querySelector(`.tool-card[data-tool="${target}"]`);
      if (card) card.click();
    });
  });
  $('resetTool').addEventListener('click', () => {
    if (!$('panel-office').classList.contains('active')) return;
    state.cancelled = true;
    if (state.ocrWorker) state.ocrWorker.terminate().catch(() => {});
    state.ocrWorker = null;
    setBusy(false);
    resetResults();
  });
})();
