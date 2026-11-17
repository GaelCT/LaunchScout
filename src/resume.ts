export const MAX_RESUME_CHARS = 30_000;
export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

export interface ResumeDocument {
  fileName: string;
  originalText: string;
  sourceText: string;
  markdown: string;
  reviewed: boolean;
  aiGenerated: boolean;
  warnings: string[];
}

export function initialMarkdown(text: string): string {
  const headings =
    /^(summary|profile|education|experience|work experience|professional experience|projects|skills|technical skills|certifications|awards|volunteering|leadership)$/i;
  return text
    .trim()
    .split('\n')
    .map((line, index) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) return trimmed;
      if (index === 0 && trimmed.length < 100) return `# ${trimmed}`;
      if (headings.test(trimmed.replace(/:$/, ''))) return `\n## ${trimmed.replace(/:$/, '')}\n`;
      return trimmed.replace(/^[•●▪]\s*/, '- ');
    })
    .join('\n');
}

export async function extractResume(file: File): Promise<ResumeDocument> {
  if (!file.size) throw new Error('This file is empty. Choose a resume with readable text.');
  if (file.size > MAX_RESUME_BYTES) throw new Error('Choose a file smaller than 5 MB.');
  const extension = file.name.split('.').pop()?.toLowerCase();
  let text: string;
  if (extension === 'pdf') {
    const pdfjs = await import('pdfjs-dist');
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const task = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      useSystemFonts: true,
    });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 15)
        throw new Error('This document is longer than 15 pages. Import a shorter resume.');
      const pages: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        pages.push(
          content.items
            .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''))
            .join(''),
        );
        if (pages.join('\n').length > MAX_RESUME_CHARS)
          throw new Error('The resume is too long. Use up to 30,000 characters.');
      }
      text = pages.join('\n\n');
    } catch (error) {
      if (error instanceof Error && /longer|too long/.test(error.message)) throw error;
      throw new Error(
        'This PDF could not be read. Try an unlocked, text-based PDF or paste its text below.',
      );
    } finally {
      await task.destroy();
    }
  } else if (extension === 'docx') {
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      text = result.value;
    } catch {
      throw new Error(
        'This Word file could not be read. Try a .docx file or paste its text below.',
      );
    }
  } else if (extension === 'txt' || extension === 'md') {
    text = await file.text();
  } else throw new Error('Use PDF, DOCX, TXT, or Markdown. Older .doc files are not supported.');
  text = text.replace(/\r\n?/g, '\n').replace(/\0/g, '').trim();
  if (!text)
    throw new Error(
      'No readable text was found. Scanned PDFs need OCR first; you can also paste the text below.',
    );
  if (text.length > MAX_RESUME_CHARS)
    throw new Error('The resume is too long. Use up to 30,000 characters.');
  return {
    fileName: file.name,
    originalText: text,
    sourceText: text,
    markdown: extension === 'md' ? text : initialMarkdown(text),
    reviewed: false,
    aiGenerated: false,
    warnings: [],
  };
}
