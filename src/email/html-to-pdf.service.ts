import { Injectable, Logger } from '@nestjs/common';
import { chromium, type Browser } from 'playwright';

export type HtmlPdfDocument = {
  html: string;
  filename: string;
};

@Injectable()
export class HtmlToPdfService {
  private readonly logger = new Logger(HtmlToPdfService.name);

  /** Renders one or more HTML documents to PDF buffers (single Chromium session). */
  async renderPdfAttachments(documents: HtmlPdfDocument[]): Promise<
    Array<{ filename: string; content: Buffer; contentType: 'application/pdf' }>
  > {
    if (!documents.length) return [];

    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({ headless: true });
      const attachments: Array<{
        filename: string;
        content: Buffer;
        contentType: 'application/pdf';
      }> = [];

      for (const doc of documents) {
        const page = await browser.newPage();
        try {
          await page.setContent(this.wrapForPrint(doc.html), { waitUntil: 'networkidle' });
          const pdf = await page.pdf({
            format: 'A4',
            landscape: true,
            printBackground: true,
            margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' },
          });
          attachments.push({
            filename: doc.filename,
            content: Buffer.from(pdf),
            contentType: 'application/pdf',
          });
        } finally {
          await page.close();
        }
      }

      this.logger.log(`Generated ${attachments.length} PDF attachment(s)`);
      return attachments;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `PDF generation failed (is Chromium installed? run: npx playwright install chromium): ${msg}`,
      );
      throw err;
    } finally {
      if (browser) await browser.close();
    }
  }

  private wrapForPrint(html: string): string {
    const trimmed = html.trim();
    if (/^<!DOCTYPE/i.test(trimmed) || /^<html/i.test(trimmed)) {
      return trimmed;
    }
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 12px; color: #111827; }
    table { border-collapse: collapse; }
    tr { page-break-inside: avoid; }
  </style>
</head>
<body>${trimmed}</body>
</html>`;
  }
}
