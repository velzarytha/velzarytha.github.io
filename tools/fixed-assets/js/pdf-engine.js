window.PdfEngine = (() => {
  function escapePdf(value) {
    return String(value ?? "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[^\x20-\x7E]/g, "?");
  }

  function createTextPdf(title, lines, options = {}) {
    const pageWidth = 612;
    const pageHeight = 792;
    const margin = 48;
    const lineHeight = options.lineHeight || 13;
    const maxLines = Math.floor((pageHeight - margin * 2) / lineHeight) - 3;
    const wrapped = [];
    const maxChars = options.maxChars || 88;

    [title, ...(lines || [])].forEach((line, index) => {
      const text = String(line ?? "");
      if (!text) { wrapped.push(""); return; }
      const words = text.split(/\s+/);
      let current = "";
      words.forEach(word => {
        if ((current + " " + word).trim().length > maxChars) {
          wrapped.push(current);
          current = word;
        } else current = (current + " " + word).trim();
      });
      if (current) wrapped.push(current);
      if (index === 0) wrapped.push("");
    });

    const pages = [];
    for (let i = 0; i < wrapped.length; i += maxLines) pages.push(wrapped.slice(i, i + maxLines));
    if (!pages.length) pages.push([title]);

    const objects = [];
    const addObject = content => { objects.push(content); return objects.length; };
    const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    const boldId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
    const pageIds = [];
    const contentIds = [];

    pages.forEach((page, pageIndex) => {
      let stream = "BT\n/F1 9 Tf\n";
      let y = pageHeight - margin;
      page.forEach((line, index) => {
        const heading = index === 0 || /^PART\s|^[A-Z0-9 .&/-]{8,}$/.test(line);
        stream += `${heading ? "/F2 11 Tf" : "/F1 9 Tf"}\n1 0 0 1 ${margin} ${y} Tm (${escapePdf(line)}) Tj\n`;
        y -= lineHeight;
      });
      stream += `1 0 0 1 ${margin} 24 Tm (Page ${pageIndex + 1} of ${pages.length}) Tj\nET`;
      contentIds.push(addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`));
      pageIds.push(addObject("PAGE_PLACEHOLDER"));
    });

    const pagesId = addObject("PAGES_PLACEHOLDER");
    const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
    pageIds.forEach((id, index) => {
      objects[id - 1] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldId} 0 R >> >> /Contents ${contentIds[index]} 0 R >>`;
    });
    objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets.push(pdf.length);
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach(offset => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Blob([pdf], { type: "application/pdf" });
  }

  return { createTextPdf };
})();
