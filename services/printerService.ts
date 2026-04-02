// services/printerService.ts
// ESC/POS formatting features inspired by mike42/escpos-php capability profiles.

import EscPosEncoder from 'esc-pos-encoder';

export interface PrinterDevice {
  id: string;
  name: string;
}

// ─── Printer Capability Profiles ────────────────────────────────────────────
// Modeled after escpos-php's capabilities.json — one profile per printer model.
// Each profile declares paper width, supported features, and ESC/POS quirks.
export interface PrinterProfile {
  id: string;
  vendor: string;
  name: string;
  /** Characters per line at normal (Font A) size */
  columns: number;
  /** Paper width in mm */
  paperWidthMm: number;
  /** Print-area width in dots (used by GS W) */
  printWidthDots: number;
  /** Font A supported */
  fontA: boolean;
  /** Font B supported (narrower) */
  fontB: boolean;
  /** Font C supported (some Epson models) */
  fontC: boolean;
  /** ESC a alignment works correctly */
  supportsAlignment: boolean;
  /** GS ! text scaling works */
  supportsTextSize: boolean;
  /** ESC E bold/emphasis */
  supportsBold: boolean;
  /** ESC - underline */
  supportsUnderline: boolean;
  /** GS B reverse colors (white on black) */
  supportsReverse: boolean;
  /** GS k barcode (function B) */
  supportsBarcodeB: boolean;
  /** GS ( k QR code */
  supportsQrCode: boolean;
  /** GS ( k PDF417 */
  supportsPdf417: boolean;
  /** GS v 0  or GS ( L  raster image printing */
  supportsGraphics: boolean;
  /** GS V paper cut */
  supportsCut: boolean;
  /** Partial cut supported */
  supportsPartialCut: boolean;
  /** ESC p cash drawer pulse */
  supportsCashDrawer: boolean;
  /** Star command set instead of Epson ESC/POS */
  starCommands: boolean;
  /** Notes / known quirks */
  notes: string;
}

