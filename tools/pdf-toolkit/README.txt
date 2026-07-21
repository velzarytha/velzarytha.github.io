VELZARYTHA PDF TOOLKIT v3.0 COMPLETE
======================================

INSTALL
1. Extract this ZIP.
2. Replace your existing tools/pdf-toolkit folder with the extracted folder contents.
3. Keep all supplied files and folders, including js/office-converter.js, vendor/libpdf.bundle.js, THIRD-PARTY-NOTICES.txt and TESTING.txt.
4. Run through Live Server or GitHub Pages. Do not test only by double-clicking index.html.
5. Open the site online once so the browser can load and cache the conversion/OCR libraries.

INCLUDED CORE TOOLS
- Merge PDF
- Split/extract PDF pages
- Organize: reorder, rotate, delete and restore pages
- Images to PDF
- PDF pages to PNG/JPG ZIP
- Text watermark
- Page numbers
- Compress and resize PDF/images, including target portal sizes and passport-photo mode
- Visible PDF signature: draw, type or upload
- OCR scanned PDFs/images to searchable PDF and/or text (English, Hindi, Tamil)
- AES-256/AES-128 password protection with permissions
- Unlock a PDF using a known authorized password
- Edit and fill: existing AcroForm fields, text, X marks, highlights, rectangles and freehand ink
- PDF to text
- Structured PDF to Word (.docx): headings, paragraphs, lists, page breaks and detected tables
- Structured PDF to Excel (.xlsx): separate table sheets, editable preview, typed numbers/currency/percentages/dates, column widths and optional report sheet
- PDF tables to CSV, with ZIP output for multiple tables
- OCR fallback for image-only pages during Office conversion
- PWA manifest and service-worker foundation

STRUCTURED CONVERSION WORKFLOW
1. Select PDF to Word / Excel.
2. Choose output and document type.
3. Analyze structure.
4. Review the summary and editable table preview.
5. Correct uncertain cells if needed.
6. Export DOCX, XLSX or CSV.

IMPORTANT LIMITATIONS
- PDF stores visual page positions, not guaranteed Word paragraphs or Excel cells. Velzarytha reconstructs structure using layout heuristics.
- Simple reports, letters, statements, invoices and clearly aligned tables convert best.
- Complex magazines, overlapping objects, handwriting, unusual fonts, charts and irregular merged tables may require corrections.
- DOCX conversion does not currently reconstruct every embedded illustration, drawing, bookmark, form control or exact font.
- Visible signatures are not certificate-based cryptographic digital signatures.
- OCR accuracy depends on scan quality, language model and page complexity.
- The first OCR run downloads language data; it may take time and use browser storage.
- PDF permissions are advisory and not enforced equally by every reader.
- Unlock requires the correct password and authorization.
- Visual boxes are not secure redaction and do not remove underlying content.
- Complex XFA forms, unusual encryption, malformed PDFs, digital signatures and very large documents may not be fully supported.
- CDN libraries are loaded on first use; the service worker improves repeat/offline use after a successful online load.

PRIVACY
Selected files are processed in the browser. This build does not send document contents to a Velzarytha server.
