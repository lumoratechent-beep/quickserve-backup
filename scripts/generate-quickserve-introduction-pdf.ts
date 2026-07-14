import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildQuickServeIntroductionPdf, CatalogueAssets } from '../components/QuickServeIntroductionDocument';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputDirectory = resolve(scriptDirectory, '../public/docs');
const outputPath = resolve(outputDirectory, 'introducing-quickserve-commercial-product-profile.pdf');

mkdirSync(outputDirectory, { recursive: true });

const pngDataUrl = (relativePath: string) => `data:image/png;base64,${readFileSync(resolve(scriptDirectory, relativePath)).toString('base64')}`;
const assets: CatalogueAssets = {
  cashier: pngDataUrl('../public/marketing-img/cashier-view.png'),
  customer: pngDataUrl('../public/marketing-img/customer-mobile-view.png'),
  orderTaker: pngDataUrl('../public/marketing-img/order-taker-view.png'),
  logo: pngDataUrl('../public/LOGO/9.png'),
};

const pdf = await buildQuickServeIntroductionPdf(assets);
const bytes = Buffer.from(pdf.output('arraybuffer'));
writeFileSync(outputPath, bytes);

console.log(`Generated ${outputPath} (${bytes.length.toLocaleString()} bytes)`);