/** Built-in printer profiles extracted from escpos-php capabilities.json */
export const PRINTER_PROFILES: PrinterProfile[] = [
  // ── Generic ──
  {
    id: 'default', vendor: 'Generic', name: 'Default (Epson-compatible)',
    columns: 42, paperWidthMm: 80, printWidthDots: 576,
    fontA: true, fontB: true, fontC: false,
    supportsAlignment: true, supportsTextSize: true, supportsBold: true,
    supportsUnderline: true, supportsReverse: true, supportsBarcodeB: true,
    supportsQrCode: true, supportsPdf417: true, supportsGraphics: true,
    supportsCut: true, supportsPartialCut: true, supportsCashDrawer: true,
    starCommands: false, notes: 'Generic Epson-compatible profile. Works with most 80mm printers.',
  },
  {
    id: 'simple', vendor: 'Generic', name: 'Simple (58mm)',
    columns: 32, paperWidthMm: 58, printWidthDots: 384,
    fontA: true, fontB: false, fontC: false,
    supportsAlignment: true, supportsTextSize: true, supportsBold: true,
    supportsUnderline: true, supportsReverse: false, supportsBarcodeB: false,
    supportsQrCode: false, supportsPdf417: false, supportsGraphics: false,
    supportsCut: true, supportsPartialCut: false, supportsCashDrawer: false,
    starCommands: false, notes: 'Basic 58mm thermal printer. Limited feature set.',
  },
  // ── Epson ──
  {
    id: 'TM-T88V', vendor: 'Epson', name: 'TM-T88V',
    columns: 42, paperWidthMm: 80, printWidthDots: 576,
    fontA: true, fontB: true, fontC: false,
    supportsAlignment: true, supportsTextSize: true, supportsBold: true,
    supportsUnderline: true, supportsReverse: true, supportsBarcodeB: true,
    supportsQrCode: true, supportsPdf417: true, supportsGraphics: true,
    supportsCut: true, supportsPartialCut: true, supportsCashDrawer: true,
    starCommands: false, notes: 'Full-featured Epson thermal receipt printer.',
  },
  {
    id: 'TM-T88IV', vendor: 'Epson', name: 'TM-T88IV',
    columns: 42, paperWidthMm: 80, printWidthDots: 576,
    fontA: true, fontB: true, fontC: false,
    supportsAlignment: true, supportsTextSize: true, supportsBold: true,
    supportsUnderline: true, supportsReverse: true, supportsBarcodeB: true,
    supportsQrCode: false, supportsPdf417: false, supportsGraphics: true,
    supportsCut: true, supportsPartialCut: true, supportsCashDrawer: true,
    starCommands: false, notes: 'Older Epson model. No QR/PDF417 support.',
  },
  {
    id: 'TM-T88III', vendor: 'Epson', name: 'TM-T88III',
    columns: 42, paperWidthMm: 80, printWidthDots: 576,
    fontA: true, fontB: true, fontC: false,
    supportsAlignment: true, supportsTextSize: true, supportsBold: true,
    supportsUnderline: true, supportsReverse: true, supportsBarcodeB: true,
    supportsQrCode: false, supportsPdf417: false, supportsGraphics: false,
    supportsCut: true, supportsPartialCut: true, supportsCashDrawer: true,
    starCommands: false, notes: 'Legacy Epson. No graphics/QR support.',
  },
  {
    id: 'TM-T20III', vendor: 'Epson', name: 'TM-T20III',
    columns: 42, paperWidthMm: 80, printWidthDots: 576,
    fontA: true, fontB: true, fontC: false,
    supportsAlignment: true, supportsTextSize: true, supportsBold: true,
    supportsUnderline: true, supportsReverse: true, supportsBarcodeB: true,
    supportsQrCode: true, supportsPdf417: true, supportsGraphics: true,
    supportsCut: true, supportsPartialCut: true, supportsCashDrawer: true,
    starCommands: false, notes: 'Modern Epson entry-level thermal printer.',
  },
  {
    id: 'TM-P80', vendor: 'Epson', name: 'TM-P80 (Mobile)',
    columns: 42, paperWidthMm: 80, printWidthDots: 576,
    fontA: true, fontB: true, fontC: false,
    supportsAlignment: true, supportsTextSize: true, supportsBold: true,
    supportsUnderline: true, supportsReverse: true, supportsBarcodeB: true,
    supportsQrCode: true, supportsPdf417: true, supportsGraphics: true,
    supportsCut: true, supportsPartialCut: true, supportsCashDrawer: false,
    starCommands: false, notes: 'Epson mobile printer. No cash drawer.',
  },
  {
    id: 'TM-M30II', vendor: 'Epson', name: 'TM-M30II',
    columns: 42, paperWidthMm: 80, printWidthDots: 576,
    fontA: true, fontB: true, fontC: false,
    supportsAlignment: true, supportsTextSize: true, supportsBold: true,
    supportsUnderline: true, supportsReverse: true, supportsBarcodeB: true,
    supportsQrCode: true, supportsPdf417: true, supportsGraphics: true,
    supportsCut: true, supportsPartialCut: true, supportsCashDrawer: true,
    starCommands: false, notes: 'Compact Epson mPOS printer.',
  },
  {
    id: 'TM-U220', vendor: 'Epson', name: 'TM-U220 (Impact)',
    columns: 33, paperWidthMm: 76, printWidthDots: 384,
    fontA: true, fontB: true, fontC: false,
    supportsAlignment: true, supportsTextSize: false, supportsBold: true,
    supportsUnderline: false, supportsReverse: false, supportsBarcodeB: true,
    supportsQrCode: false, supportsPdf417: false, supportsGraphics: false,
    supportsCut: true, supportsPartialCut: true, supportsCashDrawer: true,
    starCommands: false, notes: 'Impact/dot-matrix kitchen printer. Very limited formatting.',
  },
  // ── Star Micronics ──
  {
    id: 'TSP143IV', vendor: 'Star Micronics', name: 'TSP143IV',
    columns: 48, paperWidthMm: 80, printWidthDots: 576,
    fontA: true, fontB: true, fontC: false,
    supportsAlignment: true, supportsTextSize: true, supportsBold: true,
    supportsUnderline: true, supportsReverse: true, supportsBarcodeB: true,
    supportsQrCode: true, supportsPdf417: false, supportsGraphics: true,
    supportsCut: true, supportsPartialCut: true, supportsCashDrawer: true,
    starCommands: true, notes: 'Star CloudPRNT thermal. Uses Star command set.',
  },
  {
    id: 'mC-Print3', vendor: 'Star Micronics', name: 'mC-Print3',
    columns: 48, paperWidthMm: 80, printWidthDots: 576,
    fontA: true, fontB: true, fontC: false,
    supportsAlignment: true, supportsTextSize: true, supportsBold: true,
    supportsUnderline: true, supportsReverse: true, supportsBarcodeB: true,
    supportsQrCode: true, supportsPdf417: false, supportsGraphics: true,
    supportsCut: true, supportsPartialCut: true, supportsCashDrawer: true,
    starCommands: true, notes: 'Star mC-Print3 mPOS printer. Star command set.',
  },
  {
    id: 'SM-L200', vendor: 'Star Micronics', name: 'SM-L200 (Mobile)',
    columns: 32, paperWidthMm: 58, printWidthDots: 384,
    fontA: true, fontB: true, fontC: false,
    supportsAlignment: true, supportsTextSize: true, supportsBold: true,
    supportsUnderline: true, supportsReverse: false, supportsBarcodeB: true,
    supportsQrCode: true, supportsPdf417: false, supportsGraphics: true,
    supportsCut: false, supportsPartialCut: false, supportsCashDrawer: false,
    starCommands: true, notes: 'Star mobile Bluetooth printer. No cutter or drawer.',
  },
  // ── BIXOLON ──
  {
    id: 'SRP-350III', vendor: 'BIXOLON', name: 'SRP-350III',
    columns: 42, paperWidthMm: 80, printWidthDots: 576,
    fontA: true, fontB: true, fontC: false,
    supportsAlignment: true, supportsTextSize: true, supportsBold: true,
    supportsUnderline: true, supportsReverse: true, supportsBarcodeB: true,
    supportsQrCode: true, supportsPdf417: true, supportsGraphics: true,
    supportsCut: true, supportsPartialCut: true, supportsCashDrawer: true,
    starCommands: false, notes: 'BIXOLON thermal. Epson-compatible command set.',
  },
  {
    id: 'SPP-R310', vendor: 'BIXOLON', name: 'SPP-R310 (Mobile)',
    columns: 42, paperWidthMm: 80, printWidthDots: 576,
    fontA: true, fontB: true, fontC: false,
    supportsAlignment: true, supportsTextSize: true, supportsBold: true,
    supportsUnderline: true, supportsReverse: true, supportsBarcodeB: true,
    supportsQrCode: true, supportsPdf417: false, supportsGraphics: true,
    supportsCut: false, supportsPartialCut: false, supportsCashDrawer: false,
    starCommands: false, notes: 'BIXOLON mobile Bluetooth printer.',
  },
  // ── Citizen ──
  {
    id: 'CT-E651', vendor: 'Citizen', name: 'CT-E651',
    columns: 42, paperWidthMm: 80, printWidthDots: 576,
    fontA: true, fontB: true, fontC: false,
    supportsAlignment: true, supportsTextSize: true, supportsBold: true,
    supportsUnderline: true, supportsReverse: true, supportsBarcodeB: true,
    supportsQrCode: true, supportsPdf417: true, supportsGraphics: true,
    supportsCut: true, supportsPartialCut: true, supportsCashDrawer: true,
    starCommands: false, notes: 'Citizen thermal receipt printer. Epson ESC/POS compatible.',
  },
  // ── Budget/Chinese ──
  {
    id: 'POS-5890K', vendor: 'Zjiang', name: 'POS-5890K / POS-5890',
    columns: 32, paperWidthMm: 58, printWidthDots: 384,
    fontA: true, fontB: false, fontC: false,
    supportsAlignment: true, supportsTextSize: true, supportsBold: true,
    supportsUnderline: true, supportsReverse: false, supportsBarcodeB: false,
    supportsQrCode: false, supportsPdf417: false, supportsGraphics: false,
    supportsCut: true, supportsPartialCut: false, supportsCashDrawer: false,
    starCommands: false, notes: 'Budget 58mm thermal. Very limited features.',
  },
  {
    id: 'NT-5890K', vendor: 'Netum', name: 'NT-5890K',
    columns: 32, paperWidthMm: 58, printWidthDots: 384,
    fontA: true, fontB: false, fontC: false,
    supportsAlignment: true, supportsTextSize: true, supportsBold: true,
    supportsUnderline: true, supportsReverse: false, supportsBarcodeB: false,
    supportsQrCode: false, supportsPdf417: false, supportsGraphics: false,
    supportsCut: true, supportsPartialCut: false, supportsCashDrawer: false,
    starCommands: false, notes: 'Budget 58mm Netum thermal printer.',
  },
  {
    id: 'XP-58IIH', vendor: 'Xprinter', name: 'XP-58IIH',
    columns: 32, paperWidthMm: 58, printWidthDots: 384,
    fontA: true, fontB: false, fontC: false,
    supportsAlignment: true, supportsTextSize: true, supportsBold: true,
    supportsUnderline: true, supportsReverse: false, supportsBarcodeB: true,
    supportsQrCode: false, supportsPdf417: false, supportsGraphics: false,
    supportsCut: true, supportsPartialCut: false, supportsCashDrawer: false,
    starCommands: false, notes: 'Budget 58mm Xprinter thermal.',
  },
  {
    id: 'CX58D', vendor: 'Generic', name: 'CX58D Thermal',
    columns: 32, paperWidthMm: 58, printWidthDots: 384,
    fontA: true, fontB: false, fontC: false,
    supportsAlignment: true, supportsTextSize: true, supportsBold: true,
    supportsUnderline: false, supportsReverse: false, supportsBarcodeB: false,
    supportsQrCode: false, supportsPdf417: false, supportsGraphics: false,
    supportsCut: false, supportsPartialCut: false, supportsCashDrawer: false,
    starCommands: false, notes: 'Very basic 58mm thermal. Minimal ESC/POS support.',
  },
  // ── Rongta ──
  {
    id: 'RP326', vendor: 'Rongta', name: 'RP326',
    columns: 42, paperWidthMm: 80, printWidthDots: 576,
    fontA: true, fontB: true, fontC: false,
    supportsAlignment: true, supportsTextSize: true, supportsBold: true,
    supportsUnderline: true, supportsReverse: true, supportsBarcodeB: true,
    supportsQrCode: true, supportsPdf417: false, supportsGraphics: true,
    supportsCut: true, supportsPartialCut: true, supportsCashDrawer: true,
    starCommands: false, notes: 'Rongta 80mm thermal. Epson-compatible.',
  },
  // ── Sunmi ──
  {
    id: 'Sunmi-V2', vendor: 'Sunmi', name: 'Sunmi V2 (Built-in)',
    columns: 32, paperWidthMm: 58, printWidthDots: 384,
    fontA: true, fontB: false, fontC: false,
    supportsAlignment: true, supportsTextSize: true, supportsBold: true,
    supportsUnderline: true, supportsReverse: false, supportsBarcodeB: true,
    supportsQrCode: true, supportsPdf417: false, supportsGraphics: true,
    supportsCut: false, supportsPartialCut: false, supportsCashDrawer: false,
    starCommands: false, notes: 'Sunmi POS terminal built-in printer. 58mm, no cutter.',
  },
  // ── PBM ──
  {
    id: 'P822D', vendor: 'PBM', name: 'P822D',
    columns: 42, paperWidthMm: 80, printWidthDots: 576,
    fontA: true, fontB: true, fontC: false,
    supportsAlignment: true, supportsTextSize: true, supportsBold: true,
    supportsUnderline: true, supportsReverse: false, supportsBarcodeB: true,
    supportsQrCode: false, supportsPdf417: false, supportsGraphics: true,
    supportsCut: true, supportsPartialCut: true, supportsCashDrawer: true,
    starCommands: false, notes: 'PBM 80mm thermal. Partial ESC/POS.',
  },
];

