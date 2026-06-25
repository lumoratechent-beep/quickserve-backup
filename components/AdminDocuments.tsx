import React, { useMemo, useState } from 'react';
import { BookOpen, Download, ExternalLink, FileText, Presentation, Search } from 'lucide-react';
import PitchDeck from './PitchDeck';
import lanPrintingGuide from '../docs/LAN_PRINTING_TERMUX_SETUP.md?raw';
import wifiPrintingGuide from '../docs/WIFI_PRINTING_TERMUX_SETUP.md?raw';
import sunmiGuide from '../docs/SUNMI_V2_INTEGRATION.md?raw';

type GuideDocument = {
  id: string;
  title: string;
  description: string;
  type: 'guide';
  markdown: string;
  filename: string;
  staticPdfPath: string;
};

type PitchDocument = {
  id: string;
  title: string;
  description: string;
  type: 'pitch';
};

type AdminDocument = GuideDocument | PitchDocument;

const documents: AdminDocument[] = [
  {
    id: 'lan-printing-termux',
    title: 'LAN Printing Setup',
    description: 'Android Tablet + Termux print server setup for Ethernet thermal printers.',
    type: 'guide',
    markdown: lanPrintingGuide,
    filename: 'quickserve-lan-printing-termux-setup.pdf',
    staticPdfPath: '/docs/quickserve-lan-printing-termux-setup.pdf',
  },
  {
    id: 'wifi-printing-termux',
    title: 'WiFi Printing Setup',
    description: 'Android Tablet + Termux print server setup for WiFi thermal printers and order routing.',
    type: 'guide',
    markdown: wifiPrintingGuide,
    filename: 'quickserve-wifi-printing-termux-setup.pdf',
    staticPdfPath: '/docs/quickserve-wifi-printing-termux-setup.pdf',
  },
  {
    id: 'sunmi-v2',
    title: 'SUNMI V2 Integration',
    description: 'Built-in SUNMI V2 printer bridge requirements and setup notes.',
    type: 'guide',
    markdown: sunmiGuide,
    filename: 'quickserve-sunmi-v2-integration.pdf',
    staticPdfPath: '/docs/quickserve-sunmi-v2-integration.pdf',
  },
  {
    id: 'pitch-deck',
    title: 'QuickServe Pitch Deck',
    description: 'Interactive presentation deck with built-in PDF export.',
    type: 'pitch',
  },
];

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const stripMarkdown = (line: string) =>
  line
    .replace(/^\s*[-*]\s+/, '- ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

const renderMarkdown = (markdown: string) => {
  const lines = markdown.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push(
        <pre key={`code-${i}`} className="overflow-x-auto rounded-lg bg-gray-950 p-4 text-[11px] leading-relaxed text-green-300">
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    if (trimmed.startsWith('|') && lines[i + 1]?.trim().startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i += 1;
      }
      const rows = tableLines
        .filter(row => !/^\|\s*-/.test(row))
        .map(row => row.split('|').slice(1, -1).map(cell => cell.trim()));
      const [head, ...body] = rows;
      blocks.push(
        <div key={`table-${i}`} className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>{head?.map((cell, index) => <th key={index} className="px-3 py-2 font-black text-gray-600 dark:text-gray-200">{cell}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-t border-gray-100 dark:border-gray-700">
                  {row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300">{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (trimmed.startsWith('#')) {
      const level = Math.min(trimmed.match(/^#+/)?.[0].length || 1, 3);
      const text = trimmed.replace(/^#+\s*/, '');
      const id = slugify(text);
      const className = level === 1
        ? 'text-2xl font-black tracking-tight text-gray-900 dark:text-white'
        : level === 2
          ? 'text-lg font-black tracking-tight text-gray-900 dark:text-white pt-3'
          : 'text-sm font-black uppercase tracking-widest text-orange-500 pt-2';
      blocks.push(React.createElement(`h${level}`, { key: `heading-${i}`, id, className }, text));
      i += 1;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(stripMarkdown(lines[i].trim()).replace(/^-\s*/, ''));
        i += 1;
      }
      blocks.push(
        <ul key={`list-${i}`} className="list-disc space-y-1 pl-5 text-sm font-medium leading-relaxed text-gray-600 dark:text-gray-300">
          {items.map((item, index) => <li key={index}>{item}</li>)}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(stripMarkdown(lines[i].trim()).replace(/^\d+\.\s*/, ''));
        i += 1;
      }
      blocks.push(
        <ol key={`ordered-${i}`} className="list-decimal space-y-1 pl-5 text-sm font-medium leading-relaxed text-gray-600 dark:text-gray-300">
          {items.map((item, index) => <li key={index}>{item}</li>)}
        </ol>
      );
      continue;
    }

    blocks.push(
      <p key={`paragraph-${i}`} className="text-sm font-medium leading-relaxed text-gray-600 dark:text-gray-300">
        {stripMarkdown(trimmed)}
      </p>
    );
    i += 1;
  }

  return blocks;
};

const downloadMarkdownPdf = async (doc: GuideDocument) => {
  const { default: jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const marginX = 16;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const maxWidth = pageWidth - marginX * 2;
  let y = 18;

  const addLine = (text: string, options: { size?: number; style?: 'normal' | 'bold'; gap?: number } = {}) => {
    const size = options.size || 10;
    pdf.setFont('helvetica', options.style || 'normal');
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(text, maxWidth);
    const lineHeight = size * 0.42;
    if (y + lines.length * lineHeight > pageHeight - 16) {
      pdf.addPage();
      y = 18;
    }
    pdf.text(lines, marginX, y);
    y += lines.length * lineHeight + (options.gap ?? 3);
  };

  doc.markdown.split(/\r?\n/).forEach(rawLine => {
    const line = rawLine.trim();
    if (!line || line.startsWith('| ---') || line.startsWith('```')) return;
    if (line.startsWith('# ')) addLine(line.replace(/^#\s+/, ''), { size: 18, style: 'bold', gap: 6 });
    else if (line.startsWith('## ')) addLine(line.replace(/^##\s+/, ''), { size: 14, style: 'bold', gap: 5 });
    else if (line.startsWith('### ')) addLine(line.replace(/^###\s+/, ''), { size: 11, style: 'bold', gap: 4 });
    else addLine(stripMarkdown(line), { size: 9, gap: 2.5 });
  });

  pdf.save(doc.filename);
};

const AdminDocuments: React.FC = () => {
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState(documents[0].id);
  const [showPitchDeck, setShowPitchDeck] = useState(false);
  const activeDocument = documents.find(doc => doc.id === activeId) || documents[0];

  const filteredDocuments = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return documents;
    return documents.filter(doc =>
      `${doc.title} ${doc.description} ${doc.type}`.toLowerCase().includes(normalized)
    );
  }, [query]);

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tighter text-gray-900 dark:text-white">Guides & Documents</h1>
          <p className="mt-1 text-xs font-medium uppercase tracking-widest text-gray-500 dark:text-gray-400">
            Product guides, setup references, and sales documents.
          </p>
        </div>
        <div className="relative w-full lg:w-80">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search documents"
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm font-bold text-gray-700 outline-none focus:border-orange-400 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-2">
          {filteredDocuments.map(doc => {
            const Icon = doc.type === 'pitch' ? Presentation : FileText;
            const active = doc.id === activeDocument.id;
            return (
              <button
                key={doc.id}
                onClick={() => setActiveId(doc.id)}
                className={`w-full rounded-xl border p-4 text-left transition-all ${
                  active
                    ? 'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-900/20 dark:text-orange-300'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-orange-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`rounded-lg p-2 ${active ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'}`}>
                    <Icon size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-black uppercase tracking-tight">{doc.title}</p>
                    <p className="mt-1 text-[10px] font-medium leading-relaxed opacity-80">{doc.description}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </aside>

        <section className="min-h-[620px] rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex flex-col gap-4 border-b border-gray-100 p-5 dark:border-gray-700 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-orange-100 p-3 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300">
                {activeDocument.type === 'pitch' ? <Presentation size={20} /> : <BookOpen size={20} />}
              </div>
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight text-gray-900 dark:text-white">{activeDocument.title}</h2>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{activeDocument.description}</p>
              </div>
            </div>

            {activeDocument.type === 'guide' ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <a
                  href={activeDocument.staticPdfPath}
                  download={activeDocument.filename}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-gray-600 transition-all hover:border-orange-300 hover:text-orange-500 dark:border-gray-700 dark:text-gray-300"
                >
                  <ExternalLink size={14} /> Saved PDF
                </a>
                <button
                  onClick={() => downloadMarkdownPdf(activeDocument)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-orange-500 dark:bg-white dark:text-gray-900 dark:hover:bg-orange-500 dark:hover:text-white"
                >
                  <Download size={14} /> Export PDF
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowPitchDeck(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-orange-600"
              >
                <ExternalLink size={14} /> Open Deck
              </button>
            )}
          </div>

          {activeDocument.type === 'guide' ? (
            <article className="max-h-[72vh] space-y-4 overflow-y-auto p-5 md:p-7">
              {renderMarkdown(activeDocument.markdown)}
            </article>
          ) : (
            <div className="flex min-h-[520px] flex-col items-center justify-center p-8 text-center">
              <div className="mb-5 rounded-2xl bg-orange-100 p-5 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300">
                <Presentation size={40} />
              </div>
              <h3 className="text-xl font-black uppercase tracking-tight text-gray-900 dark:text-white">QuickServe Pitch Deck</h3>
              <p className="mt-2 max-w-md text-sm font-medium leading-relaxed text-gray-500 dark:text-gray-400">
                The pitch deck now lives in this document library. Open it to present slides or use its built-in PDF download.
              </p>
              <button
                onClick={() => setShowPitchDeck(true)}
                className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-orange-600"
              >
                <Presentation size={15} /> Launch Pitch Deck
              </button>
            </div>
          )}
        </section>
      </div>

      {showPitchDeck && <PitchDeck onClose={() => setShowPitchDeck(false)} />}
    </div>
  );
};

export default AdminDocuments;
