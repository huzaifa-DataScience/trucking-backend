const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

(async () => {
  const root = path.join(__dirname, '..');
  const html = path.join(root, 'docs/backend-design.html');
  const pdf = path.join(root, 'docs/BACKEND_DESIGN.pdf');
  const slides = path.join(root, 'docs/.backend-design-slides');
  const docx = path.join(root, 'docs/BACKEND_DESIGN.docx');
  fs.mkdirSync(slides, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1122, height: 794 } });
  await page.goto('file://' + html, { waitUntil: 'load' });
  await page.pdf({
    path: pdf,
    width: '1122px',
    height: '794px',
    printBackground: true,
    margin: { top: '0', bottom: '0', left: '0', right: '0' },
  });
  const sections = await page.$$('.page');
  const pngs = [];
  for (let i = 0; i < sections.length; i++) {
    const p = path.join(slides, `p${i + 1}.png`);
    await sections[i].screenshot({ path: p });
    pngs.push(p);
  }
  await browser.close();

  const py = `
from docx import Document
from docx.shared import Inches, Emu
from docx.enum.section import WD_ORIENT
doc = Document()
sec = doc.sections[0]
sec.orientation = WD_ORIENT.LANDSCAPE
sec.page_width = Inches(13.333)
sec.page_height = Inches(7.5)
sec.left_margin = Inches(0.25)
sec.right_margin = Inches(0.25)
sec.top_margin = Inches(0.25)
sec.bottom_margin = Inches(0.25)
pngs = ${JSON.stringify(pngs)}
for i, p in enumerate(pngs):
    if i:
        doc.add_page_break()
    doc.add_picture(p, width=Inches(12.8))
doc.save(${JSON.stringify(docx)})
print('wrote', ${JSON.stringify(docx)})
`;
  execFileSync('python3', ['-c', py], { stdio: 'inherit' });
  console.log('pdf', pdf);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