/** Lookup a profile by ID, falling back to 'simple' (58mm) or 'default' (80mm) */
export function getProfileById(id: string): PrinterProfile {
  return PRINTER_PROFILES.find(p => p.id === id) ||
    PRINTER_PROFILES.find(p => p.id === 'default')!;
}

/** Get the profile that best matches a paper width */
export function getProfileByPaperWidth(mm: number): PrinterProfile {
  if (mm <= 58) return getProfileById('simple');
  return getProfileById('default');
}

// ─── Receipt Formatting Options ─────────────────────────────────────────────
export type TextAlign = 'left' | 'center' | 'right';
export type CutMode = 'full' | 'partial' | 'none';

export interface ReceiptFormatting {
  /** Alignment for business name: left, center, right. Default: center */
  nameAlign?: TextAlign;
  /** Text width multiplier for business name (1-8). Default: 2 */
  nameWidth?: number;
  /** Text height multiplier for business name (1-8). Default: 2 */
  nameHeight?: number;
  /** Bold business name. Default: true */
  nameBold?: boolean;
  /** Alignment for header lines. Default: center */
  headerAlign?: TextAlign;
  /** Alignment for footer lines. Default: center */
  footerAlign?: TextAlign;
  /** Bold the TOTAL line. Default: true */
  totalBold?: boolean;
  /** Text height for TOTAL line (1-4). Default: 2 */
  totalHeight?: number;
  /** Bold table number. Default: true */
  tableBold?: boolean;
  /** Table number text height (1-4). Default: 2 */
  tableHeight?: number;
  /** Alignment for items. Default: left */
  itemsAlign?: TextAlign;
  /** Use underline for section headers (e.g. "Note:"). Default: false */
  sectionUnderline?: boolean;
  /** Cut mode after receipt. Default: full */
  cutMode?: CutMode;
  /** Lines to feed before cut. Default: 3 */
  feedBeforeCut?: number;
  /** Use real ESC/POS alignment commands (true) or space-padding (false). Default: true */
  useEscPosAlignment?: boolean;
  /** Font to use: 'A' (normal) or 'B' (condensed, more chars per line). Default: A */
  font?: 'A' | 'B';
  /** Separator character for full-width lines. Default: '=' */
  separatorChar?: string;
  /** Sub-separator character. Default: '-' */
  subSeparatorChar?: string;
  /** Show order source label (counter/qr/online/tableside). Default: false */
  showOrderSource?: boolean;
  /** Print QR code with order URL or ID at bottom. Default: false */
  printQrCode?: boolean;
  /** QR code content (URL or text). Only used if printQrCode is true */
  qrCodeContent?: string;
  /** QR code size (1-16). Default: 4 */
  qrCodeSize?: number;
  /** Print barcode with order ID. Default: false */
  printBarcode?: boolean;
  /** Barcode type. Default: CODE128 */
  barcodeType?: 'CODE39' | 'CODE128' | 'EAN13' | 'UPC-A';
}

export interface ReceiptPrintOptions {
  businessName?: string;
  showDateTime?: boolean;
  showOrderId?: boolean;
  showTableNumber?: boolean;
  showItems?: boolean;
  showRemark?: boolean;
  showTotal?: boolean;
  headerLine1?: string;
  headerLine2?: string;
  footerLine1?: string;
  footerLine2?: string;
  drawerCommands?: string;
  autoOpenDrawer?: boolean;
  /** Printer profile ID for capability-aware printing */
  printerProfileId?: string;
  /** Receipt formatting options (alignment, sizes, bold, etc.) */
  formatting?: ReceiptFormatting;
}

