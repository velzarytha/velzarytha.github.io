(() => {
  'use strict';

  if (!window.PDFLib || !window.pdfjsLib || !window.JSZip) {
    alert('The PDF libraries could not be loaded. Check your internet connection and refresh the page.');
    return;
  }

  const { PDFDocument, StandardFonts, rgb, degrees } = PDFLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  const titles = {
    merge: 'Merge PDF', split: 'Split PDF', organize: 'Organize PDF', images: 'Images to PDF',
    pdfimages: 'PDF to Images', watermark: 'Add Watermark', numbers: 'Add Page Numbers',
    compress: 'Compress PDF', text: 'PDF to Text'
  };

  let activeTool = 'merge';
  let organizeState = null;

  const $ = (id) => document.getElementById(id);
  const formatBytes = (bytes) => {
    if (!Number.isFinite(bytes) || bytes < 1) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
  };

  function setStatus(id, message, type = '') {
    const el = $(id);
    el.textContent = message;
    el.className = `status ${type}`.trim();
  }

  function baseName(filename) {
    return filename.replace(/\.pdf$/i, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'document';
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
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function renderFileList(containerId, files) {
    const container = $(containerId);
    container.innerHTML = '';
    Array.from(files || []).forEach((file, index) => {
      const row = document.createElement('div');
      row.className = 'file-row';
      row.innerHTML = `<span>${index + 1}. ${escapeHtml(file.name)}</span><small>${formatBytes(file.size)}</small>`;
      container.appendChild(row);
    });
  }

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
  }

  async function canvasToBlob(canvas, mimeType, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not create image output.')), mimeType, quality);
    });
  }

  async function loadPdfJs(fileOrBytes) {
    let data;
    if (fileOrBytes instanceof File || fileOrBytes instanceof Blob) data = new Uint8Array(await fileOrBytes.arrayBuffer());
    else if (fileOrBytes instanceof Uint8Array) data = fileOrBytes;
    else data = new Uint8Array(fileOrBytes);
    return pdfjsLib.getDocument({ data }).promise;
  }

  function parsePageRanges(input, pageCount) {
    const raw = input.trim();
    if (!raw) return Array.from({ length: pageCount }, (_, i) => i);
    const indexes = [];
    for (const token of raw.split(',')) {
      const part = token.trim();
      if (!part) continue;
      if (/^\d+$/.test(part)) {
        const page = Number(part);
        if (page < 1 || page > pageCount) throw new Error(`Page ${page} is outside this document.`);
        indexes.push(page - 1);
      } else {
        const match = part.match(/^(\d+)\s*-\s*(\d+)$/);
        if (!match) throw new Error(`Invalid page range: ${part}`);
        const start = Number(match[1]);
        const end = Number(match[2]);
        if (start < 1 || end < 1 || start > pageCount || end > pageCount || start > end) throw new Error(`Invalid page range: ${part}`);
        for (let page = start; page <= end; page += 1) indexes.push(page - 1);
      }
    }
    return [...new Set(indexes)];
  }

  function updateDropZoneFileName(input) {
    const zone = input.closest('.drop-zone');
    if (!zone) return;

    const title = zone.querySelector('strong');
    const detail = zone.querySelector('span');
    if (!title || !detail) return;

    if (!zone.dataset.defaultTitle) zone.dataset.defaultTitle = title.textContent.trim();
    if (!zone.dataset.defaultDetail) zone.dataset.defaultDetail = detail.textContent.trim();

    const files = Array.from(input.files || []);
    zone.classList.toggle('has-files', files.length > 0);

    if (!files.length) {
      title.textContent = zone.dataset.defaultTitle;
      detail.textContent = zone.dataset.defaultDetail;
      return;
    }

    if (files.length === 1) {
      const file = files[0];
      title.textContent = file.name;
      detail.textContent = `${formatBytes(file.size)} • File selected`;
      return;
    }

    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    title.textContent = `${files.length} files selected`;
    detail.textContent = `${formatBytes(totalSize)} total`;
  }

  function wireFileSelectionFeedback() {
    document.querySelectorAll('.drop-zone input[type="file"]').forEach((input) => {
      updateDropZoneFileName(input);
      input.addEventListener('change', () => updateDropZoneFileName(input));
    });
  }

  function wireNavigation() {
    document.querySelectorAll('.tool-card').forEach((button) => {
      button.addEventListener('click', () => {
        activeTool = button.dataset.tool;
        document.querySelectorAll('.tool-card').forEach((item) => item.classList.toggle('active', item === button));
        document.querySelectorAll('.tool-panel').forEach((panel) => panel.classList.toggle('active', panel.id === `panel-${activeTool}`));
        $('workspaceTitle').textContent = titles[activeTool];
        document.querySelector('.workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    $('resetTool').addEventListener('click', () => {
      const panel = $(`panel-${activeTool}`);
      panel.querySelectorAll('input[type="file"]').forEach((input) => {
        input.value = '';
        updateDropZoneFileName(input);
      });
      panel.querySelectorAll('.file-list, .page-grid').forEach((container) => { container.innerHTML = ''; });
      panel.querySelectorAll('.status').forEach((status) => { status.textContent = ''; status.className = 'status'; });
      if (activeTool === 'organize') organizeState = null;
    });

    const savedTheme = localStorage.getItem('velzarytha-theme');
    if (savedTheme === 'dark') document.body.classList.add('dark');
    updateThemeButton();
    $('themeToggle').addEventListener('click', () => {
      document.body.classList.toggle('dark');
      localStorage.setItem('velzarytha-theme', document.body.classList.contains('dark') ? 'dark' : 'light');
      updateThemeButton();
    });
  }

  function updateThemeButton() {
    $('themeToggle').textContent = document.body.classList.contains('dark') ? '☀' : '☾';
  }

  function wireMerge() {
    $('mergeFiles').addEventListener('change', (event) => renderFileList('mergeList', event.target.files));
    $('mergeButton').addEventListener('click', async () => {
      const files = Array.from($('mergeFiles').files);
      if (files.length < 2) return setStatus('mergeStatus', 'Select at least two PDF files.', 'error');
      setStatus('mergeStatus', 'Combining documents…', 'working');
      try {
        const output = await PDFDocument.create();
        for (const file of files) {
          const source = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: false });
          const copied = await output.copyPages(source, source.getPageIndices());
          copied.forEach((page) => output.addPage(page));
        }
        const bytes = await output.save();
        downloadBlob(bytes, 'velzarytha-merged.pdf', 'application/pdf');
        setStatus('mergeStatus', `Merged ${files.length} PDFs into ${output.getPageCount()} pages.`, 'success');
      } catch (error) {
        setStatus('mergeStatus', humanError(error), 'error');
      }
    });
  }

  function wireSplit() {
    $('splitButton').addEventListener('click', async () => {
      const file = $('splitFile').files[0];
      if (!file) return setStatus('splitStatus', 'Select a PDF file.', 'error');
      setStatus('splitStatus', 'Reading pages…', 'working');
      try {
        const source = await PDFDocument.load(await file.arrayBuffer());
        const indexes = parsePageRanges($('splitRanges').value, source.getPageCount());
        if (!indexes.length) throw new Error('No pages were selected.');
        if ($('splitMode').value === 'extract') {
          const output = await PDFDocument.create();
          const copied = await output.copyPages(source, indexes);
          copied.forEach((page) => output.addPage(page));
          downloadBlob(await output.save(), `${baseName(file.name)}-selected-pages.pdf`, 'application/pdf');
        } else {
          const zip = new JSZip();
          for (let i = 0; i < indexes.length; i += 1) {
            const output = await PDFDocument.create();
            const [page] = await output.copyPages(source, [indexes[i]]);
            output.addPage(page);
            zip.file(`${baseName(file.name)}-page-${indexes[i] + 1}.pdf`, await output.save());
            setStatus('splitStatus', `Creating page ${i + 1} of ${indexes.length}…`, 'working');
          }
          downloadBlob(await zip.generateAsync({ type: 'blob' }), `${baseName(file.name)}-split.zip`, 'application/zip');
        }
        setStatus('splitStatus', `Created output from ${indexes.length} selected page${indexes.length === 1 ? '' : 's'}.`, 'success');
      } catch (error) {
        setStatus('splitStatus', humanError(error), 'error');
      }
    });
  }

  function wireOrganize() {
    $('organizeFile').addEventListener('change', async () => {
      const file = $('organizeFile').files[0];
      $('organizePages').innerHTML = '';
      organizeState = null;
      if (!file) return;
      setStatus('organizeStatus', 'Generating page previews…', 'working');
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const pdf = await loadPdfJs(bytes.slice());
        organizeState = {
          file,
          bytes,
          pages: Array.from({ length: pdf.numPages }, (_, index) => ({ originalIndex: index, rotation: 0, deleted: false }))
        };
        for (let index = 0; index < pdf.numPages; index += 1) {
          const page = await pdf.getPage(index + 1);
          const viewport = page.getViewport({ scale: 0.35 });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
          const card = createPageCard(index, canvas);
          $('organizePages').appendChild(card);
          setStatus('organizeStatus', `Loaded preview ${index + 1} of ${pdf.numPages}…`, 'working');
        }
        refreshPageCards();
        setStatus('organizeStatus', `${pdf.numPages} pages loaded. Use the controls below each page.`, 'success');
      } catch (error) {
        setStatus('organizeStatus', humanError(error), 'error');
      }
    });

    $('organizeButton').addEventListener('click', async () => {
      if (!organizeState) return setStatus('organizeStatus', 'Select and load a PDF first.', 'error');
      const kept = organizeState.pages.filter((page) => !page.deleted);
      if (!kept.length) return setStatus('organizeStatus', 'At least one page must remain.', 'error');
      setStatus('organizeStatus', 'Building organized PDF…', 'working');
      try {
        const source = await PDFDocument.load(organizeState.bytes.slice());
        const output = await PDFDocument.create();
        for (const item of kept) {
          const [copied] = await output.copyPages(source, [item.originalIndex]);
          const originalAngle = copied.getRotation().angle || 0;
          copied.setRotation(degrees(((originalAngle + item.rotation) % 360 + 360) % 360));
          output.addPage(copied);
        }
        downloadBlob(await output.save(), `${baseName(organizeState.file.name)}-organized.pdf`, 'application/pdf');
        setStatus('organizeStatus', `Downloaded ${kept.length}-page organized PDF.`, 'success');
      } catch (error) {
        setStatus('organizeStatus', humanError(error), 'error');
      }
    });
  }

  function createPageCard(index, canvas) {
    const card = document.createElement('div');
    card.className = 'page-card';
    card.dataset.pageKey = String(index);
    const preview = document.createElement('div');
    preview.className = 'page-preview';
    preview.appendChild(canvas);
    const meta = document.createElement('div');
    meta.className = 'page-meta';
    const actions = document.createElement('div');
    actions.className = 'page-actions';
    actions.innerHTML = '<button data-action="left" title="Move left">←</button><button data-action="rotate-left" title="Rotate left">↶</button><button data-action="delete" title="Delete or restore">×</button><button data-action="rotate-right" title="Rotate right">↷</button><button data-action="right" title="Move right">→</button>';
    actions.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button || !organizeState) return;
      const position = Number(card.dataset.position);
      const page = organizeState.pages[position];
      switch (button.dataset.action) {
        case 'left':
          if (position > 0) [organizeState.pages[position - 1], organizeState.pages[position]] = [organizeState.pages[position], organizeState.pages[position - 1]];
          break;
        case 'right':
          if (position < organizeState.pages.length - 1) [organizeState.pages[position + 1], organizeState.pages[position]] = [organizeState.pages[position], organizeState.pages[position + 1]];
          break;
        case 'rotate-left': page.rotation -= 90; break;
        case 'rotate-right': page.rotation += 90; break;
        case 'delete': page.deleted = !page.deleted; break;
        default: break;
      }
      refreshPageCards();
    });
    card.append(preview, meta, actions);
    return card;
  }

  function refreshPageCards() {
    if (!organizeState) return;
    const container = $('organizePages');
    organizeState.pages.forEach((page, position) => {
      const card = container.querySelector(`[data-page-key="${page.originalIndex}"]`);
      if (!card) return;
      card.dataset.position = String(position);
      card.classList.toggle('deleted', page.deleted);
      card.querySelector('.page-meta').textContent = `Position ${position + 1} • Original page ${page.originalIndex + 1}${page.deleted ? ' • Removed' : ''}`;
      card.querySelector('canvas').style.transform = `rotate(${page.rotation}deg)`;
      container.appendChild(card);
    });
  }

  function wireImagesToPdf() {
    $('imageFiles').addEventListener('change', (event) => renderFileList('imageList', event.target.files));
    $('imagesButton').addEventListener('click', async () => {
      const files = Array.from($('imageFiles').files);
      if (!files.length) return setStatus('imagesStatus', 'Select at least one image.', 'error');
      setStatus('imagesStatus', 'Creating PDF pages…', 'working');
      try {
        const output = await PDFDocument.create();
        const margin = Number($('imageMargin').value);
        const pageSize = $('imagePageSize').value;
        for (let index = 0; index < files.length; index += 1) {
          const file = files[index];
          const bytes = new Uint8Array(await normalizedImageBytes(file));
          const embedded = file.type === 'image/png' ? await output.embedPng(bytes) : await output.embedJpg(bytes);
          const natural = embedded.scale(1);
          let width;
          let height;
          if (pageSize === 'a4') [width, height] = [595.28, 841.89];
          else if (pageSize === 'letter') [width, height] = [612, 792];
          else [width, height] = [natural.width * 0.75 + margin * 2, natural.height * 0.75 + margin * 2];
          const page = output.addPage([width, height]);
          const scale = Math.min((width - margin * 2) / natural.width, (height - margin * 2) / natural.height);
          const drawWidth = natural.width * scale;
          const drawHeight = natural.height * scale;
          page.drawImage(embedded, { x: (width - drawWidth) / 2, y: (height - drawHeight) / 2, width: drawWidth, height: drawHeight });
          setStatus('imagesStatus', `Added image ${index + 1} of ${files.length}…`, 'working');
        }
        downloadBlob(await output.save(), 'velzarytha-images.pdf', 'application/pdf');
        setStatus('imagesStatus', `Created a ${files.length}-page PDF.`, 'success');
      } catch (error) {
        setStatus('imagesStatus', humanError(error), 'error');
      }
    });
  }

  async function normalizedImageBytes(file) {
    if (file.type === 'image/jpeg' || file.type === 'image/png') return file.arrayBuffer();
    const image = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d').drawImage(image, 0, 0);
    image.close();
    return (await canvasToBlob(canvas, 'image/jpeg', 0.92)).arrayBuffer();
  }

  function wirePdfToImages() {
    $('pdfImagesButton').addEventListener('click', async () => {
      const file = $('pdfImagesFile').files[0];
      if (!file) return setStatus('pdfImagesStatus', 'Select a PDF file.', 'error');
      setStatus('pdfImagesStatus', 'Rendering pages…', 'working');
      try {
        const pdf = await loadPdfJs(file);
        const zip = new JSZip();
        const format = $('pdfImageFormat').value;
        const scale = Number($('pdfImageScale').value);
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
          const mime = format === 'png' ? 'image/png' : 'image/jpeg';
          const blob = await canvasToBlob(canvas, mime, 0.9);
          zip.file(`${baseName(file.name)}-page-${pageNumber}.${format === 'png' ? 'png' : 'jpg'}`, blob);
          canvas.width = 1; canvas.height = 1;
          setStatus('pdfImagesStatus', `Rendered page ${pageNumber} of ${pdf.numPages}…`, 'working');
        }
        downloadBlob(await zip.generateAsync({ type: 'blob' }), `${baseName(file.name)}-images.zip`, 'application/zip');
        setStatus('pdfImagesStatus', `Created ${pdf.numPages} image files.`, 'success');
      } catch (error) {
        setStatus('pdfImagesStatus', humanError(error), 'error');
      }
    });
  }

  function wireWatermark() {
    $('watermarkOpacity').addEventListener('input', () => {
      $('watermarkOpacityValue').textContent = `${Math.round(Number($('watermarkOpacity').value) * 100)}%`;
    });
    $('watermarkButton').addEventListener('click', async () => {
      const file = $('watermarkFile').files[0];
      const text = $('watermarkText').value.trim();
      if (!file) return setStatus('watermarkStatus', 'Select a PDF file.', 'error');
      if (!text) return setStatus('watermarkStatus', 'Enter watermark text.', 'error');
      setStatus('watermarkStatus', 'Adding watermark…', 'working');
      try {
        const pdf = await PDFDocument.load(await file.arrayBuffer());
        const font = await pdf.embedFont(StandardFonts.HelveticaBold);
        const opacity = Number($('watermarkOpacity').value);
        const position = $('watermarkPosition').value;
        pdf.getPages().forEach((page) => {
          const { width, height } = page.getSize();
          const size = Math.max(20, Math.min(64, width / Math.max(text.length * 0.65, 8)));
          const textWidth = font.widthOfTextAtSize(text, size);
          let x = (width - textWidth) / 2;
          let y = (height - size) / 2;
          let rotate = degrees(35);
          if (position === 'top') { y = height - size - 28; rotate = degrees(0); }
          if (position === 'bottom') { y = 28; rotate = degrees(0); }
          page.drawText(text, { x, y, size, font, color: rgb(0.38, 0.38, 0.42), opacity, rotate });
        });
        downloadBlob(await pdf.save(), `${baseName(file.name)}-watermarked.pdf`, 'application/pdf');
        setStatus('watermarkStatus', `Watermark added to ${pdf.getPageCount()} pages.`, 'success');
      } catch (error) {
        setStatus('watermarkStatus', humanError(error), 'error');
      }
    });
  }

  function wirePageNumbers() {
    $('numbersButton').addEventListener('click', async () => {
      const file = $('numbersFile').files[0];
      if (!file) return setStatus('numbersStatus', 'Select a PDF file.', 'error');
      setStatus('numbersStatus', 'Adding page numbers…', 'working');
      try {
        const pdf = await PDFDocument.load(await file.arrayBuffer());
        const font = await pdf.embedFont(StandardFonts.Helvetica);
        const pages = pdf.getPages();
        const start = Number($('numberStart').value);
        const format = $('numberFormat').value;
        const position = $('numberPosition').value;
        pages.forEach((page, index) => {
          const current = start + index;
          const text = format === 'simple' ? String(current) : format === 'page' ? `Page ${current}` : `Page ${current} of ${start + pages.length - 1}`;
          const size = 10;
          const widthText = font.widthOfTextAtSize(text, size);
          const { width, height } = page.getSize();
          const right = position.endsWith('right');
          const top = position.startsWith('top');
          const x = right ? width - widthText - 28 : (width - widthText) / 2;
          const y = top ? height - 26 : 18;
          page.drawText(text, { x, y, size, font, color: rgb(0.28, 0.3, 0.34) });
        });
        downloadBlob(await pdf.save(), `${baseName(file.name)}-numbered.pdf`, 'application/pdf');
        setStatus('numbersStatus', `Page numbers added to ${pages.length} pages.`, 'success');
      } catch (error) {
        setStatus('numbersStatus', humanError(error), 'error');
      }
    });
  }

  function wireCompression() {
    $('compressButton').addEventListener('click', async () => {
      const file = $('compressFile').files[0];
      if (!file) return setStatus('compressStatus', 'Select a PDF file.', 'error');
      setStatus('compressStatus', 'Rendering the first page…', 'working');
      try {
        const originalSize = file.size;
        const pdfJs = await loadPdfJs(file);
        const output = await PDFDocument.create();
        const scale = Number($('compressScale').value);
        const quality = Number($('compressQuality').value);
        for (let pageNumber = 1; pageNumber <= pdfJs.numPages; pageNumber += 1) {
          const sourcePage = await pdfJs.getPage(pageNumber);
          const renderViewport = sourcePage.getViewport({ scale });
          const baseViewport = sourcePage.getViewport({ scale: 1 });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(renderViewport.width);
          canvas.height = Math.ceil(renderViewport.height);
          const context = canvas.getContext('2d', { alpha: false });
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          await sourcePage.render({ canvasContext: context, viewport: renderViewport }).promise;
          const jpgBytes = new Uint8Array(await (await canvasToBlob(canvas, 'image/jpeg', quality)).arrayBuffer());
          const image = await output.embedJpg(jpgBytes);
          const page = output.addPage([baseViewport.width, baseViewport.height]);
          page.drawImage(image, { x: 0, y: 0, width: baseViewport.width, height: baseViewport.height });
          canvas.width = 1; canvas.height = 1;
          setStatus('compressStatus', `Compressed page ${pageNumber} of ${pdfJs.numPages}…`, 'working');
        }
        const bytes = await output.save({ useObjectStreams: true });
        downloadBlob(bytes, `${baseName(file.name)}-compressed.pdf`, 'application/pdf');
        const difference = originalSize - bytes.length;
        const result = difference > 0
          ? `Created ${formatBytes(bytes.length)} output — ${Math.round((difference / originalSize) * 100)}% smaller.`
          : `Created ${formatBytes(bytes.length)} output. This file did not become smaller.`;
        setStatus('compressStatus', result, difference > 0 ? 'success' : '');
      } catch (error) {
        setStatus('compressStatus', humanError(error), 'error');
      }
    });
  }

  function wireTextExtraction() {
    $('textButton').addEventListener('click', async () => {
      const file = $('textFile').files[0];
      if (!file) return setStatus('textStatus', 'Select a PDF file.', 'error');
      setStatus('textStatus', 'Extracting text…', 'working');
      try {
        const pdf = await loadPdfJs(file);
        const sections = [];
        let characterCount = 0;
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const content = await page.getTextContent();
          const text = content.items.map((item) => item.str).join(' ').replace(/\s+/g, ' ').trim();
          sections.push(`--- Page ${pageNumber} ---\n${text}`);
          characterCount += text.length;
          setStatus('textStatus', `Extracted page ${pageNumber} of ${pdf.numPages}…`, 'working');
        }
        downloadBlob(sections.join('\n\n'), `${baseName(file.name)}-text.txt`, 'text/plain;charset=utf-8');
        setStatus('textStatus', characterCount ? `Extracted ${characterCount.toLocaleString()} characters.` : 'No selectable text was found. This PDF may require OCR.', characterCount ? 'success' : '');
      } catch (error) {
        setStatus('textStatus', humanError(error), 'error');
      }
    });
  }

  function humanError(error) {
    console.error(error);
    const message = String(error?.message || error || 'Unknown error');
    if (/encrypt|password/i.test(message)) return 'This PDF is password-protected or uses encryption that this browser tool cannot open.';
    if (/Invalid PDF|Failed to parse/i.test(message)) return 'The selected file does not appear to be a valid supported PDF.';
    return message;
  }

  wireNavigation();
  wireFileSelectionFeedback();
  wireMerge();
  wireSplit();
  wireOrganize();
  wireImagesToPdf();
  wirePdfToImages();
  wireWatermark();
  wirePageNumbers();
  wireCompression();
  wireTextExtraction();
})();
