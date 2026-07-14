import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildQuickServeIntroductionPdf } from '../components/QuickServeIntroductionDocument';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputDirectory = resolve(scriptDirectory, '../public/docs');
const outputPath = resolve(outputDirectory, 'introducing-quickserve-complete-product-profile.pdf');

mkdirSync(outputDirectory, { recursive: true });

const pdf = await buildQuickServeIntroductionPdf();
const bytes = Buffer.from(pdf.output('arraybuffer'));
writeFileSync(outputPath, bytes);

console.log(`Generated ${outputPath} (${bytes.length.toLocaleString()} bytes)`);