/** Default formatting if none specified */
const DEFAULT_FORMATTING: Required<ReceiptFormatting> = {
  nameAlign: 'center',
  nameWidth: 2,
  nameHeight: 2,
  nameBold: true,
  headerAlign: 'center',
  footerAlign: 'center',
  totalBold: true,
  totalHeight: 2,
  tableBold: true,
  tableHeight: 2,
  itemsAlign: 'left',
  sectionUnderline: false,
  cutMode: 'full',
  feedBeforeCut: 3,
  useEscPosAlignment: true,
  font: 'A',
  separatorChar: '=',
  subSeparatorChar: '-',
  showOrderSource: false,
  printQrCode: false,
  qrCodeContent: '',
  qrCodeSize: 4,
  printBarcode: false,
  barcodeType: 'CODE128',
};

interface PrintJob {
  id: string;
  order: any;
  restaurant: any;
  options?: ReceiptPrintOptions;
  resolve: (value: boolean) => void;
  reject: (reason?: any) => void;
  timestamp: number;
}

class PrinterService {
  private charsPerLine: number = 32;
  private readonly bleChunkSize: number = 180;
  private activeProfile: PrinterProfile = getProfileById('simple');
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private service: BluetoothRemoteGATTService | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private encoder: EscPosEncoder;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 3;
  private isPrinting: boolean = false;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private lastPrintTime: number = 0;
  private connectionPromise: Promise<boolean> | null = null;
  private disconnectRequested: boolean = false;

  // Last receipt for reprint
  private lastPrintedOrder: any = null;
  private lastPrintedRestaurant: any = null;
  private lastPrintedOptions: ReceiptPrintOptions | undefined = undefined;

  // Print queue system
  private printQueue: PrintJob[] = [];
  private isProcessingQueue: boolean = false;
  private maxQueueSize: number = 50; // Prevent memory issues

  constructor() {
    this.encoder = new EscPosEncoder();
  }

  // ─── Profile Management ──────────────────────────────────────────────────
  /**
   * Set the active printer profile. Call this after the user selects a printer model
   * so the receipt formatter knows what features are available.
   */
  setProfile(profileId: string): void {
    this.activeProfile = getProfileById(profileId);
    this.charsPerLine = this.activeProfile.columns;
  }

  /** Set columns directly (for custom paper widths) */
  setColumns(cols: number): void {
    this.charsPerLine = cols;
  }

  getProfile(): PrinterProfile {
    return this.activeProfile;
  }

  getColumns(): number {
    return this.charsPerLine;
  }

  /**
   * Sanitize text to remove special characters that might crash the printer
   */
  private sanitizeText(text: any): string {
    if (text === null || text === undefined) return '';
    
    // Convert to string if it's not already
    const str = String(text);
    
    // Remove emojis and special characters, keep only basic ASCII and common symbols
    return str
      .replace(/[^\x20-\x7E\n\r\t\s]/g, '') // Remove non-ASCII
      .replace(/[™®©]/g, '') // Remove trademark symbols
      .replace(/[^\w\s\-.,!?$%&*()@#\/\\:]/g, '') // Allow only basic punctuation
      .trim();
  }

  /**
   * Safely format a number to 2 decimal places
   */
  private formatPrice(price: any): string {
    if (price === null || price === undefined) return '0.00';
    const num = Number(price);
    return isNaN(num) ? '0.00' : num.toFixed(2);
  }

  private formatDate(date: Date): string {
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private truncateText(text: string, width: number): string {
    const safe = this.sanitizeText(text || '');
    if (!safe) return '';
    return safe.length > width ? safe.slice(0, width) : safe;
  }

  /**
   * Manually center text by padding with spaces on the left.
   * More reliable than ESC/POS align('center') which some printers handle incorrectly.
   */
  private centerText(text: string, lineWidth: number): string {
    if (text.length >= lineWidth) return text;
    const leftPad = Math.floor((lineWidth - text.length) / 2);
    return ' '.repeat(leftPad) + text;
  }

  private async writeDataInChunks(data: Uint8Array): Promise<void> {
    if (!this.characteristic) {
      throw new Error('No writable characteristic found');
    }

    for (let index = 0; index < data.length; index += this.bleChunkSize) {
      const chunk = data.slice(index, index + this.bleChunkSize);
      await this.characteristic.writeValue(chunk as BufferSource);
      await new Promise(resolve => setTimeout(resolve, 15));
    }
  }

  private stripLeadingInitialize(data: Uint8Array): Uint8Array {
    if (data.length >= 2 && data[0] === 0x1B && data[1] === 0x40) {
      return data.slice(2);
    }
    return data;
  }

  private async writePreparedPayload(data: Uint8Array): Promise<void> {
    const payload = this.stripLeadingInitialize(data);
    await this.resetPrinterFormattingState();
    await this.writeDataInChunks(payload);
  }

  private async resetPrinterFormattingState(): Promise<void> {
    if (!this.characteristic) {
      throw new Error('No writable characteristic found');
    }

    const reset = new Uint8Array([0x1B, 0x40]); // ESC @ - reset printer
    const alignLeft = new Uint8Array([0x1B, 0x61, 0x00]); // ESC a 0 - align left

    const combinedBuffer = new Uint8Array(reset.length + alignLeft.length);
    combinedBuffer.set(reset, 0);
    combinedBuffer.set(alignLeft, reset.length);

    await this.characteristic.writeValue(combinedBuffer);
    await new Promise(resolve => setTimeout(resolve, 30));
  }

  async scanForPrinters(): Promise<PrinterDevice[]> {
    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', '00001800-0000-1000-8000-00805f9b34fb']
      });

      return [{
        id: device.id,
        name: device.name || 'Unknown Printer'
      }];
    } catch (error) {
      console.error('Scan error:', error);
      return [];
    }
  }

