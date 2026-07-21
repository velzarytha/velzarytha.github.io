(() => {
  'use strict';

  if (!window.PDFLib || !window.pdfjsLib || !window.JSZip) {
    alert('The PDF libraries could not be loaded. Check your internet connection and refresh the page.');
    return;
  }

  const { PDFDocument, StandardFonts, rgb, degrees, PDFName, PDFString } = PDFLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  const titles = {
    merge: 'Merge PDF', split: 'Split PDF', organize: 'Organize PDF', images: 'Images to PDF',
    pdfimages: 'PDF to Images', watermark: 'Add Watermark', numbers: 'Add Page Numbers',
    compress: 'Compress & Resize', sign: 'Sign PDF', ocr: 'OCR & Searchable PDF',
    protect: 'Protect PDF', unlock: 'Unlock PDF', edit: 'Edit & Fill', text: 'PDF to Text',
    office: 'PDF to Word / Excel'
  };

  let activeTool = 'merge';
  let organizeState = null;
  let compressionCancelled = false;
  let signState = { pdfJs: null, fileKey: '', pageCount: 0, signature: null, left: 0.64, top: 0.78 };
  let ocrCancelled = false;
  let ocrWorker = null;
  let editState = { pdfJs: null, fileKey: '', pageCount: 0, annotations: [], drag: null, pageWidth: 0, pageHeight: 0 };

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
    return filename.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'document';
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
      if (activeTool === 'compress') {
        compressionCancelled = true;
        $('compressSummary').hidden = true;
        $('compressSummary').innerHTML = '';
        $('compressProgress').hidden = true;
        $('compressProgress').value = 0;
        clearCompressionPreview();
      }
      if (activeTool === 'sign') resetSignTool();
      if (activeTool === 'ocr') {
        ocrCancelled = true;
        if (ocrWorker) ocrWorker.terminate().catch(() => {});
        ocrWorker = null;
        $('ocrProgress').hidden = true;
        $('ocrProgress').value = 0;
        $('ocrCancel').disabled = true;
      }
      if (activeTool === 'edit') resetEditTool();
      if (activeTool === 'protect') ['protectOpenPassword', 'protectOpenPasswordConfirm', 'protectOwnerPassword'].forEach((id) => { $(id).value = ''; });
      if (activeTool === 'unlock') $('unlockPassword').value = '';
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

  const MAX_COMPRESSION_CANVAS_PIXELS = 18_000_000;
  const MAX_ASSET_CANVAS_PIXELS = 24_000_000;
  const MAX_ASSET_DIMENSION = 10_000;

  const compressionModeDescriptions = {
    preserve: 'For a PDF, this keeps the document structure and performs lossless cleanup. For an image, the original file is retained when no conversion, resize, crop or color change is requested.',
    high: 'Prioritizes visual quality. Suitable for photographs, certificates and documents where fine detail matters.',
    balanced: 'Balances readable detail and file size. Recommended for ordinary PDFs, scans and portal uploads.',
    strong: 'Uses lower image resolution and stronger compression. Use when the upload limit matters more than fine detail.',
    target: 'Creates the highest-quality result it can under the maximum size. Very small limits may require lower quality; exact dimensions are preserved when requested.'
  };

  const compressionModeSettings = {
    high: { name: 'High quality image compression', scale: 2.05, quality: 0.9 },
    balanced: { name: 'Balanced image compression', scale: 1.5, quality: 0.78 },
    strong: { name: 'Strong image compression', scale: 1.05, quality: 0.56 }
  };

  const targetCompressionPresets = [
    { name: 'Ultra high', scale: 2.2, quality: 0.92 },
    { name: 'High', scale: 1.9, quality: 0.87 },
    { name: 'High efficient', scale: 1.65, quality: 0.82 },
    { name: 'Balanced', scale: 1.42, quality: 0.74 },
    { name: 'Compact', scale: 1.22, quality: 0.64 },
    { name: 'Strong', scale: 1.02, quality: 0.53 },
    { name: 'Very strong', scale: 0.86, quality: 0.42 },
    { name: 'Minimum', scale: 0.7, quality: 0.3 }
  ];

  const assetModeSettings = {
    high: { quality: 0.92, scale: 1 },
    balanced: { quality: 0.8, scale: 0.9 },
    strong: { quality: 0.58, scale: 0.7 }
  };

  let compressInputState = { kind: null, pageCount: 0, width: 0, height: 0 };

  function fileKind(file) {
    if (!file) return null;
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return 'pdf';
    if (/^image\//i.test(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name)) return 'image';
    return null;
  }

  function updateCompressionInterface() {
    const mode = $('compressMode').value;
    const file = $('compressFile').files[0];
    const kind = fileKind(file);
    const preset = $('compressPreset').value;
    const output = resolveAssetOutput(file, $('compressOutput').value, preset, mode);
    const fullDocumentPdf = kind === 'pdf' && output === 'pdf' && !['photo', 'passport'].includes(preset);
    const preserveMode = mode === 'preserve';

    $('compressTargetOptions').classList.toggle('is-hidden', mode !== 'target');
    $('compressPreserveText').disabled = !fullDocumentPdf || preserveMode;
    $('compressPageNumber').disabled = kind !== 'pdf' || fullDocumentPdf;
    $('compressModeHelp').textContent = compressionModeDescriptions[mode];

    if (kind === 'image' && mode === 'preserve') {
      $('compressModeHelp').textContent += ' Select High Quality when you want conversion or resizing.';
    }
  }

  function applyPresetRecommendations() {
    const preset = $('compressPreset').value;
    if (preset === 'passport') {
      $('compressMode').value = 'target';
      $('compressOutput').value = 'jpeg';
      $('compressFit').value = 'cover';
      $('compressCropFocus').value = 'upper';
      $('compressAutoTrim').checked = fileKind($('compressFile').files[0]) === 'pdf';
      $('compressExactDimensions').checked = true;
    } else if (preset === 'photo') {
      if ($('compressMode').value === 'preserve') $('compressMode').value = 'high';
      $('compressFit').value = 'contain';
    } else if (preset === 'document') {
      $('compressFit').value = 'contain';
      $('compressCropFocus').value = 'center';
    }
    updateCompressionInterface();
  }

  function setCompressionBusy(busy) {
    const ids = [
      'compressButton', 'compressFile', 'compressMode', 'compressColor', 'compressPreserveText',
      'compressTargetValue', 'compressTargetUnit', 'compressMinimumSize', 'compressMinimumQuality',
      'compressPreset', 'compressOutput', 'compressPageNumber', 'compressWidth', 'compressHeight',
      'compressFit', 'compressCropFocus', 'compressAutoTrim', 'compressExactDimensions', 'compressPreviewButton'
    ];
    ids.forEach((id) => { if ($(id)) $(id).disabled = busy; });
    $('compressButton').disabled = busy;
    $('compressCancel').disabled = !busy;
    if (busy) {
      $('compressProgress').hidden = false;
      $('compressProgress').value = 0;
    } else {
      updateCompressionInterface();
    }
  }

  function throwIfCompressionCancelled() {
    if (compressionCancelled) {
      const error = new Error('Compression cancelled.');
      error.name = 'AbortError';
      throw error;
    }
  }

  function readCompressionTargetBytes() {
    const value = Number($('compressTargetValue').value);
    if (!Number.isFinite(value) || value <= 0) throw new Error('Enter a valid maximum file size.');
    const multiplier = $('compressTargetUnit').value === 'MB' ? 1024 * 1024 : 1024;
    return Math.round(value * multiplier);
  }

  function readMinimumTargetBytes() {
    const value = Number($('compressMinimumSize').value || 0);
    if (!Number.isFinite(value) || value < 0) throw new Error('Enter a valid minimum file size.');
    if (!value) return 0;
    const multiplier = $('compressTargetUnit').value === 'MB' ? 1024 * 1024 : 1024;
    return Math.round(value * multiplier);
  }

  function readResizeOptions() {
    const width = Number($('compressWidth').value || 0);
    const height = Number($('compressHeight').value || 0);
    if (!Number.isFinite(width) || width < 0 || width > MAX_ASSET_DIMENSION) throw new Error(`Width must be between 0 and ${MAX_ASSET_DIMENSION.toLocaleString()} pixels.`);
    if (!Number.isFinite(height) || height < 0 || height > MAX_ASSET_DIMENSION) throw new Error(`Height must be between 0 and ${MAX_ASSET_DIMENSION.toLocaleString()} pixels.`);
    if (width && height && width * height > MAX_ASSET_CANVAS_PIXELS) throw new Error('The requested dimensions are too large for safe browser processing.');
    return {
      width: Math.round(width),
      height: Math.round(height),
      fit: $('compressFit').value,
      focus: $('compressCropFocus').value,
      autoTrim: $('compressAutoTrim').checked,
      exactDimensions: $('compressExactDimensions').checked,
      colorMode: $('compressColor').value
    };
  }

  async function losslessOptimizePdf(bytes) {
    throwIfCompressionCancelled();
    const pdf = await PDFDocument.load(bytes.slice(), { ignoreEncryption: false, updateMetadata: false });
    throwIfCompressionCancelled();
    return pdf.save({ useObjectStreams: true, addDefaultPage: false, objectsPerTick: 25 });
  }

  function analyseCanvas(canvas) {
    const longest = Math.max(canvas.width, canvas.height);
    const scale = Math.min(1, 180 / Math.max(1, longest));
    const sample = document.createElement('canvas');
    sample.width = Math.max(1, Math.round(canvas.width * scale));
    sample.height = Math.max(1, Math.round(canvas.height * scale));
    const sampleContext = sample.getContext('2d', { willReadFrequently: true });
    sampleContext.drawImage(canvas, 0, 0, sample.width, sample.height);
    const data = sampleContext.getImageData(0, 0, sample.width, sample.height).data;
    let chroma = 0;
    let extremes = 0;
    const histogram = new Uint32Array(256);
    const count = Math.max(1, data.length / 4);

    for (let index = 0; index < data.length; index += 4) {
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const luminance = Math.round(0.299 * red + 0.587 * green + 0.114 * blue);
      chroma += (Math.abs(red - green) + Math.abs(green - blue) + Math.abs(blue - red)) / 3;
      if (luminance < 55 || luminance > 215) extremes += 1;
      histogram[luminance] += 1;
    }

    sample.width = 1;
    sample.height = 1;
    return {
      averageChroma: chroma / count,
      extremeRatio: extremes / count,
      histogram,
      sampleCount: count
    };
  }

  function otsuThreshold(histogram, total) {
    let sum = 0;
    for (let value = 0; value < 256; value += 1) sum += value * histogram[value];
    let backgroundWeight = 0;
    let backgroundSum = 0;
    let bestVariance = -1;
    let threshold = 185;

    for (let value = 0; value < 256; value += 1) {
      backgroundWeight += histogram[value];
      if (!backgroundWeight) continue;
      const foregroundWeight = total - backgroundWeight;
      if (!foregroundWeight) break;
      backgroundSum += value * histogram[value];
      const backgroundMean = backgroundSum / backgroundWeight;
      const foregroundMean = (sum - backgroundSum) / foregroundWeight;
      const variance = backgroundWeight * foregroundWeight * ((backgroundMean - foregroundMean) ** 2);
      if (variance > bestVariance) {
        bestVariance = variance;
        threshold = value;
      }
    }
    return threshold;
  }

  function choosePageProfile(canvas, requestedMode) {
    if (requestedMode === 'color' || requestedMode === 'grayscale' || requestedMode === 'mono') return requestedMode;
    const analysis = analyseCanvas(canvas);
    if (analysis.averageChroma < 3.5 && analysis.extremeRatio > 0.76) return 'mono';
    if (analysis.averageChroma < 5.5) return 'grayscale';
    return 'color';
  }

  function transformCanvasProfile(canvas, profile) {
    if (profile === 'color') return;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = image.data;
    let threshold = 185;

    if (profile === 'mono') {
      const analysis = analyseCanvas(canvas);
      threshold = Math.max(135, Math.min(225, otsuThreshold(analysis.histogram, analysis.sampleCount) + 8));
    }

    for (let index = 0; index < data.length; index += 4) {
      const luminance = Math.round(0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2]);
      const value = profile === 'mono' ? (luminance >= threshold ? 255 : 0) : luminance;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  }

  function toWinAnsiText(value) {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async function restoreSearchableText(outputPage, sourcePage, viewport, font) {
    const content = await sourcePage.getTextContent({ disableCombineTextItems: false });
    let restored = 0;
    const items = content.items.slice(0, 3500);

    for (const item of items) {
      const text = toWinAnsiText(item.str);
      if (!text) continue;
      const transformed = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const fontSize = Math.max(4, Math.min(80, Math.hypot(transformed[2], transformed[3]) || item.height || 10));
      const x = transformed[4];
      const y = viewport.height - transformed[5] - fontSize * 0.18;
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < -20 || y < -20 || x > viewport.width + 20 || y > viewport.height + 20) continue;
      try {
        outputPage.drawText(text, { x, y, size: fontSize, font, color: rgb(1, 1, 1), opacity: 0.002 });
        restored += 1;
      } catch (_) {
        // Unsupported glyphs are skipped while the visual page remains intact.
      }
    }
    return restored;
  }

  async function restoreExternalLinks(outputDocument, outputPage, sourcePage, viewport) {
    const annotations = await sourcePage.getAnnotations({ intent: 'display' });
    const references = [];
    let restored = 0;

    for (const annotation of annotations) {
      if (!annotation.url || !Array.isArray(annotation.rect)) continue;
      const converted = viewport.convertToViewportRectangle(annotation.rect);
      const left = Math.min(converted[0], converted[2]);
      const right = Math.max(converted[0], converted[2]);
      const viewportTop = Math.min(converted[1], converted[3]);
      const viewportBottom = Math.max(converted[1], converted[3]);
      const bottom = viewport.height - viewportBottom;
      const top = viewport.height - viewportTop;
      if (right - left < 1 || top - bottom < 1) continue;

      const action = outputDocument.context.obj({ Type: PDFName.of('Action'), S: PDFName.of('URI'), URI: PDFString.of(annotation.url) });
      const link = outputDocument.context.obj({ Type: PDFName.of('Annot'), Subtype: PDFName.of('Link'), Rect: [left, bottom, right, top], Border: [0, 0, 0], A: action });
      references.push(outputDocument.context.register(link));
      restored += 1;
    }

    if (references.length) outputPage.node.set(PDFName.of('Annots'), outputDocument.context.obj(references));
    return restored;
  }

  async function renderCompressedPdf(pdfJs, settings, onProgress) {
    const output = await PDFDocument.create();
    const textFont = settings.preserveText ? await output.embedFont(StandardFonts.Helvetica) : null;
    const profileCounts = { color: 0, grayscale: 0, mono: 0 };
    let restoredTextItems = 0;
    let restoredLinks = 0;

    for (let pageNumber = 1; pageNumber <= pdfJs.numPages; pageNumber += 1) {
      throwIfCompressionCancelled();
      const sourcePage = await pdfJs.getPage(pageNumber);
      const baseViewport = sourcePage.getViewport({ scale: 1 });
      const maximumScale = Math.sqrt(MAX_COMPRESSION_CANVAS_PIXELS / Math.max(1, baseViewport.width * baseViewport.height));
      const effectiveScale = Math.max(0.55, Math.min(settings.scale, maximumScale));
      const renderViewport = sourcePage.getViewport({ scale: effectiveScale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(renderViewport.width));
      canvas.height = Math.max(1, Math.ceil(renderViewport.height));
      const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      await sourcePage.render({ canvasContext: context, viewport: renderViewport, intent: 'print' }).promise;
      throwIfCompressionCancelled();

      const profile = choosePageProfile(canvas, settings.colorMode);
      profileCounts[profile] += 1;
      transformCanvasProfile(canvas, profile);
      const mimeType = profile === 'mono' ? 'image/png' : 'image/jpeg';
      const blob = await canvasToBlob(canvas, mimeType, settings.quality);
      const imageBytes = new Uint8Array(await blob.arrayBuffer());
      const image = profile === 'mono' ? await output.embedPng(imageBytes) : await output.embedJpg(imageBytes);
      const outputPage = output.addPage([baseViewport.width, baseViewport.height]);
      outputPage.drawImage(image, { x: 0, y: 0, width: baseViewport.width, height: baseViewport.height });

      if (textFont) restoredTextItems += await restoreSearchableText(outputPage, sourcePage, baseViewport, textFont);
      restoredLinks += await restoreExternalLinks(output, outputPage, sourcePage, baseViewport);

      canvas.width = 1;
      canvas.height = 1;
      sourcePage.cleanup();
      if (onProgress) onProgress(pageNumber, pdfJs.numPages);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    throwIfCompressionCancelled();
    const bytes = await output.save({ useObjectStreams: true, addDefaultPage: false, objectsPerTick: 25 });
    return { bytes, method: settings.name, rasterized: true, restoredTextItems, restoredLinks, profileCounts, outputFormat: 'pdf' };
  }

  function maximumTargetPresetIndex(minimumQuality) {
    if (minimumQuality === 'high') return 2;
    if (minimumQuality === 'balanced') return 5;
    return targetCompressionPresets.length - 1;
  }

  function initialTargetPresetIndex(targetBytes, originalBytes, maximumIndex) {
    const ratio = targetBytes / Math.max(1, originalBytes);
    let index = 0;
    if (ratio < 0.75) index = 1;
    if (ratio < 0.55) index = 2;
    if (ratio < 0.38) index = 3;
    if (ratio < 0.24) index = 4;
    if (ratio < 0.14) index = 5;
    if (ratio < 0.08) index = 6;
    return Math.min(index, maximumIndex);
  }

  async function compressTowardTarget(pdfJs, options) {
    const candidates = [options.structureCandidate];
    if (options.structureCandidate.bytes.length <= options.targetBytes * 1.05) return options.structureCandidate;

    const maximumIndex = maximumTargetPresetIndex(options.minimumQuality);
    let presetIndex = initialTargetPresetIndex(options.targetBytes, options.originalSize, maximumIndex);
    const attemptedIndexes = new Set();
    const maximumAttempts = 4;

    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      throwIfCompressionCancelled();
      if (attemptedIndexes.has(presetIndex)) break;
      attemptedIndexes.add(presetIndex);
      const preset = targetCompressionPresets[presetIndex];
      setStatus('compressStatus', `Target attempt ${attempt} of ${maximumAttempts}: ${preset.name}…`, 'working');
      const candidate = await renderCompressedPdf(pdfJs, {
        ...preset,
        name: `Target size — ${preset.name}`,
        colorMode: options.colorMode,
        preserveText: options.preserveText
      }, (page, total) => {
        const completed = ((attempt - 1) + (page / total)) / maximumAttempts;
        $('compressProgress').value = Math.round(completed * 100);
        setStatus('compressStatus', `Target attempt ${attempt}: page ${page} of ${total}…`, 'working');
      });
      candidates.push(candidate);

      if (candidate.bytes.length <= options.targetBytes * 1.05) break;
      const sizeMultiple = candidate.bytes.length / options.targetBytes;
      const step = sizeMultiple > 1.8 ? 2 : 1;
      const nextIndex = Math.min(maximumIndex, presetIndex + step);
      if (nextIndex === presetIndex) break;
      presetIndex = nextIndex;
    }

    const acceptable = candidates
      .filter((candidate) => candidate.bytes.length <= options.targetBytes * 1.05)
      .sort((a, b) => b.bytes.length - a.bytes.length);
    if (acceptable.length) return acceptable[0];
    return candidates.sort((a, b) => a.bytes.length - b.bytes.length)[0];
  }

  async function loadImageCanvas(file, maximumLongest = 5000) {
    let source;
    let release = () => {};

    if ('createImageBitmap' in window) {
      try {
        source = await createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch (_) {
        try { source = await createImageBitmap(file); } catch (_) { source = null; }
      }
      if (source) release = () => source.close();
    }

    if (!source) {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.decoding = 'async';
      image.src = url;
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('The selected image could not be decoded.'));
      });
      source = image;
      release = () => URL.revokeObjectURL(url);
    }

    const rawWidth = source.naturalWidth || source.width;
    const rawHeight = source.naturalHeight || source.height;
    const pixelScale = Math.min(1, maximumLongest / Math.max(rawWidth, rawHeight), Math.sqrt(MAX_ASSET_CANVAS_PIXELS / Math.max(1, rawWidth * rawHeight)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(rawWidth * pixelScale));
    canvas.height = Math.max(1, Math.round(rawHeight * pixelScale));
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    release();
    return { canvas, originalWidth: rawWidth, originalHeight: rawHeight };
  }

  async function renderPdfPageForAsset(file, pageNumber, maximumLongest = 2600) {
    const pdf = await loadPdfJs(file);
    if (pageNumber < 1 || pageNumber > pdf.numPages) {
      await pdf.destroy().catch(() => {});
      throw new Error(`Choose a PDF page between 1 and ${pdf.numPages}.`);
    }
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.max(0.75, Math.min(maximumLongest / Math.max(baseViewport.width, baseViewport.height), Math.sqrt(MAX_ASSET_CANVAS_PIXELS / Math.max(1, baseViewport.width * baseViewport.height))));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport, intent: 'print' }).promise;
    page.cleanup();
    const result = { canvas, pageCount: pdf.numPages, originalWidth: Math.round(baseViewport.width), originalHeight: Math.round(baseViewport.height) };
    await pdf.destroy().catch(() => {});
    return result;
  }

  function findWhiteTrimBounds(canvas) {
    const maximumSample = 1100;
    const scale = Math.min(1, maximumSample / Math.max(canvas.width, canvas.height));
    const sample = document.createElement('canvas');
    sample.width = Math.max(1, Math.round(canvas.width * scale));
    sample.height = Math.max(1, Math.round(canvas.height * scale));
    const context = sample.getContext('2d', { willReadFrequently: true });
    context.drawImage(canvas, 0, 0, sample.width, sample.height);
    const data = context.getImageData(0, 0, sample.width, sample.height).data;
    let left = sample.width;
    let top = sample.height;
    let right = -1;
    let bottom = -1;

    for (let y = 0; y < sample.height; y += 1) {
      for (let x = 0; x < sample.width; x += 1) {
        const index = (y * sample.width + x) * 4;
        const red = data[index];
        const green = data[index + 1];
        const blue = data[index + 2];
        const alpha = data[index + 3];
        const isContent = alpha > 18 && (red < 244 || green < 244 || blue < 244) && (Math.max(red, green, blue) - Math.min(red, green, blue) > 4 || (red + green + blue) / 3 < 238);
        if (!isContent) continue;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }

    if (right < left || bottom < top) {
      sample.width = 1;
      sample.height = 1;
      return { x: 0, y: 0, width: canvas.width, height: canvas.height };
    }
    const sampleWidth = sample.width;
    const sampleHeight = sample.height;
    const padding = 4;
    left = Math.max(0, left - padding);
    top = Math.max(0, top - padding);
    right = Math.min(sampleWidth - 1, right + padding);
    bottom = Math.min(sampleHeight - 1, bottom + padding);
    sample.width = 1;
    sample.height = 1;
    const x = Math.max(0, Math.floor(left / scale));
    const y = Math.max(0, Math.floor(top / scale));
    const width = Math.min(canvas.width - x, Math.ceil((right - left + 1) / scale));
    const height = Math.min(canvas.height - y, Math.ceil((bottom - top + 1) / scale));
    if (width < canvas.width * 0.08 || height < canvas.height * 0.08) return { x: 0, y: 0, width: canvas.width, height: canvas.height };
    return { x, y, width, height };
  }

  function calculateOutputDimensions(sourceWidth, sourceHeight, requestedWidth, requestedHeight) {
    if (!requestedWidth && !requestedHeight) return { width: sourceWidth, height: sourceHeight };
    if (requestedWidth && !requestedHeight) return { width: requestedWidth, height: Math.max(1, Math.round(requestedWidth * sourceHeight / sourceWidth)) };
    if (!requestedWidth && requestedHeight) return { width: Math.max(1, Math.round(requestedHeight * sourceWidth / sourceHeight)), height: requestedHeight };
    return { width: requestedWidth, height: requestedHeight };
  }

  function createProcessedCanvas(sourceCanvas, options) {
    const bounds = options.autoTrim ? findWhiteTrimBounds(sourceCanvas) : { x: 0, y: 0, width: sourceCanvas.width, height: sourceCanvas.height };
    const dimensions = calculateOutputDimensions(bounds.width, bounds.height, options.width, options.height);
    const safeScale = Math.min(1, MAX_ASSET_DIMENSION / Math.max(dimensions.width, dimensions.height), Math.sqrt(MAX_ASSET_CANVAS_PIXELS / Math.max(1, dimensions.width * dimensions.height)));
    const outputWidth = Math.max(1, Math.round(dimensions.width * safeScale));
    const outputHeight = Math.max(1, Math.round(dimensions.height * safeScale));
    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, outputWidth, outputHeight);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';

    if (options.fit === 'cover' && options.width && options.height) {
      const sourceRatio = bounds.width / bounds.height;
      const targetRatio = outputWidth / outputHeight;
      let sx = bounds.x;
      let sy = bounds.y;
      let sw = bounds.width;
      let sh = bounds.height;
      if (sourceRatio > targetRatio) {
        sw = bounds.height * targetRatio;
        sx = bounds.x + (bounds.width - sw) / 2;
      } else {
        sh = bounds.width / targetRatio;
        const focus = options.focus === 'upper' ? 0.36 : 0.5;
        sy = bounds.y + Math.max(0, Math.min(bounds.height - sh, bounds.height * focus - sh * focus));
      }
      context.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);
    } else {
      const fitScale = Math.min(outputWidth / bounds.width, outputHeight / bounds.height);
      const drawWidth = bounds.width * fitScale;
      const drawHeight = bounds.height * fitScale;
      context.drawImage(sourceCanvas, bounds.x, bounds.y, bounds.width, bounds.height, (outputWidth - drawWidth) / 2, (outputHeight - drawHeight) / 2, drawWidth, drawHeight);
    }

    const profile = choosePageProfile(canvas, options.colorMode);
    transformCanvasProfile(canvas, profile);
    return { canvas, profile, trimmed: options.autoTrim, requestedDimensionsHonored: outputWidth === dimensions.width && outputHeight === dimensions.height };
  }

  function scaleCanvas(sourceCanvas, factor) {
    if (factor >= 0.999) return sourceCanvas;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceCanvas.width * factor));
    canvas.height = Math.max(1, Math.round(sourceCanvas.height * factor));
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  async function encodeCanvasCandidate(canvas, outputFormat, quality, profile) {
    throwIfCompressionCancelled();
    if (outputFormat === 'pdf') {
      const usePng = profile === 'mono';
      const blob = await canvasToBlob(canvas, usePng ? 'image/png' : 'image/jpeg', quality);
      const imageBytes = new Uint8Array(await blob.arrayBuffer());
      const pdf = await PDFDocument.create();
      const image = usePng ? await pdf.embedPng(imageBytes) : await pdf.embedJpg(imageBytes);
      const page = pdf.addPage([canvas.width, canvas.height]);
      page.drawImage(image, { x: 0, y: 0, width: canvas.width, height: canvas.height });
      const bytes = await pdf.save({ useObjectStreams: true, addDefaultPage: false });
      return { bytes, outputFormat: 'pdf', extension: 'pdf', mime: 'application/pdf', width: canvas.width, height: canvas.height };
    }

    const mime = outputFormat === 'png' ? 'image/png' : 'image/jpeg';
    const blob = await canvasToBlob(canvas, mime, quality);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { bytes, outputFormat, extension: outputFormat === 'png' ? 'png' : 'jpg', mime, width: canvas.width, height: canvas.height };
  }

  function qualityFloorValue(level) {
    if (level === 'high') return 0.58;
    if (level === 'balanced') return 0.3;
    return 0.12;
  }

  function dimensionScales(level, keepExact) {
    if (keepExact) return [1];
    if (level === 'high') return [1, 0.92, 0.84, 0.76];
    if (level === 'balanced') return [1, 0.9, 0.8, 0.7, 0.6, 0.5];
    return [1, 0.88, 0.76, 0.64, 0.52, 0.42, 0.34, 0.28];
  }

  async function encodeTowardAssetTarget(baseCanvas, outputFormat, profile, options) {
    const scales = dimensionScales(options.minimumQuality, options.keepExactDimensions);
    const floor = qualityFloorValue(options.minimumQuality);
    let smallest = null;
    let progressStep = 0;
    const estimatedSteps = scales.length * (outputFormat === 'png' ? 1 : 8);

    for (const dimensionScale of scales) {
      throwIfCompressionCancelled();
      const canvas = scaleCanvas(baseCanvas, dimensionScale);
      if (outputFormat === 'png') {
        const candidate = await encodeCanvasCandidate(canvas, outputFormat, 1, profile);
        progressStep += 1;
        $('compressProgress').value = Math.min(96, Math.round(progressStep / estimatedSteps * 100));
        if (!smallest || candidate.bytes.length < smallest.bytes.length) smallest = candidate;
        if (candidate.bytes.length <= options.targetBytes) {
          const result = { ...candidate, targetMet: true, quality: 1, dimensionScale };
          if (canvas !== baseCanvas) { canvas.width = 1; canvas.height = 1; }
          return result;
        }
        if (canvas !== baseCanvas) { canvas.width = 1; canvas.height = 1; }
        continue;
      }

      let low = floor;
      let high = 0.96;
      let bestAtDimensions = null;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        throwIfCompressionCancelled();
        const quality = attempt === 0 ? high : (low + high) / 2;
        const candidate = await encodeCanvasCandidate(canvas, outputFormat, quality, profile);
        progressStep += 1;
        $('compressProgress').value = Math.min(96, Math.round(progressStep / estimatedSteps * 100));
        setStatus('compressStatus', `Searching for the best result under ${formatBytes(options.targetBytes)}…`, 'working');
        if (!smallest || candidate.bytes.length < smallest.bytes.length) smallest = { ...candidate, quality, dimensionScale };
        if (candidate.bytes.length <= options.targetBytes) {
          bestAtDimensions = { ...candidate, quality, dimensionScale };
          low = quality;
        } else {
          high = quality;
        }
        if (Math.abs(high - low) < 0.012) break;
      }
      if (bestAtDimensions) {
        const result = { ...bestAtDimensions, targetMet: true };
        if (canvas !== baseCanvas) { canvas.width = 1; canvas.height = 1; }
        return result;
      }
      if (canvas !== baseCanvas) { canvas.width = 1; canvas.height = 1; }
    }

    return { ...smallest, targetMet: false };
  }

  function resolveAssetOutput(file, selected, preset, mode) {
    if (selected !== 'auto') return selected;
    const kind = fileKind(file);
    if (kind === 'pdf') return 'pdf';
    if (!file) return 'jpeg';
    if (preset === 'passport' || preset === 'photo' || mode === 'target') return 'jpeg';
    if (file.type === 'image/png') return 'png';
    return 'jpeg';
  }

  function shouldUseAssetWorkflow(file, outputFormat, preset) {
    return fileKind(file) === 'image' || outputFormat !== 'pdf' || preset === 'photo' || preset === 'passport';
  }

  function assetOutputFilename(file, outputFormat) {
    return `${baseName(file.name)}-compressed-resized.${outputFormat === 'pdf' ? 'pdf' : outputFormat === 'png' ? 'png' : 'jpg'}`;
  }

  function clearCompressionPreview() {
    const canvas = $('compressPreviewCanvas');
    if (!canvas) return;
    const context = canvas.getContext('2d');
    canvas.width = 640;
    canvas.height = 360;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    $('compressPreviewInfo').textContent = 'Select a file to preview its first page or image.';
    compressInputState = { kind: null, pageCount: 0, width: 0, height: 0 };
  }

  function drawPreviewCanvas(sourceCanvas) {
    const preview = $('compressPreviewCanvas');
    const maximumWidth = 760;
    const maximumHeight = 440;
    const scale = Math.min(maximumWidth / sourceCanvas.width, maximumHeight / sourceCanvas.height, 1);
    preview.width = Math.max(1, Math.round(sourceCanvas.width * scale));
    preview.height = Math.max(1, Math.round(sourceCanvas.height * scale));
    const context = preview.getContext('2d', { alpha: false });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, preview.width, preview.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(sourceCanvas, 0, 0, preview.width, preview.height);
  }

  async function updateCompressionPreview() {
    const file = $('compressFile').files[0];
    if (!file) return clearCompressionPreview();
    const kind = fileKind(file);
    if (!kind) return setStatus('compressStatus', 'Choose a PDF, JPG, PNG or WebP file.', 'error');
    setStatus('compressStatus', 'Preparing preview…', 'working');
    try {
      let source;
      if (kind === 'pdf') {
        const pageNumber = Math.max(1, Number($('compressPageNumber').value || 1));
        source = await renderPdfPageForAsset(file, pageNumber, 1200);
        $('compressPageNumber').max = String(source.pageCount);
        compressInputState = { kind, pageCount: source.pageCount, width: source.originalWidth, height: source.originalHeight };
      } else {
        source = await loadImageCanvas(file, 1600);
        compressInputState = { kind, pageCount: 1, width: source.originalWidth, height: source.originalHeight };
      }
      const processed = createProcessedCanvas(source.canvas, readResizeOptions());
      drawPreviewCanvas(processed.canvas);
      const pageText = kind === 'pdf' ? ` • PDF page ${$('compressPageNumber').value} of ${compressInputState.pageCount}` : '';
      $('compressPreviewInfo').textContent = `${file.name} • ${formatBytes(file.size)} • ${compressInputState.width} × ${compressInputState.height}${pageText} • Preview output ${processed.canvas.width} × ${processed.canvas.height}`;
      source.canvas.width = 1;
      source.canvas.height = 1;
      if (processed.canvas !== source.canvas) {
        // The visible preview canvas now owns the pixels.
      }
      setStatus('compressStatus', 'Preview ready.', 'success');
    } catch (error) {
      setStatus('compressStatus', humanError(error), 'error');
    }
  }

  async function processAssetWorkflow(file, outputFormat, mode, targetBytes, minimumBytes) {
    const kind = fileKind(file);
    const pageNumber = Math.max(1, Number($('compressPageNumber').value || 1));
    const resizeOptions = readResizeOptions();
    const targetLongest = Math.max(resizeOptions.width, resizeOptions.height, 0);
    let source;
    if (kind === 'pdf') source = await renderPdfPageForAsset(file, pageNumber, Math.max(1800, Math.min(4200, targetLongest * 2 || 2600)));
    else source = await loadImageCanvas(file, Math.max(2600, Math.min(5000, targetLongest * 2 || 5000)));

    throwIfCompressionCancelled();
    const processed = createProcessedCanvas(source.canvas, resizeOptions);
    const baseCanvas = processed.canvas;
    const effectiveMode = mode === 'preserve' ? 'high' : mode;
    let result;

    if (effectiveMode === 'target') {
      result = await encodeTowardAssetTarget(baseCanvas, outputFormat, processed.profile, {
        targetBytes,
        minimumBytes,
        minimumQuality: $('compressMinimumQuality').value,
        keepExactDimensions: resizeOptions.exactDimensions && Boolean(resizeOptions.width || resizeOptions.height)
      });
      result.method = 'Portal target-size optimization';
    } else {
      const settings = assetModeSettings[effectiveMode] || assetModeSettings.balanced;
      const keepExact = resizeOptions.exactDimensions && Boolean(resizeOptions.width || resizeOptions.height);
      const outputCanvas = keepExact ? baseCanvas : scaleCanvas(baseCanvas, settings.scale);
      result = await encodeCanvasCandidate(outputCanvas, outputFormat, settings.quality, processed.profile);
      result.quality = settings.quality;
      result.dimensionScale = keepExact ? 1 : settings.scale;
      result.targetMet = null;
      result.method = `${effectiveMode === 'high' ? 'High quality' : effectiveMode === 'strong' ? 'Strong' : 'Balanced'} photo/document optimization`;
    }

    result.rasterized = true;
    result.assetWorkflow = true;
    result.profileCounts = { [processed.profile]: 1 };
    result.restoredTextItems = 0;
    result.restoredLinks = 0;
    result.originalDimensions = `${source.originalWidth} × ${source.originalHeight}`;
    result.minimumBytes = minimumBytes;
    result.targetBytes = targetBytes;
    result.pageNumber = kind === 'pdf' ? pageNumber : null;
    source.canvas.width = 1;
    source.canvas.height = 1;
    if (baseCanvas !== source.canvas) {
      baseCanvas.width = 1;
      baseCanvas.height = 1;
    }
    return result;
  }

  function renderCompressionSummary(result, originalSize, targetBytes = null) {
    const finalSize = result.bytes.length;
    const reduction = Math.max(0, originalSize - finalSize);
    const reductionPercent = originalSize ? Math.max(0, Math.round((reduction / originalSize) * 100)) : 0;
    const targetText = targetBytes ? `${formatBytes(targetBytes)} maximum` : 'Automatic';
    let note;

    if (result.assetWorkflow) {
      const targetStatus = targetBytes ? (result.targetMet ? 'The maximum-size requirement was met.' : 'The maximum-size requirement could not be reached within the selected quality and dimension limits.') : '';
      const minimumStatus = result.minimumBytes && finalSize < result.minimumBytes ? ` The result is below the optional ${formatBytes(result.minimumBytes)} minimum.` : '';
      note = `${result.outputFormat.toUpperCase()} output at ${result.width} × ${result.height}px from ${result.originalDimensions}.${result.pageNumber ? ` PDF page ${result.pageNumber} was processed.` : ''} ${targetStatus}${minimumStatus}`;
    } else if (!result.rasterized) {
      note = finalSize < originalSize
        ? 'The original PDF structure was retained. Text, vectors, links and form fields should remain available.'
        : 'The selected PDF was already efficiently compressed, so Velzarytha kept the original data rather than creating a larger file.';
    } else {
      const profiles = Object.entries(result.profileCounts || {}).filter(([, count]) => count).map(([profile, count]) => `${count} ${profile}`).join(', ');
      note = `Pages were rebuilt using ${profiles || 'optimized images'}. Restored ${result.restoredTextItems.toLocaleString()} searchable text items and ${result.restoredLinks.toLocaleString()} web links when supported. Forms, bookmarks, attachments, layers and signatures are not preserved in this mode.`;
    }

    $('compressSummary').innerHTML = `
      <h3>Compression result</h3>
      <div class="result-grid">
        <div class="result-item"><small>Original</small><strong>${formatBytes(originalSize)}</strong></div>
        <div class="result-item"><small>Output</small><strong>${formatBytes(finalSize)}</strong></div>
        <div class="result-item"><small>Reduction</small><strong>${reductionPercent}%</strong></div>
        <div class="result-item"><small>Target</small><strong>${targetText}</strong></div>
      </div>
      <p class="result-note"><strong>${escapeHtml(result.method)}</strong> — ${escapeHtml(note)}</p>`;
    $('compressSummary').hidden = false;
  }

  function wireCompression() {
    clearCompressionPreview();
    updateCompressionInterface();
    $('compressMode').addEventListener('change', updateCompressionInterface);
    $('compressOutput').addEventListener('change', updateCompressionInterface);
    $('compressPreset').addEventListener('change', applyPresetRecommendations);
    $('compressPageNumber').addEventListener('change', updateCompressionPreview);
    $('compressPreviewButton').addEventListener('click', updateCompressionPreview);
    $('compressFile').addEventListener('change', async () => {
      $('compressSummary').hidden = true;
      $('compressSummary').innerHTML = '';
      $('compressProgress').hidden = true;
      $('compressProgress').value = 0;
      setStatus('compressStatus', '');
      const file = $('compressFile').files[0];
      const kind = fileKind(file);
      if (!kind && file) return setStatus('compressStatus', 'Choose a PDF, JPG, PNG or WebP file.', 'error');
      if (kind === 'image' && $('compressMode').value === 'preserve') $('compressMode').value = 'balanced';
      updateCompressionInterface();
      await updateCompressionPreview();
    });
    $('compressCancel').addEventListener('click', () => {
      compressionCancelled = true;
      setStatus('compressStatus', 'Stopping after the current operation…', 'working');
    });

    $('compressButton').addEventListener('click', async () => {
      const file = $('compressFile').files[0];
      if (!file) return setStatus('compressStatus', 'Select a PDF or image file.', 'error');
      const kind = fileKind(file);
      if (!kind) return setStatus('compressStatus', 'Choose a PDF, JPG, PNG or WebP file.', 'error');
      const mode = $('compressMode').value;
      const preset = $('compressPreset').value;
      const outputFormat = resolveAssetOutput(file, $('compressOutput').value, preset, mode);
      let targetBytes = null;
      let minimumBytes = 0;
      try {
        readResizeOptions();
        if (mode === 'target') {
          targetBytes = readCompressionTargetBytes();
          minimumBytes = readMinimumTargetBytes();
          if (minimumBytes && minimumBytes >= targetBytes) throw new Error('The optional minimum size must be smaller than the maximum size.');
        }
      } catch (error) {
        return setStatus('compressStatus', humanError(error), 'error');
      }

      compressionCancelled = false;
      setCompressionBusy(true);
      $('compressSummary').hidden = true;
      $('compressSummary').innerHTML = '';
      setStatus('compressStatus', 'Preparing the file…', 'working');

      let pdfJs = null;
      try {
        let result;
        if (shouldUseAssetWorkflow(file, outputFormat, preset)) {
          result = await processAssetWorkflow(file, outputFormat, mode, targetBytes, minimumBytes);
        } else {
          const originalBytes = new Uint8Array(await file.arrayBuffer());
          setStatus('compressStatus', 'Trying lossless structure optimization first…', 'working');
          const optimizedBytes = await losslessOptimizePdf(originalBytes.slice());
          const structureBytes = optimizedBytes.length < originalBytes.length ? optimizedBytes : originalBytes;
          const structureCandidate = {
            bytes: structureBytes,
            method: optimizedBytes.length < originalBytes.length ? 'Lossless structure optimization' : 'Original structure retained',
            rasterized: false,
            restoredTextItems: 0,
            restoredLinks: 0,
            profileCounts: {},
            outputFormat: 'pdf'
          };
          result = structureCandidate;

          if (mode !== 'preserve') {
            pdfJs = await loadPdfJs(originalBytes.slice());
            if (mode === 'target') {
              result = await compressTowardTarget(pdfJs, {
                structureCandidate,
                targetBytes,
                originalSize: originalBytes.length,
                minimumQuality: $('compressMinimumQuality').value,
                colorMode: $('compressColor').value,
                preserveText: $('compressPreserveText').checked
              });
            } else {
              const settings = compressionModeSettings[mode];
              setStatus('compressStatus', `Creating ${settings.name.toLowerCase()}…`, 'working');
              const rasterCandidate = await renderCompressedPdf(pdfJs, {
                ...settings,
                colorMode: $('compressColor').value,
                preserveText: $('compressPreserveText').checked
              }, (page, total) => {
                $('compressProgress').value = Math.round((page / total) * 100);
                setStatus('compressStatus', `Compressing page ${page} of ${total}…`, 'working');
              });
              result = rasterCandidate.bytes.length < structureCandidate.bytes.length ? rasterCandidate : structureCandidate;
            }
          }
        }

        throwIfCompressionCancelled();
        $('compressProgress').value = 100;
        const filename = result.assetWorkflow ? assetOutputFilename(file, result.outputFormat) : `${baseName(file.name)}-smart-compressed.pdf`;
        downloadBlob(result.bytes, filename, result.mime || (result.outputFormat === 'pdf' ? 'application/pdf' : 'application/octet-stream'));
        renderCompressionSummary(result, file.size, targetBytes);
        const difference = file.size - result.bytes.length;
        let status;
        if (targetBytes && result.bytes.length > targetBytes) {
          status = `Smallest result: ${formatBytes(result.bytes.length)}. The ${formatBytes(targetBytes)} maximum could not be reached without going below the selected quality or exact-dimension limits.`;
        } else if (minimumBytes && result.bytes.length < minimumBytes) {
          status = `Finished at ${formatBytes(result.bytes.length)}, which is below the optional ${formatBytes(minimumBytes)} minimum.`;
        } else if (difference > 0) {
          status = `Finished: ${formatBytes(result.bytes.length)} — ${Math.round((difference / file.size) * 100)}% smaller.`;
        } else {
          status = `Finished at ${formatBytes(result.bytes.length)}. The output was not smaller than the input.`;
        }
        setStatus('compressStatus', status, targetBytes && result.bytes.length > targetBytes ? 'error' : 'success');
      } catch (error) {
        if (error?.name === 'AbortError') setStatus('compressStatus', 'Processing cancelled. No output was downloaded.', '');
        else setStatus('compressStatus', humanError(error), 'error');
      } finally {
        if (pdfJs?.destroy) await pdfJs.destroy().catch(() => {});
        setCompressionBusy(false);
        if (compressionCancelled) $('compressProgress').hidden = true;
      }
    });
  }



  function signatureInkColor() {
    const value = $('signatureInk').value;
    if (value === 'blue') return '#1769d2';
    if (value === 'darkblue') return '#123a70';
    return '#111111';
  }

  function switchSignatureMethod(method) {
    document.querySelectorAll('.signature-method-tab').forEach((button) => {
      const active = button.dataset.signMethod === method;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('.signature-method-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.id === `sign-method-${method}`);
    });
  }

  function clearSignatureDrawCanvas() {
    const canvas = $('signatureDrawCanvas');
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
  }

  function cropCanvasContent(source, removeWhite = false) {
    const context = source.getContext('2d', { willReadFrequently: true });
    const image = context.getImageData(0, 0, source.width, source.height);
    const data = image.data;
    let left = source.width;
    let top = source.height;
    let right = -1;
    let bottom = -1;

    for (let y = 0; y < source.height; y += 1) {
      for (let x = 0; x < source.width; x += 1) {
        const index = (y * source.width + x) * 4;
        let alpha = data[index + 3];
        if (removeWhite && alpha > 0) {
          const red = data[index];
          const green = data[index + 1];
          const blue = data[index + 2];
          const whiteness = Math.min(red, green, blue);
          if (whiteness > 238) alpha = 0;
          else if (whiteness > 205) alpha = Math.round(alpha * ((238 - whiteness) / 33));
          data[index + 3] = alpha;
        }
        if (alpha > 12) {
          if (x < left) left = x;
          if (x > right) right = x;
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
      }
    }

    if (right < left || bottom < top) throw new Error('No visible signature was found.');
    context.putImageData(image, 0, 0);
    const padding = Math.max(8, Math.round(Math.min(source.width, source.height) * 0.03));
    left = Math.max(0, left - padding);
    top = Math.max(0, top - padding);
    right = Math.min(source.width - 1, right + padding);
    bottom = Math.min(source.height - 1, bottom + padding);

    const output = document.createElement('canvas');
    output.width = Math.max(1, right - left + 1);
    output.height = Math.max(1, bottom - top + 1);
    output.getContext('2d').drawImage(source, left, top, output.width, output.height, 0, 0, output.width, output.height);
    return output;
  }

  async function canvasToSignatureAsset(canvas) {
    const cropped = cropCanvasContent(canvas, false);
    const blob = await canvasToBlob(cropped, 'image/png', 1);
    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      type: 'png',
      dataUrl: cropped.toDataURL('image/png'),
      width: cropped.width,
      height: cropped.height,
      aspect: cropped.width / cropped.height
    };
  }

  function setSignatureAsset(asset, description) {
    signState.signature = asset;
    const ready = $('signatureReady');
    ready.textContent = `${description} ready • ${asset.width} × ${asset.height}px`;
    ready.classList.add('ready');
    const overlay = $('signOverlay');
    overlay.src = asset.dataUrl;
    overlay.hidden = false;
    overlay.style.opacity = $('signOpacity').value;
    overlay.onload = () => {
      applySignatureSize();
      if ($('signPosition').value !== 'custom') applySignaturePreset($('signPosition').value);
      else positionSignatureOverlay();
    };
  }

  function resetSignatureAsset() {
    signState.signature = null;
    $('signatureReady').textContent = 'No signature prepared yet.';
    $('signatureReady').classList.remove('ready');
    const overlay = $('signOverlay');
    overlay.removeAttribute('src');
    overlay.hidden = true;
  }

  function positionSignatureOverlay() {
    const overlay = $('signOverlay');
    if (overlay.hidden) return;
    const stage = $('signPreviewStage');
    const stageRect = stage.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();
    const maxLeft = Math.max(0, 1 - (overlayRect.width / Math.max(stageRect.width, 1)));
    const maxTop = Math.max(0, 1 - (overlayRect.height / Math.max(stageRect.height, 1)));
    signState.left = Math.min(Math.max(0, signState.left), maxLeft);
    signState.top = Math.min(Math.max(0, signState.top), maxTop);
    overlay.style.left = `${signState.left * 100}%`;
    overlay.style.top = `${signState.top * 100}%`;
  }

  function applySignatureSize() {
    const value = Number($('signSize').value);
    $('signSizeValue').textContent = `${value}% of page width`;
    $('signOverlay').style.width = `${value}%`;
    requestAnimationFrame(positionSignatureOverlay);
  }

  function applySignaturePreset(preset) {
    const overlay = $('signOverlay');
    if (overlay.hidden) return;
    const stage = $('signPreviewStage');
    const stageRect = stage.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();
    const widthRatio = overlayRect.width / Math.max(stageRect.width, 1);
    const heightRatio = overlayRect.height / Math.max(stageRect.height, 1);
    const marginX = 0.045;
    const marginY = 0.045;
    if (preset === 'bottom-right') { signState.left = 1 - widthRatio - marginX; signState.top = 1 - heightRatio - marginY; }
    else if (preset === 'bottom-left') { signState.left = marginX; signState.top = 1 - heightRatio - marginY; }
    else if (preset === 'top-right') { signState.left = 1 - widthRatio - marginX; signState.top = marginY; }
    else if (preset === 'top-left') { signState.left = marginX; signState.top = marginY; }
    else if (preset === 'center') { signState.left = (1 - widthRatio) / 2; signState.top = (1 - heightRatio) / 2; }
    else { signState.left = 0.64; signState.top = 0.78; }
    positionSignatureOverlay();
  }

  async function ensureSignPdfLoaded() {
    const file = $('signFile').files[0];
    if (!file) throw new Error('Select a PDF file.');
    const key = `${file.name}|${file.size}|${file.lastModified}`;
    if (signState.pdfJs && signState.fileKey === key) return signState.pdfJs;
    if (signState.pdfJs?.destroy) await signState.pdfJs.destroy().catch(() => {});
    signState.pdfJs = await loadPdfJs(file);
    signState.fileKey = key;
    signState.pageCount = signState.pdfJs.numPages;
    $('signPreviewPage').max = String(signState.pageCount);
    return signState.pdfJs;
  }

  async function renderSignPreview() {
    const file = $('signFile').files[0];
    if (!file) return setStatus('signStatus', 'Select a PDF file.', 'error');
    setStatus('signStatus', 'Rendering page preview…', 'working');
    try {
      const pdf = await ensureSignPdfLoaded();
      const pageNumber = Math.min(Math.max(1, Number($('signPreviewPage').value) || 1), pdf.numPages);
      $('signPreviewPage').value = String(pageNumber);
      const page = await pdf.getPage(pageNumber);
      const natural = page.getViewport({ scale: 1 });
      const scale = Math.min(1.65, 760 / Math.max(natural.width, 1));
      const viewport = page.getViewport({ scale });
      const canvas = $('signPdfPreviewCanvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      $('signPreviewInfo').textContent = `Page ${pageNumber} of ${pdf.numPages}. Drag the signature on the preview or choose a position preset.`;
      requestAnimationFrame(() => {
        applySignatureSize();
        if ($('signPosition').value !== 'custom') applySignaturePreset($('signPosition').value);
        else positionSignatureOverlay();
      });
      setStatus('signStatus', `Preview ready for page ${pageNumber}.`, 'success');
    } catch (error) {
      setStatus('signStatus', humanError(error), 'error');
    }
  }

  function signaturePlacementRatios() {
    const stageRect = $('signPreviewStage').getBoundingClientRect();
    const overlayRect = $('signOverlay').getBoundingClientRect();
    if (!stageRect.width || !stageRect.height || !overlayRect.width || !overlayRect.height) throw new Error('Prepare and place a signature first.');
    return {
      left: Math.max(0, (overlayRect.left - stageRect.left) / stageRect.width),
      top: Math.max(0, (overlayRect.top - stageRect.top) / stageRect.height),
      width: Math.min(1, overlayRect.width / stageRect.width)
    };
  }

  function selectedSignPageIndexes(pageCount) {
    const mode = $('signApplyTo').value;
    if (mode === 'all') return Array.from({ length: pageCount }, (_, index) => index);
    if (mode === 'ranges') return parsePageRanges($('signRanges').value, pageCount);
    const current = Math.min(Math.max(1, Number($('signPreviewPage').value) || 1), pageCount);
    return [current - 1];
  }

  async function uploadedImageToSignatureAsset(file, removeWhite) {
    if (!file) throw new Error('Select a signature image.');
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('The signature image could not be opened.'));
        element.src = url;
      });
      const maxDimension = 1800;
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      const cropped = cropCanvasContent(canvas, removeWhite);
      const blob = await canvasToBlob(cropped, 'image/png', 1);
      return {
        bytes: new Uint8Array(await blob.arrayBuffer()),
        type: 'png',
        dataUrl: cropped.toDataURL('image/png'),
        width: cropped.width,
        height: cropped.height,
        aspect: cropped.width / cropped.height
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function typedSignatureCanvas() {
    const text = $('signatureTypedText').value.trim();
    if (!text) throw new Error('Type the signature name first.');
    const style = $('signatureTypedStyle').value;
    const font = style === 'script'
      ? "italic 700 118px 'Brush Script MT', 'Segoe Script', cursive"
      : style === 'elegant'
        ? 'italic 600 102px Georgia, serif'
        : "600 86px Inter, Arial, sans-serif";
    const measure = document.createElement('canvas').getContext('2d');
    measure.font = font;
    const width = Math.ceil(measure.measureText(text).width + 70);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(360, Math.min(1800, width));
    canvas.height = 190;
    const context = canvas.getContext('2d');
    context.font = font;
    context.textBaseline = 'middle';
    context.fillStyle = signatureInkColor();
    context.fillText(text, 34, canvas.height / 2);
    return canvas;
  }

  function resetSignTool() {
    if (signState.pdfJs?.destroy) signState.pdfJs.destroy().catch(() => {});
    signState = { pdfJs: null, fileKey: '', pageCount: 0, signature: null, left: 0.64, top: 0.78 };
    resetSignatureAsset();
    clearSignatureDrawCanvas();
    $('signatureTypedText').value = '';
    $('signatureImageFile').value = '';
    $('signatureUploadInfo').textContent = 'PNG with a transparent background gives the cleanest result.';
    $('signPreviewPage').value = '1';
    $('signPreviewPage').removeAttribute('max');
    $('signApplyTo').value = 'current';
    $('signRangesLabel').classList.add('is-hidden');
    $('signRanges').value = '';
    $('signPosition').value = 'custom';
    $('signSize').value = '28';
    $('signOpacity').value = '1';
    $('signSizeValue').textContent = '28% of page width';
    $('signOpacityValue').textContent = '100%';
    const canvas = $('signPdfPreviewCanvas');
    canvas.width = 620;
    canvas.height = 800;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    $('signPreviewInfo').textContent = 'Select a PDF and prepare a signature. Then drag the signature to the correct location.';
  }

  function wireSign() {
    const drawCanvas = $('signatureDrawCanvas');
    const drawContext = drawCanvas.getContext('2d');
    drawContext.lineCap = 'round';
    drawContext.lineJoin = 'round';
    drawContext.lineWidth = 5;
    let drawing = false;

    function drawPoint(event, begin = false) {
      const rect = drawCanvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) * (drawCanvas.width / rect.width);
      const y = (event.clientY - rect.top) * (drawCanvas.height / rect.height);
      drawContext.strokeStyle = signatureInkColor();
      if (begin) { drawContext.beginPath(); drawContext.moveTo(x, y); }
      else { drawContext.lineTo(x, y); drawContext.stroke(); }
    }

    drawCanvas.addEventListener('pointerdown', (event) => {
      drawing = true;
      drawCanvas.setPointerCapture(event.pointerId);
      drawPoint(event, true);
    });
    drawCanvas.addEventListener('pointermove', (event) => { if (drawing) drawPoint(event); });
    const stopDrawing = (event) => {
      if (!drawing) return;
      drawing = false;
      try { drawCanvas.releasePointerCapture(event.pointerId); } catch (_) {}
    };
    drawCanvas.addEventListener('pointerup', stopDrawing);
    drawCanvas.addEventListener('pointercancel', stopDrawing);
    drawCanvas.addEventListener('pointerleave', (event) => { if (drawing && event.buttons === 0) stopDrawing(event); });

    document.querySelectorAll('.signature-method-tab').forEach((button) => {
      button.addEventListener('click', () => switchSignatureMethod(button.dataset.signMethod));
    });

    $('signatureClearDrawn').addEventListener('click', clearSignatureDrawCanvas);
    $('signatureUseDrawn').addEventListener('click', async () => {
      try {
        const asset = await canvasToSignatureAsset(drawCanvas);
        setSignatureAsset(asset, 'Drawn signature');
        setStatus('signStatus', 'Drawn signature prepared. Place it on the page preview.', 'success');
      } catch (error) { setStatus('signStatus', humanError(error), 'error'); }
    });

    $('signatureUseTyped').addEventListener('click', async () => {
      try {
        const asset = await canvasToSignatureAsset(typedSignatureCanvas());
        setSignatureAsset(asset, 'Typed signature');
        setStatus('signStatus', 'Typed signature prepared. Place it on the page preview.', 'success');
      } catch (error) { setStatus('signStatus', humanError(error), 'error'); }
    });

    $('signatureImageFile').addEventListener('change', () => {
      const file = $('signatureImageFile').files[0];
      $('signatureUploadInfo').textContent = file ? `${file.name} • ${formatBytes(file.size)}` : 'PNG with a transparent background gives the cleanest result.';
    });
    $('signatureUseUploaded').addEventListener('click', async () => {
      try {
        const asset = await uploadedImageToSignatureAsset($('signatureImageFile').files[0], $('signatureRemoveWhite').checked);
        setSignatureAsset(asset, 'Uploaded signature');
        setStatus('signStatus', 'Uploaded signature prepared. Place it on the page preview.', 'success');
      } catch (error) { setStatus('signStatus', humanError(error), 'error'); }
    });

    $('signFile').addEventListener('change', async () => {
      if (signState.pdfJs?.destroy) await signState.pdfJs.destroy().catch(() => {});
      signState.pdfJs = null;
      signState.fileKey = '';
      if ($('signFile').files[0]) renderSignPreview();
    });
    $('signUpdatePreview').addEventListener('click', renderSignPreview);
    $('signPreviewPage').addEventListener('change', renderSignPreview);
    $('signApplyTo').addEventListener('change', () => {
      $('signRangesLabel').classList.toggle('is-hidden', $('signApplyTo').value !== 'ranges');
    });
    $('signPosition').addEventListener('change', () => {
      if ($('signPosition').value !== 'custom') applySignaturePreset($('signPosition').value);
    });
    $('signSize').addEventListener('input', applySignatureSize);
    $('signOpacity').addEventListener('input', () => {
      const opacity = Number($('signOpacity').value);
      $('signOpacityValue').textContent = `${Math.round(opacity * 100)}%`;
      $('signOverlay').style.opacity = String(opacity);
    });
    $('signResetPosition').addEventListener('click', () => {
      $('signPosition').value = 'bottom-right';
      applySignaturePreset('bottom-right');
    });

    const overlay = $('signOverlay');
    let drag = null;
    overlay.addEventListener('pointerdown', (event) => {
      if (overlay.hidden) return;
      const stageRect = $('signPreviewStage').getBoundingClientRect();
      const overlayRect = overlay.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        left: (overlayRect.left - stageRect.left) / stageRect.width,
        top: (overlayRect.top - stageRect.top) / stageRect.height
      };
      overlay.setPointerCapture(event.pointerId);
      overlay.classList.add('dragging');
      $('signPosition').value = 'custom';
      event.preventDefault();
    });
    overlay.addEventListener('pointermove', (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const stageRect = $('signPreviewStage').getBoundingClientRect();
      signState.left = drag.left + ((event.clientX - drag.startX) / stageRect.width);
      signState.top = drag.top + ((event.clientY - drag.startY) / stageRect.height);
      positionSignatureOverlay();
    });
    const endDrag = (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      try { overlay.releasePointerCapture(event.pointerId); } catch (_) {}
      drag = null;
      overlay.classList.remove('dragging');
    };
    overlay.addEventListener('pointerup', endDrag);
    overlay.addEventListener('pointercancel', endDrag);

    $('signButton').addEventListener('click', async () => {
      const file = $('signFile').files[0];
      if (!file) return setStatus('signStatus', 'Select a PDF file.', 'error');
      if (!signState.signature) return setStatus('signStatus', 'Draw, type or upload a signature first.', 'error');
      setStatus('signStatus', 'Adding signature to the PDF…', 'working');
      try {
        const placement = signaturePlacementRatios();
        const pdf = await PDFDocument.load(await file.arrayBuffer());
        const pages = pdf.getPages();
        const pageIndexes = selectedSignPageIndexes(pages.length);
        if (!pageIndexes.length) throw new Error('No pages were selected.');
        const signatureImage = signState.signature.type === 'jpg'
          ? await pdf.embedJpg(signState.signature.bytes)
          : await pdf.embedPng(signState.signature.bytes);
        const opacity = Number($('signOpacity').value);
        pageIndexes.forEach((index) => {
          const page = pages[index];
          const { width, height } = page.getSize();
          const drawWidth = Math.min(width, placement.width * width);
          const drawHeight = drawWidth / signState.signature.aspect;
          const x = Math.min(Math.max(0, placement.left * width), Math.max(0, width - drawWidth));
          const yFromTop = placement.top * height;
          const y = Math.min(Math.max(0, height - yFromTop - drawHeight), Math.max(0, height - drawHeight));
          page.drawImage(signatureImage, { x, y, width: drawWidth, height: drawHeight, opacity });
        });
        const bytes = await pdf.save();
        downloadBlob(bytes, `${baseName(file.name)}-signed.pdf`, 'application/pdf');
        setStatus('signStatus', `Signature added to ${pageIndexes.length} page${pageIndexes.length === 1 ? '' : 's'}.`, 'success');
      } catch (error) {
        setStatus('signStatus', humanError(error), 'error');
      }
    });

    clearSignatureDrawCanvas();
    const preview = $('signPdfPreviewCanvas').getContext('2d');
    preview.fillStyle = '#ffffff';
    preview.fillRect(0, 0, $('signPdfPreviewCanvas').width, $('signPdfPreviewCanvas').height);
  }




  function setOcrBusy(busy) {
    $('ocrButton').disabled = busy;
    $('ocrCancel').disabled = !busy;
    $('ocrProgress').hidden = !busy;
    if (!busy) $('ocrProgress').value = 0;
  }

  function cloneCanvasForOcr(source, mode) {
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, 0, 0);
    if (mode === 'original') return canvas;
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = image.data;
    const histogram = new Uint32Array(256);
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
      histogram[gray] += 1;
      data[i] = gray; data[i + 1] = gray; data[i + 2] = gray;
    }
    if (mode === 'threshold') {
      const threshold = otsuThreshold(histogram, canvas.width * canvas.height);
      for (let i = 0; i < data.length; i += 4) {
        const value = data[i] >= threshold ? 255 : 0;
        data[i] = value; data[i + 1] = value; data[i + 2] = value;
      }
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  async function renderOcrPdfPage(pdfJs, pageNumber) {
    const page = await pdfJs.getPage(pageNumber);
    const natural = page.getViewport({ scale: 1 });
    const longest = Math.max(natural.width, natural.height);
    const scale = Math.min(3, Math.max(1.7, 2600 / Math.max(1, longest)));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    await page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport, background: 'white' }).promise;
    return { canvas, pageWidth: natural.width, pageHeight: natural.height };
  }

  async function addOcrPage(outputPdf, font, canvas, pageWidth, pageHeight, ocrData) {
    const jpg = await canvasToBlob(canvas, 'image/jpeg', 0.9);
    const image = await outputPdf.embedJpg(await jpg.arrayBuffer());
    const page = outputPdf.addPage([pageWidth, pageHeight]);
    page.drawImage(image, { x: 0, y: 0, width: pageWidth, height: pageHeight });
    const words = Array.isArray(ocrData?.words) ? ocrData.words : [];
    const scaleX = pageWidth / canvas.width;
    const scaleY = pageHeight / canvas.height;
    for (const word of words) {
      const text = toWinAnsiText(String(word.text || '').trim());
      const box = word.bbox;
      if (!text || !box) continue;
      const size = Math.max(4, Math.min(48, (box.y1 - box.y0) * scaleY * 0.78));
      const x = Math.max(0, box.x0 * scaleX);
      const y = Math.max(0, pageHeight - box.y1 * scaleY);
      try {
        page.drawText(text, { x, y, size, font, color: rgb(0, 0, 0), opacity: 0.01 });
      } catch (_) { /* Skip characters unsupported by the standard font. */ }
    }
  }

  function wireOcr() {
    $('ocrCancel').addEventListener('click', () => {
      ocrCancelled = true;
      setStatus('ocrStatus', 'Cancelling OCR…', 'working');
      if (ocrWorker) ocrWorker.terminate().catch(() => {});
    });

    $('ocrButton').addEventListener('click', async () => {
      const file = $('ocrFile').files[0];
      if (!file) return setStatus('ocrStatus', 'Select a scanned PDF or image.', 'error');
      if (!window.Tesseract) return setStatus('ocrStatus', 'The OCR library could not be loaded. Check your internet connection and refresh.', 'error');
      ocrCancelled = false;
      setOcrBusy(true);
      setStatus('ocrStatus', 'Preparing OCR engine…', 'working');
      try {
        const language = $('ocrLanguage').value;
        const outputMode = $('ocrOutput').value;
        const preprocessMode = $('ocrPreprocess').value;
        ocrWorker = await Tesseract.createWorker(language, 1, {
          logger: (message) => {
            if (typeof message.progress === 'number') {
              $('ocrProgress').value = Math.max(0, Math.min(100, Math.round(message.progress * 100)));
              if (message.status) setStatus('ocrStatus', `${message.status} ${Math.round(message.progress * 100)}%`, 'working');
            }
          },
        });

        let pdfJs = null;
        let pageIndexes = [0];
        let imageCanvas = null;
        if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
          pdfJs = await loadPdfJs(file);
          pageIndexes = parsePageRanges($('ocrRanges').value, pdfJs.numPages);
        } else {
          imageCanvas = await loadImageCanvas(file, 3600);
        }
        if (!pageIndexes.length) throw new Error('No pages were selected.');

        const searchablePdf = outputMode === 'searchable' || outputMode === 'both' ? await PDFDocument.create() : null;
        const font = searchablePdf ? await searchablePdf.embedFont(StandardFonts.Helvetica) : null;
        const textSections = [];
        const totalPages = pdfJs ? pageIndexes.length : 1;

        for (let position = 0; position < totalPages; position += 1) {
          if (ocrCancelled) throw new Error('OCR was cancelled.');
          const pageNumber = pdfJs ? pageIndexes[position] + 1 : 1;
          setStatus('ocrStatus', `Recognizing page ${position + 1} of ${totalPages}…`, 'working');
          let source;
          if (pdfJs) source = await renderOcrPdfPage(pdfJs, pageNumber);
          else {
            const pageWidth = Math.min(612, imageCanvas.width * 72 / 150);
            source = { canvas: imageCanvas, pageWidth, pageHeight: pageWidth * imageCanvas.height / imageCanvas.width };
          }
          const prepared = cloneCanvasForOcr(source.canvas, preprocessMode);
          const result = await ocrWorker.recognize(prepared);
          const text = String(result?.data?.text || '').trim();
          textSections.push(`--- Page ${pageNumber} ---\n${text}`);
          if (searchablePdf) await addOcrPage(searchablePdf, font, source.canvas, source.pageWidth, source.pageHeight, result.data);
          if (prepared !== source.canvas) { prepared.width = 1; prepared.height = 1; }
          if (pdfJs) { source.canvas.width = 1; source.canvas.height = 1; }
        }

        const txtName = `${baseName(file.name)}-ocr.txt`;
        if (outputMode === 'text') {
          downloadBlob(textSections.join('\n\n'), txtName, 'text/plain;charset=utf-8');
        } else {
          const pdfBytes = await searchablePdf.save();
          if (outputMode === 'searchable') {
            downloadBlob(pdfBytes, `${baseName(file.name)}-searchable.pdf`, 'application/pdf');
          } else {
            const zip = new JSZip();
            zip.file(`${baseName(file.name)}-searchable.pdf`, pdfBytes);
            zip.file(txtName, textSections.join('\n\n'));
            downloadBlob(await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }), `${baseName(file.name)}-ocr.zip`, 'application/zip');
          }
        }
        const characters = textSections.join('').length;
        setStatus('ocrStatus', `OCR completed for ${totalPages} page${totalPages === 1 ? '' : 's'} (${characters.toLocaleString()} recognized characters).`, 'success');
      } catch (error) {
        setStatus('ocrStatus', humanError(error), /cancel/i.test(String(error?.message)) ? '' : 'error');
      } finally {
        if (ocrWorker) await ocrWorker.terminate().catch(() => {});
        ocrWorker = null;
        setOcrBusy(false);
      }
    });
  }

  function requireLibPdf() {
    const PDF = window.LibPDFCore?.PDF;
    if (!PDF) throw new Error('The password-security library could not be loaded. Refresh the page and try again.');
    return PDF;
  }

  function wireProtection() {
    $('protectButton').addEventListener('click', async () => {
      const file = $('protectFile').files[0];
      if (!file) return setStatus('protectStatus', 'Select a PDF file.', 'error');
      const userPassword = $('protectOpenPassword').value;
      const confirmation = $('protectOpenPasswordConfirm').value;
      const ownerPassword = $('protectOwnerPassword').value;
      if (!userPassword && !ownerPassword) return setStatus('protectStatus', 'Enter an open password, an owner password, or both.', 'error');
      if (userPassword !== confirmation) return setStatus('protectStatus', 'The open passwords do not match.', 'error');
      const permissions = {
        print: $('protectPrint').checked,
        printHighQuality: $('protectPrint').checked,
        copy: $('protectCopy').checked,
        modify: $('protectModify').checked,
        annotate: $('protectAnnotate').checked,
        fillForms: $('protectFillForms').checked,
        accessibility: $('protectAccessibility').checked,
        assemble: $('protectAssemble').checked,
      };
      const hasRestrictions = Object.values(permissions).some((allowed) => !allowed);
      if (hasRestrictions && !ownerPassword) return setStatus('protectStatus', 'Enter an owner password when applying permission restrictions.', 'error');
      setStatus('protectStatus', 'Encrypting PDF…', 'working');
      $('protectButton').disabled = true;
      try {
        const PDF = requireLibPdf();
        const pdf = await PDF.load(new Uint8Array(await file.arrayBuffer()));
        if (pdf.isEncrypted && !pdf.isAuthenticated) throw new Error('This PDF is already encrypted. Unlock it first.');
        pdf.setProtection({
          userPassword: userPassword || undefined,
          ownerPassword: ownerPassword || undefined,
          algorithm: $('protectAlgorithm').value,
          permissions,
        });
        const bytes = await pdf.save();
        downloadBlob(bytes, `${baseName(file.name)}-protected.pdf`, 'application/pdf');
        setStatus('protectStatus', `Protected with ${$('protectAlgorithm').value}. Store the passwords safely; Velzarytha does not save them.`, 'success');
      } catch (error) {
        setStatus('protectStatus', humanError(error), 'error');
      } finally {
        $('protectButton').disabled = false;
      }
    });

    $('unlockButton').addEventListener('click', async () => {
      const file = $('unlockFile').files[0];
      if (!file) return setStatus('unlockStatus', 'Select a protected PDF file.', 'error');
      const password = $('unlockPassword').value;
      if (!password) return setStatus('unlockStatus', 'Enter the known password.', 'error');
      setStatus('unlockStatus', 'Authenticating and removing protection…', 'working');
      $('unlockButton').disabled = true;
      try {
        const PDF = requireLibPdf();
        const pdf = await PDF.load(new Uint8Array(await file.arrayBuffer()), { credentials: password });
        if (!pdf.isEncrypted) return setStatus('unlockStatus', 'This PDF is not encrypted.', 'success');
        if (!pdf.isAuthenticated) throw new Error('The password is incorrect.');
        pdf.removeProtection();
        const bytes = await pdf.save();
        downloadBlob(bytes, `${baseName(file.name)}-unlocked.pdf`, 'application/pdf');
        setStatus('unlockStatus', 'Protection removed. The unlocked copy has been downloaded.', 'success');
      } catch (error) {
        setStatus('unlockStatus', humanError(error), 'error');
      } finally {
        $('unlockButton').disabled = false;
      }
    });
  }

  function resetEditTool() {
    editState = { pdfJs: null, fileKey: '', pageCount: 0, annotations: [], drag: null, pageWidth: 0, pageHeight: 0 };
    $('editFormFields').innerHTML = '';
    $('editFormInfo').textContent = 'Select a PDF to inspect its fillable fields.';
    $('editFlattenLabel').classList.add('is-hidden');
    const base = $('editPdfCanvas').getContext('2d');
    base.fillStyle = '#ffffff'; base.fillRect(0, 0, $('editPdfCanvas').width, $('editPdfCanvas').height);
    $('editOverlayCanvas').getContext('2d').clearRect(0, 0, $('editOverlayCanvas').width, $('editOverlayCanvas').height);
    $('editPreviewInfo').textContent = 'Select a PDF, choose a tool and place annotations on the page.';
  }

  function editFieldType(field) {
    if (field instanceof PDFLib.PDFTextField) return 'text';
    if (field instanceof PDFLib.PDFCheckBox) return 'checkbox';
    if (field instanceof PDFLib.PDFDropdown) return 'dropdown';
    if (field instanceof PDFLib.PDFRadioGroup) return 'radio';
    if (field instanceof PDFLib.PDFOptionList) return 'list';
    return 'unsupported';
  }

  function safeFieldValue(field, type) {
    try {
      if (type === 'text') return field.getText() || '';
      if (type === 'checkbox') return field.isChecked();
      if (type === 'dropdown') return (field.getSelected() || [])[0] || '';
      if (type === 'radio') return field.getSelected() || '';
      if (type === 'list') return field.getSelected() || [];
    } catch (_) { return type === 'checkbox' ? false : ''; }
    return '';
  }

  async function loadEditFormFields(file) {
    const container = $('editFormFields');
    container.innerHTML = '';
    try {
      const pdf = await PDFDocument.load(await file.arrayBuffer());
      const fields = pdf.getForm().getFields();
      const supported = fields.filter((field) => editFieldType(field) !== 'unsupported');
      if (!supported.length) {
        $('editFormInfo').textContent = 'No supported fillable AcroForm fields were detected. You can still add visual annotations.';
        $('editFlattenLabel').classList.add('is-hidden');
        return;
      }
      $('editFormInfo').textContent = `${supported.length} fillable field${supported.length === 1 ? '' : 's'} detected.`;
      $('editFlattenLabel').classList.remove('is-hidden');
      supported.forEach((field) => {
        const name = field.getName();
        const type = editFieldType(field);
        const card = document.createElement('label');
        card.className = 'dynamic-form-field';
        const title = document.createElement('strong');
        title.textContent = name;
        const hint = document.createElement('small');
        hint.textContent = type;
        let control;
        if (type === 'checkbox') {
          control = document.createElement('input'); control.type = 'checkbox'; control.checked = Boolean(safeFieldValue(field, type));
        } else if (type === 'dropdown' || type === 'radio' || type === 'list') {
          control = document.createElement('select');
          const blank = document.createElement('option'); blank.value = ''; blank.textContent = 'Select…'; control.appendChild(blank);
          const options = typeof field.getOptions === 'function' ? field.getOptions() : [];
          options.forEach((option) => { const item = document.createElement('option'); item.value = option; item.textContent = option; control.appendChild(item); });
          const value = safeFieldValue(field, type);
          control.value = Array.isArray(value) ? (value[0] || '') : value;
        } else {
          control = document.createElement('input'); control.type = 'text'; control.value = safeFieldValue(field, type);
        }
        control.className = 'form-field-control';
        control.dataset.fieldName = name;
        control.dataset.fieldType = type;
        card.append(title, hint, control);
        container.appendChild(card);
      });
    } catch (error) {
      $('editFormInfo').textContent = humanError(error);
    }
  }

  async function ensureEditPdfLoaded() {
    const file = $('editFile').files[0];
    if (!file) throw new Error('Select a PDF file.');
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (!editState.pdfJs || editState.fileKey !== key) {
      editState.pdfJs = await loadPdfJs(file);
      editState.fileKey = key;
      editState.pageCount = editState.pdfJs.numPages;
      editState.annotations = [];
      $('editPage').max = String(editState.pageCount);
      $('editPage').value = '1';
      await loadEditFormFields(file);
    }
    return editState.pdfJs;
  }

  function annotationPoint(event) {
    const canvas = $('editOverlayCanvas');
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  }

  function parseHexColor(value) {
    const match = String(value || '#000000').match(/^#([0-9a-f]{6})$/i);
    if (!match) return { r: 0, g: 0, b: 0 };
    const integer = parseInt(match[1], 16);
    return { r: ((integer >> 16) & 255) / 255, g: ((integer >> 8) & 255) / 255, b: (integer & 255) / 255 };
  }

  function drawEditOverlay(temp = null) {
    const canvas = $('editOverlayCanvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const pageIndex = Math.max(0, Number($('editPage').value || 1) - 1);
    const items = editState.annotations.filter((annotation) => annotation.pageIndex === pageIndex);
    if (temp) items.push(temp);
    items.forEach((annotation) => {
      const x = annotation.x * canvas.width;
      const y = annotation.y * canvas.height;
      ctx.save();
      ctx.globalAlpha = annotation.opacity;
      ctx.strokeStyle = annotation.color;
      ctx.fillStyle = annotation.color;
      ctx.lineWidth = Math.max(2, canvas.width * 0.003);
      if (annotation.type === 'text' || annotation.type === 'mark') {
        ctx.font = `${Math.max(8, annotation.fontSize * (canvas.width / Math.max(1, editState.pageWidth)))}px Inter, sans-serif`;
        ctx.fillText(annotation.type === 'mark' ? 'X' : annotation.text, x, y);
      } else if (annotation.type === 'highlight') {
        ctx.fillRect(x, y, annotation.w * canvas.width, annotation.h * canvas.height);
      } else if (annotation.type === 'rectangle') {
        ctx.strokeRect(x, y, annotation.w * canvas.width, annotation.h * canvas.height);
      } else if (annotation.type === 'freehand' && annotation.points?.length) {
        ctx.beginPath();
        annotation.points.forEach((point, index) => {
          const px = point.x * canvas.width; const py = point.y * canvas.height;
          if (!index) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        });
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  async function renderEditPreview() {
    try {
      const pdf = await ensureEditPdfLoaded();
      const pageNumber = Math.max(1, Math.min(pdf.numPages, Number($('editPage').value || 1)));
      $('editPage').value = String(pageNumber);
      const page = await pdf.getPage(pageNumber);
      const natural = page.getViewport({ scale: 1 });
      const scale = Math.min(1.8, 720 / Math.max(1, natural.width));
      const viewport = page.getViewport({ scale });
      const base = $('editPdfCanvas');
      const overlay = $('editOverlayCanvas');
      base.width = overlay.width = Math.round(viewport.width);
      base.height = overlay.height = Math.round(viewport.height);
      await page.render({ canvasContext: base.getContext('2d', { alpha: false }), viewport, background: 'white' }).promise;
      editState.pageWidth = natural.width;
      editState.pageHeight = natural.height;
      drawEditOverlay();
      $('editPreviewInfo').textContent = `Page ${pageNumber} of ${pdf.numPages}. Annotations on this page: ${editState.annotations.filter((item) => item.pageIndex === pageNumber - 1).length}.`;
    } catch (error) {
      setStatus('editStatus', humanError(error), 'error');
    }
  }

  function editToolHelp() {
    const tool = $('editTool').value;
    const messages = {
      text: 'Enter text and click the page.', mark: 'Click where an X mark should appear.',
      highlight: 'Drag over the area to highlight.', rectangle: 'Drag to draw a rectangle.', freehand: 'Draw directly on the page.',
    };
    $('editToolHelp').textContent = messages[tool];
  }

  async function applyEditFormValues(pdf) {
    const controls = Array.from(document.querySelectorAll('#editFormFields .form-field-control'));
    if (!controls.length) return;
    const form = pdf.getForm();
    const fields = form.getFields();
    controls.forEach((control) => {
      const field = fields.find((item) => item.getName() === control.dataset.fieldName);
      if (!field) return;
      const type = control.dataset.fieldType;
      if (type === 'text') field.setText(control.value);
      else if (type === 'checkbox') control.checked ? field.check() : field.uncheck();
      else if (type === 'dropdown' && control.value) field.select(control.value);
      else if (type === 'radio' && control.value) field.select(control.value);
      else if (type === 'list' && control.value) field.select(control.value);
    });
    if ($('editFlatten').checked) form.flatten();
  }

  async function applyVisualAnnotations(pdf) {
    const pages = pdf.getPages();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    editState.annotations.forEach((annotation) => {
      const page = pages[annotation.pageIndex];
      if (!page) return;
      const { width, height } = page.getSize();
      const color = parseHexColor(annotation.color);
      const pdfColor = rgb(color.r, color.g, color.b);
      const x = annotation.x * width;
      if (annotation.type === 'text' || annotation.type === 'mark') {
        const size = annotation.fontSize;
        const y = Math.max(0, height - annotation.y * height - size);
        page.drawText(annotation.type === 'mark' ? 'X' : toWinAnsiText(annotation.text), { x, y, size, font: annotation.type === 'mark' ? bold : font, color: pdfColor, opacity: annotation.opacity });
      } else if (annotation.type === 'highlight' || annotation.type === 'rectangle') {
        const w = annotation.w * width;
        const h = annotation.h * height;
        const y = height - (annotation.y + annotation.h) * height;
        if (annotation.type === 'highlight') page.drawRectangle({ x, y, width: w, height: h, color: pdfColor, opacity: annotation.opacity, borderWidth: 0 });
        else page.drawRectangle({ x, y, width: w, height: h, borderColor: pdfColor, borderWidth: Math.max(1, width * 0.0025), opacity: annotation.opacity });
      } else if (annotation.type === 'freehand' && annotation.points?.length > 1) {
        for (let i = 1; i < annotation.points.length; i += 1) {
          const first = annotation.points[i - 1]; const second = annotation.points[i];
          page.drawLine({
            start: { x: first.x * width, y: height - first.y * height },
            end: { x: second.x * width, y: height - second.y * height },
            thickness: Math.max(1.2, width * 0.003), color: pdfColor, opacity: annotation.opacity,
          });
        }
      }
    });
  }

  function wireEditAndFill() {
    $('editFile').addEventListener('change', async () => {
      editState = { pdfJs: null, fileKey: '', pageCount: 0, annotations: [], drag: null, pageWidth: 0, pageHeight: 0 };
      await renderEditPreview();
    });
    $('editPage').addEventListener('change', renderEditPreview);
    $('editUpdatePreview').addEventListener('click', renderEditPreview);
    $('editTool').addEventListener('change', editToolHelp);
    $('editOpacity').addEventListener('input', () => { $('editOpacityValue').textContent = `${Math.round(Number($('editOpacity').value) * 100)}%`; });
    $('editUndo').addEventListener('click', () => {
      const pageIndex = Number($('editPage').value || 1) - 1;
      for (let index = editState.annotations.length - 1; index >= 0; index -= 1) {
        if (editState.annotations[index].pageIndex === pageIndex) { editState.annotations.splice(index, 1); break; }
      }
      drawEditOverlay();
    });
    $('editClearPage').addEventListener('click', () => {
      const pageIndex = Number($('editPage').value || 1) - 1;
      editState.annotations = editState.annotations.filter((annotation) => annotation.pageIndex !== pageIndex);
      drawEditOverlay();
    });

    const overlay = $('editOverlayCanvas');
    overlay.addEventListener('pointerdown', (event) => {
      if (!editState.pdfJs) return;
      overlay.setPointerCapture(event.pointerId);
      const point = annotationPoint(event);
      const tool = $('editTool').value;
      const base = {
        pageIndex: Number($('editPage').value || 1) - 1, type: tool, x: point.x, y: point.y,
        color: $('editColor').value, opacity: Number($('editOpacity').value), fontSize: Number($('editFontSize').value || 14),
      };
      if (tool === 'text') {
        const text = $('editTextValue').value.trim();
        if (!text) return setStatus('editStatus', 'Enter text before clicking the page.', 'error');
        editState.annotations.push({ ...base, text }); drawEditOverlay(); return;
      }
      if (tool === 'mark') { editState.annotations.push(base); drawEditOverlay(); return; }
      editState.drag = tool === 'freehand' ? { ...base, points: [point] } : { ...base, w: 0, h: 0 };
    });
    overlay.addEventListener('pointermove', (event) => {
      if (!editState.drag) return;
      const point = annotationPoint(event);
      if (editState.drag.type === 'freehand') editState.drag.points.push(point);
      else {
        editState.drag.w = point.x - editState.drag.x;
        editState.drag.h = point.y - editState.drag.y;
      }
      const temp = { ...editState.drag };
      if (temp.w < 0) { temp.x += temp.w; temp.w = Math.abs(temp.w); }
      if (temp.h < 0) { temp.y += temp.h; temp.h = Math.abs(temp.h); }
      drawEditOverlay(temp);
    });
    const finish = (event) => {
      if (!editState.drag) return;
      try { overlay.releasePointerCapture(event.pointerId); } catch (_) {}
      const item = { ...editState.drag };
      if (item.w < 0) { item.x += item.w; item.w = Math.abs(item.w); }
      if (item.h < 0) { item.y += item.h; item.h = Math.abs(item.h); }
      if (item.type === 'freehand' ? item.points.length > 1 : item.w > 0.003 && item.h > 0.003) editState.annotations.push(item);
      editState.drag = null;
      drawEditOverlay();
    };
    overlay.addEventListener('pointerup', finish);
    overlay.addEventListener('pointercancel', finish);

    $('editButton').addEventListener('click', async () => {
      const file = $('editFile').files[0];
      if (!file) return setStatus('editStatus', 'Select a PDF file.', 'error');
      setStatus('editStatus', 'Applying fields and annotations…', 'working');
      $('editButton').disabled = true;
      try {
        const pdf = await PDFDocument.load(await file.arrayBuffer());
        await applyEditFormValues(pdf);
        await applyVisualAnnotations(pdf);
        const bytes = await pdf.save();
        downloadBlob(bytes, `${baseName(file.name)}-edited.pdf`, 'application/pdf');
        setStatus('editStatus', `Saved ${editState.annotations.length} visual annotation${editState.annotations.length === 1 ? '' : 's'} and the entered form values.`, 'success');
      } catch (error) {
        setStatus('editStatus', humanError(error), 'error');
      } finally {
        $('editButton').disabled = false;
      }
    });

    editToolHelp();
    resetEditTool();
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
  wireSign();
  wireOcr();
  wireProtection();
  wireEditAndFill();
  wireTextExtraction();

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
