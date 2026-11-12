import type { DocumentExtraction } from './types';

export interface ExtractResult {
  text: string;
  ocrUsed: boolean;
}

function isImage(file: File): boolean {
  return file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name);
}

function isPDF(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

function isDocx(file: File): boolean {
  return (
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    /\.docx$/i.test(file.name)
  );
}

function isDoc(file: File): boolean {
  return file.type === 'application/msword' || /\.doc$/i.test(file.name);
}

function isTextLike(file: File): boolean {
  return (
    file.type === 'text/plain' ||
    file.type === 'text/markdown' ||
    /\.(txt|md|csv|json)$/i.test(file.name)
  );
}

async function extractTextFile(file: File): Promise<ExtractResult> {
  return { text: await file.text(), ocrUsed: false };
}

async function extractPDF(file: File): Promise<ExtractResult> {
  const pdfjs = await import('pdfjs-dist');
  // Use the bundled worker via URL for Vite compatibility
  const workerUrl = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).href;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? (item as { str: string }).str : ''))
      .join(' ');
    pages.push(text);
  }
  return { text: pages.join('\n\n'), ocrUsed: false };
}

async function extractDOCX(file: File): Promise<ExtractResult> {
  const mammoth = await import('mammoth/mammoth.browser');
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return { text: result.value, ocrUsed: false };
}

async function extractImageOCR(file: File): Promise<ExtractResult> {
  const Tesseract = await import('tesseract.js');
  const result = await Tesseract.recognize(file, 'eng');
  return { text: result.data.text, ocrUsed: true };
}

export async function extractDocument(
  file: File,
  docId: string,
  onProgress?: (status: DocumentExtraction['status']) => void
): Promise<DocumentExtraction> {
  const base: DocumentExtraction = {
    docId,
    status: 'processing',
    text: '',
    charCount: 0,
    ocrUsed: false,
  };

  try {
    let result: ExtractResult;

    if (isTextLike(file)) {
      result = await extractTextFile(file);
    } else if (isPDF(file)) {
      onProgress?.('processing');
      result = await extractPDF(file);
    } else if (isDocx(file)) {
      result = await extractDOCX(file);
    } else if (isImage(file)) {
      onProgress?.('processing');
      result = await extractImageOCR(file);
    } else if (isDoc(file)) {
      // Legacy .doc binary format -- not reliably parseable in-browser
      return {
        ...base,
        status: 'unsupported',
        error: 'Legacy .doc format is not supported in-browser. Convert to .docx or PDF and re-upload.',
      };
    } else {
      return {
        ...base,
        status: 'unsupported',
        error: 'This file format is not supported for text extraction.',
      };
    }

    const text = result.text.trim();
    if (!text) {
      return {
        ...base,
        status: 'error',
        ocrUsed: result.ocrUsed,
        error: result.ocrUsed
          ? 'OCR completed but no readable text was found in this image. Try a clearer scan.'
          : 'No text was found in this file. It may be a scanned PDF — try converting it to an image for OCR.',
      };
    }

    return {
      ...base,
      status: 'extracted',
      text,
      charCount: text.length,
      ocrUsed: result.ocrUsed,
      extractedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      ...base,
      status: 'error',
      error: err instanceof Error ? err.message : 'Extraction failed unexpectedly.',
    };
  }
}

export function supportsExtraction(file: File): boolean {
  return isTextLike(file) || isPDF(file) || isDocx(file) || isImage(file);
}