  async connect(deviceName: string): Promise<boolean> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this._connect(deviceName);
    const result = await this.connectionPromise;
    this.connectionPromise = null;
    return result;
  }

  private async _connect(deviceName: string): Promise<boolean> {
    try {
      await this.disconnect();
      this.disconnectRequested = false;

      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ name: deviceName }],
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', '00001800-0000-1000-8000-00805f9b34fb']
      });

      this.device.addEventListener('gattserverdisconnected', () => {
        console.log('Printer disconnected');
        if (!this.disconnectRequested) {
          this.server = null;
          this.service = null;
          this.characteristic = null;
        }
      });

      const server = await this.device.gatt?.connect();
      if (!server) {
        throw new Error('Failed to connect to GATT server');
      }
      this.server = server;

      try {
        this.service = await this.server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
      } catch (e) {
        try {
          this.service = await this.server.getPrimaryService('00001800-0000-1000-8000-00805f9b34fb');
        } catch (e2) {
          throw new Error('Could not find printer service');
        }
      }
      
      const characteristics = await this.service.getCharacteristics();
      
      for (const char of characteristics) {
        if (char.properties.writeWithoutResponse) {
          this.characteristic = char;
          break;
        } else if (char.properties.write) {
          this.characteristic = char;
        }
      }

      if (!this.characteristic) {
        throw new Error('No writable characteristic found');
      }

      this.startKeepAlive();
      this.reconnectAttempts = 0;
      return true;

    } catch (error) {
      console.error('Connection error:', error);
      await this.cleanup();
      return false;
    }
  }

  private startKeepAlive() {
    this.stopKeepAlive();
    
    this.keepAliveInterval = setInterval(async () => {
      if (this.isConnected() && this.characteristic && !this.isPrinting && !this.isProcessingQueue) {
        try {
          // Send null byte - won't cause paper movement
          const keepAliveData = new Uint8Array([0x00]);
          await this.characteristic.writeValue(keepAliveData);
        } catch (error) {
          // Ignore
        }
      }
    }, 30000);
  }

  private stopKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  private async cleanup() {
    this.stopKeepAlive();
    this.server = null;
    this.service = null;
    this.characteristic = null;
  }

  async ensureConnection(): Promise<boolean> {
    if (this.isConnected() && this.characteristic) {
      return true;
    }

    if (this.device && !this.disconnectRequested) {
      console.log('Attempting to reconnect printer...');
      try {
        const server = await this.device.gatt?.connect();
        if (server) {
          this.server = server;
          
          try {
            this.service = await this.server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
          } catch (e) {
            this.service = await this.server.getPrimaryService('00001800-0000-1000-8000-00805f9b34fb');
          }
          
          if (!this.service) {
            throw new Error('Could not find printer service');
          }

          const characteristics = await this.service.getCharacteristics();
          for (const char of characteristics) {
            if (char.properties.writeWithoutResponse || char.properties.write) {
              this.characteristic = char;
              break;
            }
          }

          if (!this.characteristic) {
            throw new Error('No writable characteristic found');
          }

          this.startKeepAlive();
          console.log('Printer reconnected successfully');
          return true;
        }
      } catch (error) {
        console.error('Reconnection failed:', error);
        return false;
      }
    }
    
    return false;
  }

  /**
   * Auto-reconnect to a previously paired printer by name, without showing the browser picker.
   * Uses navigator.bluetooth.getDevices() to find already-paired devices silently.
   * Returns true if reconnection succeeds, false otherwise.
   */
  async autoReconnect(deviceName: string): Promise<boolean> {
    if (this.isConnected()) return true;

    try {
      // getDevices() returns previously granted devices without a user gesture
      const bluetooth = (navigator as any).bluetooth;
      if (!bluetooth || typeof bluetooth.getDevices !== 'function') {
        console.log('getDevices() not supported, silent reconnect unavailable');
        return false;
      }

      const devices: BluetoothDevice[] = await bluetooth.getDevices();
      const target = devices.find((d: BluetoothDevice) => d.name === deviceName);

      if (!target) {
        console.log('Previously paired device not found:', deviceName);
        return false;
      }

      // Need to watch for advertisements to reconnect
      if (typeof (target as any).watchAdvertisements === 'function') {
        const abortController = new AbortController();

        const connectToDevice = async (): Promise<boolean> => {
          try {
            this.device = target;
            this.disconnectRequested = false;

            this.device.addEventListener('gattserverdisconnected', () => {
              console.log('Printer disconnected');
              if (!this.disconnectRequested) {
                this.server = null;
                this.service = null;
                this.characteristic = null;
              }
            });

            const server = await this.device.gatt?.connect();
            if (!server) {
              throw new Error('Failed to connect to GATT server');
            }
            this.server = server;

            try {
              this.service = await this.server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
            } catch (e) {
              try {
                this.service = await this.server.getPrimaryService('00001800-0000-1000-8000-00805f9b34fb');
              } catch (e2) {
                throw new Error('Could not find printer service');
              }
            }

            const characteristics = await this.service.getCharacteristics();
            for (const char of characteristics) {
              if (char.properties.writeWithoutResponse) {
                this.characteristic = char;
                break;
              } else if (char.properties.write) {
                this.characteristic = char;
              }
            }

            if (!this.characteristic) {
              throw new Error('No writable characteristic found');
            }

            this.startKeepAlive();
            this.reconnectAttempts = 0;
            console.log('Auto-reconnected to printer:', deviceName);
            return true;
          } catch (error) {
            console.error('Auto-reconnect GATT error:', error);
            await this.cleanup();
            this.device = null;
            return false;
          }
        };

        // Try direct GATT connect first (works if device is in range and already bonded)
        const directResult = await connectToDevice();
        if (directResult) {
          abortController.abort();
          return true;
        }

        // If direct connect fails, watch for advertisements briefly
        return new Promise<boolean>((resolve) => {
          const timeout = setTimeout(() => {
            abortController.abort();
            resolve(false);
          }, 5000);

          target.addEventListener('advertisementreceived', async () => {
            clearTimeout(timeout);
            abortController.abort();
            const result = await connectToDevice();
            resolve(result);
          }, { once: true });

          (target as any).watchAdvertisements({ signal: abortController.signal }).catch(() => {
            clearTimeout(timeout);
            resolve(false);
          });
        });
      }

      // Fallback: try direct GATT connect without watchAdvertisements
      this.device = target;
      this.disconnectRequested = false;

      this.device.addEventListener('gattserverdisconnected', () => {
        console.log('Printer disconnected');
        if (!this.disconnectRequested) {
          this.server = null;
          this.service = null;
          this.characteristic = null;
        }
      });

      const server = await this.device.gatt?.connect();
      if (!server) {
        this.device = null;
        return false;
      }
      this.server = server;

      try {
        this.service = await this.server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
      } catch (e) {
        try {
          this.service = await this.server.getPrimaryService('00001800-0000-1000-8000-00805f9b34fb');
        } catch (e2) {
          await this.cleanup();
          this.device = null;
          return false;
        }
      }

      const characteristics = await this.service.getCharacteristics();
      for (const char of characteristics) {
        if (char.properties.writeWithoutResponse) {
          this.characteristic = char;
          break;
        } else if (char.properties.write) {
          this.characteristic = char;
        }
      }

      if (!this.characteristic) {
        await this.cleanup();
        this.device = null;
        return false;
      }

      this.startKeepAlive();
      this.reconnectAttempts = 0;
      console.log('Auto-reconnected to printer (direct):', deviceName);
      return true;
    } catch (error) {
      console.error('Auto-reconnect error:', error);
      await this.cleanup();
      this.device = null;
      return false;
    }
  }

  isConnected(): boolean {
    return this.server?.connected || false;
  }

  async disconnect() {
    this.disconnectRequested = true;
    this.stopKeepAlive();
    
    // Clear queue on disconnect
    this.clearQueue();
    
    if (this.device) {
      this.device.removeEventListener('gattserverdisconnected', () => {});
    }
    
    try {
      if (this.server?.connected) {
        await this.server.disconnect();
      }
    } catch (e) {
      // Ignore
    }
    
    await this.cleanup();
    this.device = null;
  }

  /**
   * Clear all pending print jobs
   */
  clearQueue(): void {
    // Reject all pending jobs
    this.printQueue.forEach(job => {
      job.reject(new Error('Printer disconnected - queue cleared'));
    });
    this.printQueue = [];
  }

  /**
   * Get current queue size
   */
  getQueueSize(): number {
    return this.printQueue.length;
  }

  /**
   * Check if printer is busy
   */
  isBusy(): boolean {
    return this.isPrinting || this.isProcessingQueue || this.printQueue.length > 0;
  }

  /**
   * Process the next job in the queue
   */
  private async processNextJob(): Promise<void> {
    if (this.isProcessingQueue) return;
    if (this.printQueue.length === 0) return;

    this.isProcessingQueue = true;

    while (this.printQueue.length > 0) {
      const job = this.printQueue[0]; // Peek at first job

      try {
        // Ensure we're still connected
        if (!await this.ensureConnection()) {
          throw new Error('Printer disconnected - cannot send print command');
        }

        if (!this.characteristic) {
          throw new Error('Lost connection to printer device');
        }

        console.log(`Processing print job ${job.id} (${this.printQueue.length} remaining)`);

        // Process the print job
        const success = await this.executePrint(job.order, job.restaurant, job.options);
        
        if (success) {
          // If auto open drawer is enabled, open the drawer after printing
          if (job.options?.autoOpenDrawer) {
            console.log('Auto-opening drawer...');
            await this.openDrawer(job.options?.drawerCommands);
          }
          job.resolve(true);
        } else {
          job.reject(new Error('Printer did not respond - check if device is powered on'));
        }

        // Remove the processed job
        this.printQueue.shift();

        // Wait between jobs to let printer recover
        if (this.printQueue.length > 0) {
          console.log('Waiting before next print job...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

      } catch (error) {
        console.error(`Print job ${job.id} failed:`, error);
        job.reject(error);
        this.printQueue.shift(); // Remove failed job
        
        // Wait a bit longer after failure
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    this.isProcessingQueue = false;
    console.log('Print queue empty');
  }

  /**
   * Execute the actual print (extracted from printReceipt)
   */
  private async executePrint(order: any, restaurant: any, options?: ReceiptPrintOptions): Promise<boolean> {
    try {
      const orderDate = new Date(order.timestamp);
      const dateStr = this.formatDate(orderDate);
      const timeStr = this.formatTime(orderDate);

      // Resolve printer profile
      const profile = options?.printerProfileId
        ? getProfileById(options.printerProfileId)
        : this.activeProfile;
      const cols = profile.columns;

      // Merge formatting with defaults
      const fmt: Required<ReceiptFormatting> = { ...DEFAULT_FORMATTING, ...(options?.formatting || {}) };

      // Clamp size values
      const nameW = Math.max(1, Math.min(8, fmt.nameWidth));
      const nameH = Math.max(1, Math.min(8, fmt.nameHeight));
      const totalH = Math.max(1, Math.min(4, fmt.totalHeight));
      const tableH = Math.max(1, Math.min(4, fmt.tableHeight));

      // Scaled columns for enlarged text
      const nameScaledCols = Math.floor(cols / nameW);
      const totalScaledCols = Math.floor(cols / 1); // width stays 1 for total

      // SANITIZE ALL TEXT INPUTS
      const safeRestaurantName = this.sanitizeText(restaurant?.name) || 'RESTAURANT';
      const safeOrderId = this.sanitizeText(order.id) || 'ORDER';
      const safeTableNumber = this.sanitizeText(order.tableNumber) || '0';
      const safeRemark = this.sanitizeText(order.remark);
      const safeHeaderLine1 = this.sanitizeText(options?.headerLine1 || '');
      const safeHeaderLine2 = this.sanitizeText(options?.headerLine2 || '');
      const safeFooterLine1 = this.sanitizeText(options?.footerLine1 || 'Thank you!');
      const safeFooterLine2 = this.sanitizeText(options?.footerLine2 || 'Please come again');

      const showDateTime = options?.showDateTime !== false;
      const showOrderId = options?.showOrderId !== false;
      const showTableNumber = options?.showTableNumber !== false;
      const showItems = options?.showItems !== false;
      const showRemark = options?.showRemark !== false;
      const showTotal = options?.showTotal !== false;

      // Helper: apply alignment via real ESC/POS or space-padding fallback
      const useReal = fmt.useEscPosAlignment && profile.supportsAlignment;
      const applyAlign = (enc: any, align: TextAlign) => {
        if (useReal) return enc.align(align);
        return enc.align('left'); // fallback: we pad manually
      };
      const padText = (text: string, align: TextAlign, lineWidth: number): string => {
        if (useReal) return this.truncateText(text, lineWidth);
        const safe = this.truncateText(text, lineWidth);
        if (align === 'center') return this.centerText(safe, lineWidth);
        if (align === 'right') {
          const pad = Math.max(0, lineWidth - safe.length);
          return ' '.repeat(pad) + safe;
        }
        return safe;
      };

      // === BUILD RECEIPT ===
      let receipt = this.encoder.initialize();

      // Font selection
      if (fmt.font === 'B' && profile.fontB) {
        receipt = receipt.font('B');
      }

      // ── Business Name ──
      receipt = applyAlign(receipt, fmt.nameAlign);
      if (fmt.nameBold && profile.supportsBold) receipt = receipt.bold(true);
      if (profile.supportsTextSize) {
        receipt = receipt.size(nameW, nameH);
      }
      receipt = receipt.line(padText(safeRestaurantName, fmt.nameAlign, nameScaledCols));
      // Reset
      if (profile.supportsTextSize) receipt = receipt.size(1, 1);
      if (fmt.nameBold && profile.supportsBold) receipt = receipt.bold(false);

      // ── Header lines ──
      if (safeHeaderLine1 || safeHeaderLine2) {
        receipt = applyAlign(receipt, fmt.headerAlign);
        if (safeHeaderLine1) {
          receipt = receipt.line(padText(safeHeaderLine1, fmt.headerAlign, cols));
        }
        if (safeHeaderLine2) {
          receipt = receipt.line(padText(safeHeaderLine2, fmt.headerAlign, cols));
        }
      }

      // ── Separator ──
      receipt = applyAlign(receipt, 'left');
      receipt = receipt.line(fmt.separatorChar.repeat(cols));

      // ── Date / Time ──
      if (showDateTime) {
        receipt = receipt.line(`${dateStr} ${timeStr}`);
      }

      // ── Order ID ──
      if (showOrderId) {
        receipt = receipt.line(`#${safeOrderId}`);
      }

      // ── Order Source ──
      if (fmt.showOrderSource && order.orderSource) {
        const sourceLabel = order.orderSource === 'counter' ? 'Counter'
          : order.orderSource === 'qr_order' ? 'QR Order'
          : order.orderSource === 'online' ? 'Online'
          : order.orderSource === 'tableside' ? 'Tableside'
          : order.orderSource;
        receipt = receipt.line(`Source: ${sourceLabel}`);
      }

      // ── Table Number ──
      if (showTableNumber && order.tableNumber) {
        receipt = receipt.line('');
        if (fmt.tableBold && profile.supportsBold) receipt = receipt.bold(true);
        if (profile.supportsTextSize) receipt = receipt.size(1, tableH);
        receipt = receipt.line(safeTableNumber);
        if (profile.supportsTextSize) receipt = receipt.size(1, 1);
        if (fmt.tableBold && profile.supportsBold) receipt = receipt.bold(false);
      }

      // ── Sub-separator ──
      receipt = receipt.line(fmt.subSeparatorChar.repeat(cols));

      // ── Items ──
      receipt = applyAlign(receipt, fmt.itemsAlign);
      if (showItems && order.items && Array.isArray(order.items) && order.items.length > 0) {
        order.items.forEach((item: any) => {
          const safeItemName = this.sanitizeText(item.name) || 'ITEM';
          const quantity = item.quantity || 1;
          const itemPrice = this.formatPrice(item.price ? item.price * quantity : 0);

          // quantity x name  RM price
          const leftPart = `${quantity}x ${safeItemName}`;
          const rightPart = `RM${itemPrice}`;
          const spaceBetween = Math.max(1, cols - leftPart.length - rightPart.length);
          receipt = receipt.line(leftPart + ' '.repeat(spaceBetween) + rightPart);

          // Variants with labels
          if (item.selectedSize) {
            const safeSize = this.sanitizeText(item.selectedSize);
            if (safeSize) receipt = receipt.line(`-Size : ${safeSize}`);
          }
          if (item.selectedTemp) {
            const safeTemp = this.sanitizeText(item.selectedTemp);
            if (safeTemp) receipt = receipt.line(`-Temperature : ${safeTemp}`);
          }
          if (item.selectedOtherVariant) {
            const safeVariant = this.sanitizeText(item.selectedOtherVariant);
            const variantLabel = this.sanitizeText(item.otherVariantName) || 'Variant';
            if (safeVariant) receipt = receipt.line(`-${variantLabel} : ${safeVariant}`);
          }
          if (item.selectedVariantOption) {
            const safeVariantOpt = this.sanitizeText(item.selectedVariantOption);
            if (safeVariantOpt) receipt = receipt.line(`-Variant : ${safeVariantOpt}`);
          }

          // Add-ons with dash prefix
          if (item.selectedAddOns && Array.isArray(item.selectedAddOns) && item.selectedAddOns.length > 0) {
            item.selectedAddOns.forEach((addon: any) => {
              const safeAddonName = this.sanitizeText(addon.name) || 'ADDON';
              const addonQty = addon.quantity || 1;
              if (addonQty > 1) {
                receipt = receipt.line(`-${safeAddonName} x${addonQty}`);
              } else {
                receipt = receipt.line(`-${safeAddonName}`);
              }
            });
          }

          receipt = receipt.line('');
        });
      } else {
        receipt = receipt.line(showItems ? 'No items' : 'Items hidden').line('');
      }

      // ── Remark ──
      if (showRemark && safeRemark) {
        receipt = receipt.line(fmt.subSeparatorChar.repeat(cols));
        if (fmt.sectionUnderline && profile.supportsUnderline) {
          receipt = receipt.underline(true).line('Note:').underline(false);
        } else {
          receipt = receipt.line('Note:');
        }
        receipt = receipt.line(safeRemark).line('');
      }

      // ── Sub-separator ──
      receipt = receipt.line(fmt.subSeparatorChar.repeat(cols));

      // ── Total ──
      if (showTotal) {
        const safeTotal = this.formatPrice(order.total);
        if (fmt.totalBold && profile.supportsBold) receipt = receipt.bold(true);
        if (profile.supportsTextSize && totalH > 1) receipt = receipt.size(1, totalH);
        receipt = receipt.line(`TOTAL: RM ${safeTotal}`);
        if (profile.supportsTextSize && totalH > 1) receipt = receipt.size(1, 1);
        if (fmt.totalBold && profile.supportsBold) receipt = receipt.bold(false);
      }

      // ── Separator ──
      receipt = receipt.line(fmt.separatorChar.repeat(cols));

      // ── Footer lines ──
      if (safeFooterLine1 || safeFooterLine2) {
        receipt = applyAlign(receipt, fmt.footerAlign);
        if (safeFooterLine1) {
          receipt = receipt.line(padText(safeFooterLine1, fmt.footerAlign, cols));
        }
        if (safeFooterLine2) {
          receipt = receipt.line(padText(safeFooterLine2, fmt.footerAlign, cols));
        }
      }

      // ── QR Code ──
      if (fmt.printQrCode && profile.supportsQrCode) {
        const qrContent = fmt.qrCodeContent || `#${safeOrderId}`;
        receipt = applyAlign(receipt, 'center');
        receipt = receipt.newline();
        receipt = receipt.qrcode(qrContent, 1, fmt.qrCodeSize, 'l');
        receipt = receipt.newline();
      }

      // ── Barcode ──
      if (fmt.printBarcode && profile.supportsBarcodeB) {
        receipt = applyAlign(receipt, 'center');
        receipt = receipt.newline();
        receipt = receipt.barcode(safeOrderId, fmt.barcodeType || 'code128', 60);
        receipt = receipt.newline();
      }

      // ── Feed & Cut ──
      receipt = receipt.align('left');
      receipt = receipt.newline().newline();
      if (profile.supportsCut && fmt.cutMode !== 'none') {
        if (fmt.cutMode === 'partial' && profile.supportsPartialCut) {
          receipt = receipt.cut('partial');
        } else {
          receipt = receipt.cut();
        }
      }

      const data = receipt.encode() as Uint8Array;

      await this.writePreparedPayload(data);

      // Wait for printer to completely finish processing
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Store for reprint
      this.lastPrintedOrder = { ...order };
      this.lastPrintedRestaurant = { ...restaurant };
      this.lastPrintedOptions = options ? { ...options } : undefined;

      this.lastPrintTime = Date.now();
      console.log('Print successful');
      return true;

    } catch (error) {
      console.error('Execute print error:', error);

      // Try to reset printer even after error
      try {
        if (this.characteristic) {
          await this.resetPrinterFormattingState();
        }
      } catch (resetError) {
        // Ignore reset errors
      }

      return false;
    }
  }

  async printTestPage(options?: ReceiptPrintOptions): Promise<boolean> {
    if (this.isPrinting) {
      // Queue test pages too? Usually no, but we can
      return new Promise((resolve, reject) => {
        const testOrder = {
          id: 'TEST',
          tableNumber: 'TEST',
          timestamp: Date.now(),
          total: 0,
          items: [],
          remark: ''
        };
        
        const testRestaurant = { name: 'QUICKSERVE' };
        
        this.printQueue.push({
          id: `test-${Date.now()}`,
          order: testOrder,
          restaurant: testRestaurant,
          resolve,
          reject,
          timestamp: Date.now()
        });
        
        // Start processing if not already
        this.processNextJob();
      });
    }

    this.isPrinting = true;
    
    try {
      if (!await this.ensureConnection()) {
        throw new Error('Printer not connected');
      }

      if (!this.characteristic) {
        throw new Error('No writable characteristic found');
      }

      const now = new Date();
      const testBusinessName = this.sanitizeText(options?.businessName || 'QUICKSERVE') || 'QUICKSERVE';

      // Build test page with manual centering (no ESC/POS align center)
      const truncatedName = this.truncateText(testBusinessName, 16);
      const data = this.encoder
        .initialize()
        .align('left')
        .size(2, 2)
        .line(this.centerText(truncatedName, 16))
        .size(1, 1)
        .line('')
        .line('='.repeat(32))
        .line(this.centerText('TEST PAGE', 32))
        .line('')
        .line(this.formatDate(now) + ' ' + this.formatTime(now))
        .line('')
        .line('Printer is working!')
        .line('='.repeat(32))
        .cut()
        .encode() as Uint8Array;

      await this.writePreparedPayload(data);
      
      // Wait for printer to finish
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      this.lastPrintTime = Date.now();
      return true;
      
    } catch (error) {
      console.error('Print test page error:', error);
      return false;
    } finally {
      this.isPrinting = false;
    }
  }

  async printReceipt(order: any, restaurant: any, options?: ReceiptPrintOptions): Promise<boolean> {
    // Check queue size to prevent memory issues
    if (this.printQueue.length >= this.maxQueueSize) {
      console.error('Print queue full');
      throw new Error('Print queue is full - too many print jobs pending');
    }

    // Create a promise that will be resolved when the job completes
    return new Promise((resolve, reject) => {
      const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Add to queue
      this.printQueue.push({
        id: jobId,
        order: { ...order }, // Create a shallow copy to prevent mutations
        restaurant: { ...restaurant },
        options,
        resolve,
        reject,
        timestamp: Date.now()
      });

      console.log(`Print job ${jobId} queued. Queue size: ${this.printQueue.length}`);

      // Start processing the queue if not already
      this.processNextJob();
    });
  }

  /**
   * Dev test print - allows custom text and dotted lines
   */
  async printDevTest(dottedLineCount: number, testText: string): Promise<boolean> {
    if (!this.isConnected() || !this.characteristic) {
      throw new Error('Printer not connected');
    }

    try {
      const data = this.encoder
        .initialize()
        .align('center')
        .line('DEV TEST')
        .line('')
        .line('.'.repeat(Math.min(dottedLineCount, 32)))
        .align('left')
        .line('')
        .line(testText.substring(0, 32))
        .line('')
        .align('center')
        .line('.'.repeat(Math.min(dottedLineCount, 32)))
        .align('left')
        .line('')
        .line(`Chars: ${testText.length}/32`)
        .line('')
        .cut()
        .encode() as Uint8Array;

      await this.writePreparedPayload(data);

      // Wait for printer to finish
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Reset printer
      await this.resetPrinterFormattingState();
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.log('Dev test print successful');
      return true;
    } catch (error) {
      console.error('Dev test print error:', error);
      return false;
    }
  }

  /**
   * Reprint the last printed receipt
   */
  async reprintLast(): Promise<boolean> {
    if (!this.lastPrintedOrder || !this.lastPrintedRestaurant) {
      throw new Error('No previous receipt to reprint');
    }
    return this.printReceipt(this.lastPrintedOrder, this.lastPrintedRestaurant, this.lastPrintedOptions);
  }

  hasLastReceipt(): boolean {
    return !!this.lastPrintedOrder;
  }

  /**
   * Open the cash drawer using either custom commands or default ESC/POS command.
   * Parameters modeled after escpos-php Printer::pulse(pin, on_ms, off_ms).
   * @param drawerCommands Optional custom ESC/POS commands as hex string
   * @param pin Drawer pin: 0 for pin 2, 1 for pin 5 (default 0)
   * @param onMs Pulse ON time in milliseconds (default 120)
   * @param offMs Pulse OFF time in milliseconds (default 240)
   */
  async openDrawer(drawerCommands?: string, pin: number = 0, onMs: number = 120, offMs: number = 240): Promise<boolean> {
    try {
      if (!await this.ensureConnection()) {
        throw new Error('Printer not connected');
      }

      if (!this.characteristic) {
        throw new Error('No writable characteristic found');
      }

      // If custom commands provided, use them
      if (drawerCommands && drawerCommands.trim()) {
        try {
          // Convert hex string to Uint8Array
          const hex = drawerCommands.trim().replace(/\s/g, '');
          const data = new Uint8Array(hex.length / 2);
          for (let i = 0; i < hex.length; i += 2) {
            data[i / 2] = parseInt(hex.substr(i, 2), 16);
          }
          await this.writeDataInChunks(data);
          console.log('Drawer opened with custom commands');
          return true;
        } catch (error) {
          console.error('Failed to parse custom drawer commands:', error);
          // Fall through to default command
        }
      }

      // Default ESC/POS drawer open command
      // ESC p m t1 t2  (from escpos-php Printer::pulse)
      // pin: 0 = pin 2, 1 = pin 5; t1/t2 in units of 2ms
      const pinVal = Math.max(0, Math.min(1, pin));
      const t1 = Math.max(1, Math.min(255, Math.floor(onMs / 2)));
      const t2 = Math.max(1, Math.min(255, Math.floor(offMs / 2)));
      const defaultDrawerCommand = new Uint8Array([0x1B, 0x70, pinVal, t1, t2]);
      await this.writeDataInChunks(defaultDrawerCommand);
      
      console.log('Drawer opened with default ESC/POS command');
      return true;

    } catch (error) {
      console.error('Open drawer error:', error);
      return false;
    }
  }

  getConnectionStatus() {
    return {
      connected: this.isConnected(),
      deviceName: this.device?.name,
      hasCharacteristic: !!this.characteristic,
      isPrinting: this.isPrinting,
      isProcessingQueue: this.isProcessingQueue,
      queueSize: this.printQueue.length,
      lastPrintTime: this.lastPrintTime
    };
  }
}

export default new PrinterService();
