// services/printerService.ts
// Raw ESC/POS printer service — Loyverse-style, no encoder library.
// Uses direct ESC/POS binary commands for reliable alignment, sizing, and formatting.

// ─── ESC/POS Command Constants ──────────────────────────────────────────────
// Reference: Epson ESC/POS Application Programming Guide

const ESC = 0x1B;
const GS  = 0x1D;
const LF  = 0x0A;

/** ESC/POS commands as raw byte arrays */
const CMD = {
  // Printer control
  INIT:           [ESC, 0x40],                    // ESC @     Initialize printer
  LF:             [LF],                           // LF        Line feed

  // Text alignment
  ALIGN_LEFT:     [ESC, 0x61, 0x00],              // ESC a 0   Align left
  ALIGN_CENTER:   [ESC, 0x61, 0x01],              // ESC a 1   Align center
  ALIGN_RIGHT:    [ESC, 0x61, 0x02],              // ESC a 2   Align right

  // Text emphasis
  BOLD_ON:        [ESC, 0x45, 0x01],              // ESC E 1
  BOLD_OFF:       [ESC, 0x45, 0x00],              // ESC E 0
  UNDERLINE_ON:   [ESC, 0x2D, 0x01],              // ESC - 1
  UNDERLINE_OFF:  [ESC, 0x2D, 0x00],              // ESC - 0
  EMPHASIS_ON:    [ESC, 0x47, 0x01],              // ESC G 1   Double-strike
  EMPHASIS_OFF:   [ESC, 0x47, 0x00],              // ESC G 0

  // Character size — GS ! n  where n = (width-1)<<4 | (height-1)
  SIZE_NORMAL:    [GS, 0x21, 0x00],               // 1x width, 1x height
  SIZE_DOUBLE_H:  [GS, 0x21, 0x01],               // 1x width, 2x height
  SIZE_DOUBLE_W:  [GS, 0x21, 0x10],               // 2x width, 1x height
  SIZE_DOUBLE:    [GS, 0x21, 0x11],               // 2x width, 2x height
  SIZE_TRIPLE:    [GS, 0x21, 0x22],               // 3x width, 3x height

  // Font selection
  FONT_A:         [ESC, 0x4D, 0x00],              // ESC M 0   Font A (12×24)
  FONT_B:         [ESC, 0x4D, 0x01],              // ESC M 1   Font B (9×17)

  // Paper cut
  CUT_FULL:       [GS, 0x56, 0x00],               // GS V 0    Full cut
  CUT_PARTIAL:    [GS, 0x56, 0x01],               // GS V 1    Partial cut
  CUT_FEED:       [GS, 0x56, 0x42, 0x03],         // GS V B 3  Feed then partial cut

  // Cash drawer
  DRAWER_PIN2:    [ESC, 0x70, 0x00, 0x3C, 0x78],  // ESC p 0 60 120  (pin 2, 120ms on, 240ms off)
  DRAWER_PIN5:    [ESC, 0x70, 0x01, 0x3C, 0x78],  // ESC p 1 60 120  (pin 5)

  // Print density
  DENSITY_LIGHT:  [GS, 0x7C, 0x02],               // GS | 2    Light
  DENSITY_MEDIUM: [GS, 0x7C, 0x04],               // GS | 4    Medium (default)
  DENSITY_DARK:   [GS, 0x7C, 0x08],               // GS | 8    Dark/Heavy

  // Line spacing
  LINE_SPACING_DEFAULT: [ESC, 0x32],               // ESC 2     Default line spacing
  LINE_SPACING_SET:     [ESC, 0x33],               // ESC 3 n   Set to n dots (append n)

  // Character code table
  CODEPAGE_PC437: [ESC, 0x74, 0x00],              // ESC t 0   PC437 (USA)

  // Buzzer / beep
  BEEP:           [ESC, 0x42, 0x02, 0x03],        // ESC B 2 3  — 2 beeps, 300ms each
} as const;


// ─── Types ──────────────────────────────────────────────────────────────────

export interface PrinterDevice {
  id: string;
  name: string;
}

export type PaperSize = '58mm' | '80mm';
export type ConnectionType = 'bluetooth' | 'wifi' | 'usb';
export type PrintDensity = 'light' | 'medium' | 'dark';
export type PrintJobType = 'receipt' | 'kitchen';
export type PrintMode = 'text' | 'graphic';
export type TextSize = 1 | 2 | 3 | 4;
export type TextFont = 'A' | 'B';
export type TextAlignment = 'left' | 'center' | 'right';

// ─── Printer Models ─────────────────────────────────────────────────────────

export interface PrinterModelPreset {
  id: string;
  name: string;
  brand: string;
  paperSize: PaperSize;
  printMode: PrintMode;
  printWidth: number; // dots per line
  printResolution: number; // DPI
  initCommand: string; // hex string
  cutterCommand: string;
  drawerCommand: string;
}

export const PRINTER_MODELS: PrinterModelPreset[] = [
  { id: 'epson_tm_t20ii', name: 'TM-T20II', brand: 'Epson', paperSize: '80mm', printMode: 'text', printWidth: 576, printResolution: 203, initCommand: '1B40', cutterCommand: '1D564200', drawerCommand: '1B70003C78' },
  { id: 'epson_tm_t88v', name: 'TM-T88V', brand: 'Epson', paperSize: '80mm', printMode: 'text', printWidth: 576, printResolution: 180, initCommand: '1B40', cutterCommand: '1D564200', drawerCommand: '1B70003C78' },
  { id: 'epson_tm_t82iii', name: 'TM-T82III', brand: 'Epson', paperSize: '80mm', printMode: 'text', printWidth: 576, printResolution: 203, initCommand: '1B40', cutterCommand: '1D564200', drawerCommand: '1B70003C78' },
  { id: 'epson_tm_m30ii', name: 'TM-M30II', brand: 'Epson', paperSize: '80mm', printMode: 'text', printWidth: 576, printResolution: 203, initCommand: '1B40', cutterCommand: '1D564200', drawerCommand: '1B70003C78' },
  { id: 'star_tsp143', name: 'TSP143', brand: 'Star', paperSize: '80mm', printMode: 'text', printWidth: 576, printResolution: 203, initCommand: '1B40', cutterCommand: '1B6400', drawerCommand: '1B70003C78' },
  { id: 'star_tsp654', name: 'TSP654', brand: 'Star', paperSize: '80mm', printMode: 'text', printWidth: 576, printResolution: 203, initCommand: '1B40', cutterCommand: '1B6400', drawerCommand: '1B70003C78' },
  { id: 'bixolon_srp350iii', name: 'SRP-350III', brand: 'Bixolon', paperSize: '80mm', printMode: 'text', printWidth: 576, printResolution: 180, initCommand: '1B40', cutterCommand: '1D564200', drawerCommand: '1B70003C78' },
  { id: 'xprinter_xp58', name: 'XP-58', brand: 'Xprinter', paperSize: '58mm', printMode: 'text', printWidth: 384, printResolution: 203, initCommand: '1B40', cutterCommand: '1D564200', drawerCommand: '1B70003C78' },
  { id: 'xprinter_xp80', name: 'XP-80', brand: 'Xprinter', paperSize: '80mm', printMode: 'text', printWidth: 576, printResolution: 203, initCommand: '1B40', cutterCommand: '1D564200', drawerCommand: '1B70003C78' },
  { id: 'pos_5890k', name: 'POS-5890K', brand: 'Generic', paperSize: '58mm', printMode: 'text', printWidth: 384, printResolution: 203, initCommand: '1B40', cutterCommand: '1D564200', drawerCommand: '1B70003C78' },
  { id: 'pos_8220', name: 'POS-8220', brand: 'Generic', paperSize: '80mm', printMode: 'text', printWidth: 576, printResolution: 203, initCommand: '1B40', cutterCommand: '1D564200', drawerCommand: '1B70003C78' },
];

/** Loyverse-style saved printer config */
export interface SavedPrinter {
  id: string;
  name: string;
  printerModel: string; // model ID or 'other'
  connectionType: ConnectionType;
  paperSize: PaperSize;
  printDensity: PrintDensity;
  autoCut: boolean;
  cashDrawer: boolean;
  printJobs: PrintJobType[];
  kitchenCategories: string[];
  numberOfCopies: number;
  deviceId?: string;
  deviceName?: string;
  ipAddress?: string;
  // Advanced settings (editable when model is 'other')
  printMode: PrintMode;
  printWidth: number;
  printResolution: number;
  initCommand: string;
  cutterCommand: string;
  drawerCommand: string;
}

/** Receipt content configuration */
export interface ReceiptConfig {
  businessName: string;
  businessAddressLine1: string;
  businessAddressLine2: string;
  businessPhone: string;
  headerText: string;
  footerText: string;
  showOrderNumber: boolean;
  showCashierName: boolean;
  showDateTime: boolean;
  showCustomerName: boolean;
  showTableNumber: boolean;
  showDiningOption: boolean;
  showItems: boolean;
  showRemark: boolean;
  showTotal: boolean;
  showTaxes: boolean;
  showOrderSource: boolean;
  showAmountReceived: boolean;
  showChange: boolean;
  autoPrintAfterSale: boolean;
  printReceiptForRefund: boolean;
  openCashDrawerOnPayment: boolean;
  // Text customization
  documentSize: TextSize;
  documentFont: TextFont;
  documentAlignment: TextAlignment;
  titleSize: TextSize;
  titleFont: TextFont;
  titleAlignment: TextAlignment;
  headerSize: TextSize;
  headerFont: TextFont;
  headerAlignment: TextAlignment;
  footerSize: TextSize;
  footerFont: TextFont;
  footerAlignment: TextAlignment;
  paymentStatusSize: TextSize;
  paymentStatusFont: TextFont;
  paymentStatusAlignment: TextAlignment;
}

/** Order-list content configuration (prep list). */
export interface OrderListConfig extends ReceiptConfig {
  showItemPrice: boolean;
  showPaymentMethod: boolean;
}

/** Kitchen ticket config */
export interface KitchenTicketConfig {
  printLargeOrderNumber: boolean;
  numberOfCopies: number;
  autoPrintOnNewOrder: boolean;
}

export interface ReceiptPrintOptions {
  documentType?: 'receipt' | 'order-list';
  showDateTime?: boolean;
  showOrderId?: boolean;
  showTableNumber?: boolean;
  showDiningOption?: boolean;
  showItems?: boolean;
  showItemPrice?: boolean;
  showRemark?: boolean;
  showTotal?: boolean;
  showPaymentMethod?: boolean;
  headerText?: string;
  footerText?: string;
  businessAddressLine1?: string;
  businessAddressLine2?: string;
  businessAddress?: string; // legacy single-line address fallback
  businessPhone?: string;
  autoOpenDrawer?: boolean;
  paperSize?: PaperSize;
  printDensity?: PrintDensity;
  autoCut?: boolean;
  showOrderSource?: boolean;
  showCashierName?: boolean;
  cashierName?: string;
  showAmountReceived?: boolean;
  showChange?: boolean;
  showTaxes?: boolean;
  taxes?: Array<{ name: string; amount: number }>;
  // Text customization
  documentSize?: TextSize;
  documentFont?: TextFont;
  documentAlignment?: TextAlignment;
  titleSize?: TextSize;
  titleFont?: TextFont;
  titleAlignment?: TextAlignment;
  headerSize?: TextSize;
  headerFont?: TextFont;
  headerAlignment?: TextAlignment;
  footerSize?: TextSize;
  footerFont?: TextFont;
  footerAlignment?: TextAlignment;
  paymentStatusSize?: TextSize;
  paymentStatusFont?: TextFont;
  paymentStatusAlignment?: TextAlignment;
}

export interface ShiftPrintData {
  shiftId: string;
  cashierName: string;
  openedAt: string;
  closedAt: string;
  openingAmount: number;
  expectedClosingAmount: number;
  actualClosingAmount: number;
  difference: number;
  totalCashSales: number;
  totalCardSales: number;
  totalQrSales: number;
  totalOtherSales: number;
  totalSales: number;
  totalOrders: number;
  totalRefunds?: number;
  closeNote?: string | null;
}

export interface ShiftPrintOptions {
  businessName?: string;
  businessAddressLine1?: string;
  businessAddressLine2?: string;
  businessPhone?: string;
  headerText?: string;
  footerText?: string;
  currencySymbol?: string;
  paperSize?: PaperSize;
  printDensity?: PrintDensity;
  autoCut?: boolean;
}


// ─── Defaults ───────────────────────────────────────────────────────────────

export const DEFAULT_RECEIPT_CONFIG: ReceiptConfig = {
  businessName: '',
  businessAddressLine1: '',
  businessAddressLine2: '',
  businessPhone: '',
  headerText: '',
  footerText: 'Thank you! Please come again.',
  showOrderNumber: true,
  showCashierName: false,
  showDateTime: true,
  showCustomerName: false,
  showTableNumber: true,
  showDiningOption: true,
  showItems: true,
  showRemark: true,
  showTotal: true,
  showTaxes: false,
  showOrderSource: false,
  showAmountReceived: true,
  showChange: true,
  autoPrintAfterSale: false,
  printReceiptForRefund: false,
  openCashDrawerOnPayment: false,
  documentSize: 1,
  documentFont: 'A',
  documentAlignment: 'center',
  titleSize: 2,
  titleFont: 'A',
  titleAlignment: 'center',
  headerSize: 1,
  headerFont: 'A',
  headerAlignment: 'center',
  footerSize: 1,
  footerFont: 'A',
  footerAlignment: 'center',
  paymentStatusSize: 1,
  paymentStatusFont: 'A',
  paymentStatusAlignment: 'center',
};

export const DEFAULT_ORDER_LIST_CONFIG: OrderListConfig = {
  ...DEFAULT_RECEIPT_CONFIG,
  footerText: '',
  showTotal: false,
  showTaxes: false,
  showAmountReceived: false,
  showChange: false,
  showItemPrice: false,
  showPaymentMethod: false,
};

export const DEFAULT_KITCHEN_TICKET_CONFIG: KitchenTicketConfig = {
  printLargeOrderNumber: true,
  numberOfCopies: 1,
  autoPrintOnNewOrder: false,
};

export function createDefaultPrinter(name: string = 'Receipt Printer'): SavedPrinter {
  return {
    id: Date.now().toString(),
    name,
    printerModel: 'other',
    connectionType: 'bluetooth',
    paperSize: '58mm',
    printDensity: 'medium',
    autoCut: true,
    cashDrawer: false,
    printJobs: ['receipt'],
    kitchenCategories: [],
    numberOfCopies: 1,
    printMode: 'text',
    printWidth: 384,
    printResolution: 203,
    initCommand: '1B40',
    cutterCommand: '1D564200',
    drawerCommand: '1B70003C78',
  };
}

/** Apply a printer model preset to a SavedPrinter form */
export function applyModelPreset(printer: SavedPrinter, modelId: string): SavedPrinter {
  if (modelId === 'other') {
    return { ...printer, printerModel: 'other' };
  }
  const preset = PRINTER_MODELS.find(m => m.id === modelId);
  if (!preset) return { ...printer, printerModel: modelId };
  return {
    ...printer,
    printerModel: modelId,
    paperSize: preset.paperSize,
    printMode: preset.printMode,
    printWidth: preset.printWidth,
    printResolution: preset.printResolution,
    initCommand: preset.initCommand,
    cutterCommand: preset.cutterCommand,
    drawerCommand: preset.drawerCommand,
  };
}


// ─── ESC/POS Receipt Builder ────────────────────────────────────────────────
// Builds a byte buffer using raw ESC/POS commands.
// This replaces the esc-pos-encoder library for reliable hardware alignment,
// text sizing, and bold — exactly how Loyverse does it.

class EscPosBuilder {
  private buffer: number[] = [];
  private columns: number;

  constructor(paperSize: PaperSize = '58mm') {
    this.columns = paperSize === '80mm' ? 48 : 32;
  }

  /** Append raw bytes */
  raw(bytes: readonly number[]): this {
    this.buffer.push(...bytes);
    return this;
  }

  /** Initialize printer (reset all settings) */
  init(): this {
    return this.raw(CMD.INIT);
  }

  /** Set text alignment */
  align(alignment: 'left' | 'center' | 'right'): this {
    switch (alignment) {
      case 'center': return this.raw(CMD.ALIGN_CENTER);
      case 'right':  return this.raw(CMD.ALIGN_RIGHT);
      default:       return this.raw(CMD.ALIGN_LEFT);
    }
  }

  /** Set bold on/off */
  bold(on: boolean): this {
    return this.raw(on ? CMD.BOLD_ON : CMD.BOLD_OFF);
  }

  /** Set text size using GS ! n
   *  width: 1-8, height: 1-8 (1 = normal) */
  size(width: number, height: number): this {
    const w = Math.max(0, Math.min(7, (width || 1) - 1));
    const h = Math.max(0, Math.min(7, (height || 1) - 1));
    return this.raw([GS, 0x21, (w << 4) | h]);
  }

  /** Reset to normal size */
  normalSize(): this {
    return this.raw(CMD.SIZE_NORMAL);
  }

  /** Set font A or B */
  font(f: 'A' | 'B'): this {
    return this.raw(f === 'B' ? CMD.FONT_B : CMD.FONT_A);
  }

  /** Set underline on/off */
  underline(on: boolean): this {
    return this.raw(on ? CMD.UNDERLINE_ON : CMD.UNDERLINE_OFF);
  }

  /** Print text without line feed */
  text(str: string): this {
    const bytes = this.encodeText(str);
    this.buffer.push(...bytes);
    return this;
  }

  /** Print text followed by line feed */
  line(str: string): this {
    return this.text(str).raw(CMD.LF);
  }

  /** Print empty line(s) */
  feed(lines: number = 1): this {
    for (let i = 0; i < lines; i++) this.raw(CMD.LF);
    return this;
  }

  /** Set custom line spacing in dots for tighter or looser text blocks */
  lineSpacing(dots: number): this {
    const spacing = Math.max(0, Math.min(255, dots));
    return this.raw([...CMD.LINE_SPACING_SET, spacing]);
  }

  /** Reset line spacing to printer default */
  defaultLineSpacing(): this {
    return this.raw(CMD.LINE_SPACING_DEFAULT);
  }

  /** Print a separator line of the given character */
  separator(char: string = '-'): this {
    return this.line(char.repeat(this.columns));
  }

  /** Print a thick separator */
  thickSeparator(): this {
    return this.separator('=');
  }

  /** Print left-aligned text with right-aligned value on same line.
   *  This uses space padding for precise column alignment. */
  columns2(left: string, right: string): this {
    const maxLeft = this.columns - right.length - 1;
    const truncLeft = left.length > maxLeft ? left.substring(0, maxLeft) : left;
    const spaces = Math.max(1, this.columns - truncLeft.length - right.length);
    return this.line(truncLeft + ' '.repeat(spaces) + right);
  }

  /** Print 3-column row (qty, name, price) */
  columns3(col1: string, col2: string, col3: string): this {
    const c1 = col1.padEnd(4);
    const maxC2 = this.columns - c1.length - col3.length - 1;
    const c2 = col2.length > maxC2 ? col2.substring(0, maxC2) : col2;
    const spaces = Math.max(1, this.columns - c1.length - c2.length - col3.length);
    return this.line(c1 + c2 + ' '.repeat(spaces) + col3);
  }

  /** Set print density */
  density(level: PrintDensity): this {
    switch (level) {
      case 'light': return this.raw(CMD.DENSITY_LIGHT);
      case 'dark':  return this.raw(CMD.DENSITY_DARK);
      default:      return this.raw(CMD.DENSITY_MEDIUM);
    }
  }

  /** Open cash drawer (pin 2 or pin 5) */
  openDrawer(pin: 0 | 1 = 0): this {
    return this.raw(pin === 1 ? CMD.DRAWER_PIN5 : CMD.DRAWER_PIN2);
  }

  /** Sound the buzzer/beep */
  beep(): this {
    return this.raw(CMD.BEEP);
  }

  /** Cut paper */
  cut(mode: 'full' | 'partial' | 'feed' = 'feed'): this {
    switch (mode) {
      case 'full':    return this.raw(CMD.CUT_FULL);
      case 'partial': return this.raw(CMD.CUT_PARTIAL);
      default:        return this.raw(CMD.CUT_FEED);
    }
  }

  /** Encode string to bytes (ASCII-safe with fallback) */
  private encodeText(str: string): number[] {
    const bytes: number[] = [];
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      // Keep printable ASCII + common extensions
      if (code >= 0x20 && code <= 0x7E) {
        bytes.push(code);
      } else if (code === 0x0A) {
        bytes.push(0x0A); // newline
      } else if (code >= 0xA0 && code <= 0xFF) {
        bytes.push(code); // Latin-1 supplement
      } else {
        bytes.push(0x3F); // '?' for unsupported chars
      }
    }
    return bytes;
  }

  /** Get the column count */
  getColumns(): number {
    return this.columns;
  }

  /** Build final Uint8Array */
  encode(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}


// ─── Printer Service ────────────────────────────────────────────────────────

class PrinterService {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private service: BluetoothRemoteGATTService | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private readonly bleChunkSize: number = 100;
  private isPrinting: boolean = false;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private lastPrintTime: number = 0;
  private connectionPromise: Promise<boolean> | null = null;
  private disconnectRequested: boolean = false;

  // Reprint support
  private lastPrintedOrder: any = null;
  private lastPrintedRestaurant: any = null;
  private lastPrintedOptions: ReceiptPrintOptions | undefined = undefined;

  // Print queue
  private printQueue: Array<{
    id: string;
    order: any;
    restaurant: any;
    options?: ReceiptPrintOptions;
    resolve: (value: boolean) => void;
    reject: (reason?: any) => void;
    timestamp: number;
  }> = [];
  private isProcessingQueue: boolean = false;
  private readonly maxQueueSize: number = 50;

  // BLE service UUIDs commonly used by receipt printers
  private static readonly SERVICE_UUIDS = [
    '000018f0-0000-1000-8000-00805f9b34fb',
    '00001800-0000-1000-8000-00805f9b34fb',
    '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Microchip
    'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Nordic UART
  ];


  // ─── Connection ─────────────────────────────────────────────────────────

  async scanForPrinters(): Promise<PrinterDevice[]> {
    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: PrinterService.SERVICE_UUIDS,
      });
      return [{ id: device.id, name: device.name || 'Unknown Printer' }];
    } catch (error) {
      console.error('Scan error:', error);
      return [];
    }
  }

  async connect(deviceName: string): Promise<boolean> {
    if (this.connectionPromise) return this.connectionPromise;
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
        optionalServices: PrinterService.SERVICE_UUIDS,
      });

      this.device.addEventListener('gattserverdisconnected', () => {
        if (!this.disconnectRequested) {
          this.server = null;
          this.service = null;
          this.characteristic = null;
        }
      });

      return await this.connectGatt();
    } catch (error) {
      console.error('Connection error:', error);
      await this.cleanup();
      return false;
    }
  }

  private async connectGatt(): Promise<boolean> {
    if (!this.device) return false;

    const server = await this.device.gatt?.connect();
    if (!server) throw new Error('Failed to connect to GATT server');
    this.server = server;

    // Try each known service UUID
    for (const uuid of PrinterService.SERVICE_UUIDS) {
      try {
        this.service = await this.server.getPrimaryService(uuid);
        break;
      } catch { /* try next */ }
    }
    if (!this.service) throw new Error('No compatible printer service found');

    // Find writable characteristic (prefer writeWithoutResponse for speed)
    const characteristics = await this.service.getCharacteristics();
    for (const char of characteristics) {
      if (char.properties.writeWithoutResponse) {
        this.characteristic = char;
        break;
      } else if (char.properties.write && !this.characteristic) {
        this.characteristic = char;
      }
    }
    if (!this.characteristic) throw new Error('No writable characteristic found');

    this.startKeepAlive();
    return true;
  }

  async autoReconnect(deviceName: string): Promise<boolean> {
    if (this.isConnected()) return true;

    try {
      const bluetooth = (navigator as any).bluetooth;
      if (!bluetooth?.getDevices) return false;

      const devices: BluetoothDevice[] = await bluetooth.getDevices();
      const target = devices.find((d: BluetoothDevice) => d.name === deviceName);
      if (!target) return false;

      this.device = target;
      this.disconnectRequested = false;

      this.device.addEventListener('gattserverdisconnected', () => {
        if (!this.disconnectRequested) {
          this.server = null;
          this.service = null;
          this.characteristic = null;
        }
      });

      // Try direct GATT connection first
      try {
        const directResult = await this.connectGatt();
        if (directResult) return true;
      } catch { /* fall through to advertisement watching */ }

      // Watch for BLE advertisements (background reconnect)
      if (typeof (target as any).watchAdvertisements === 'function') {
        const abortCtrl = new AbortController();
        return new Promise<boolean>((resolve) => {
          const timeout = setTimeout(() => { abortCtrl.abort(); resolve(false); }, 5000);
          target.addEventListener('advertisementreceived', async () => {
            clearTimeout(timeout);
            abortCtrl.abort();
            try {
              resolve(await this.connectGatt());
            } catch {
              resolve(false);
            }
          }, { once: true });
          (target as any).watchAdvertisements({ signal: abortCtrl.signal }).catch(() => {
            clearTimeout(timeout);
            resolve(false);
          });
        });
      }

      return false;
    } catch (error) {
      console.error('Auto-reconnect error:', error);
      await this.cleanup();
      this.device = null;
      return false;
    }
  }

  isConnected(): boolean {
    return this.server?.connected === true;
  }

  async disconnect() {
    this.disconnectRequested = true;
    this.stopKeepAlive();
    this.clearQueue();
    try { if (this.server?.connected) this.server.disconnect(); } catch {}
    await this.cleanup();
    this.device = null;
  }

  getConnectionStatus() {
    return {
      connected: this.isConnected(),
      deviceName: this.device?.name,
      isPrinting: this.isPrinting,
      queueSize: this.printQueue.length,
    };
  }


  // ─── Keep Alive ─────────────────────────────────────────────────────────

  private startKeepAlive() {
    this.stopKeepAlive();
    this.keepAliveInterval = setInterval(async () => {
      if (this.isConnected() && this.characteristic && !this.isPrinting && !this.isProcessingQueue) {
        try { await this.characteristic.writeValue(new Uint8Array([0x00])); } catch {}
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


  // ─── Write Helpers ──────────────────────────────────────────────────────

  private async writeData(data: Uint8Array): Promise<void> {
    if (!this.characteristic) throw new Error('No writable characteristic');

    for (let i = 0; i < data.length; i += this.bleChunkSize) {
      const chunk = data.slice(i, i + this.bleChunkSize);
      if (this.characteristic.properties.writeWithoutResponse) {
        await this.characteristic.writeValueWithoutResponse(chunk);
      } else {
        await this.characteristic.writeValueWithResponse(chunk);
      }
      // Small delay between chunks to avoid BLE buffer overflow
      if (i + this.bleChunkSize < data.length) {
        await new Promise(r => setTimeout(r, 20));
      }
    }
  }

  async ensureConnection(): Promise<boolean> {
    if (this.isConnected() && this.characteristic) return true;
    if (this.device && !this.disconnectRequested) {
      try { return await this.connectGatt(); } catch { /* fall through */ }
    }
    return false;
  }


  // ─── Text Helpers ───────────────────────────────────────────────────────

  private sanitize(text: any): string {
    if (text == null) return '';
    return String(text).replace(/[\x00-\x1F\x7F]/g, '').trim();
  }

  private formatPrice(price: any): string {
    const num = Number(price);
    return isNaN(num) ? '0.00' : num.toFixed(2);
  }

  private formatDate(d: Date): string {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  private formatTime(d: Date): string {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }


  // ─── Queue ──────────────────────────────────────────────────────────────

  clearQueue(): void {
    this.printQueue.forEach(j => j.reject(new Error('Queue cleared')));
    this.printQueue = [];
  }

  getQueueSize(): number { return this.printQueue.length; }
  isBusy(): boolean { return this.isPrinting || this.isProcessingQueue || this.printQueue.length > 0; }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.printQueue.length === 0) return;
    this.isProcessingQueue = true;

    while (this.printQueue.length > 0) {
      const job = this.printQueue[0];
      try {
        if (!await this.ensureConnection()) throw new Error('Printer disconnected');
        const ok = await this.executePrint(job.order, job.restaurant, job.options);
        if (ok) {
          if (job.options?.autoOpenDrawer) await this.openDrawer();
          job.resolve(true);
        } else {
          job.reject(new Error('Print execution failed'));
        }
      } catch (err) {
        job.reject(err);
      }
      this.printQueue.shift();
      if (this.printQueue.length > 0) await new Promise(r => setTimeout(r, 2000));
    }

    this.isProcessingQueue = false;
  }


  // ─── Receipt Printing ───────────────────────────────────────────────────

  async printReceipt(order: any, restaurant: any, options?: ReceiptPrintOptions): Promise<boolean> {
    if (this.printQueue.length >= this.maxQueueSize) throw new Error('Print queue full');

    return new Promise((resolve, reject) => {
      this.printQueue.push({
        id: `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        order: { ...order },
        restaurant: { ...restaurant },
        options,
        resolve,
        reject,
        timestamp: Date.now(),
      });
      this.processQueue();
    });
  }

  private async executePrint(order: any, restaurant: any, options?: ReceiptPrintOptions): Promise<boolean> {
    this.isPrinting = true;
    try {
      if (!this.characteristic) throw new Error('No printer connection');

      const paperSize: PaperSize = options?.paperSize || '58mm';
      const r = new EscPosBuilder(paperSize);
      const cols = r.getColumns();
      const now = new Date(order.timestamp);

      const bizName   = this.sanitize(restaurant?.name);
      const orderId   = this.sanitize(order.id);
      const rawTable  = this.sanitize(order.tableNumber);
      const tableNum  = rawTable ? rawTable.replace(/^Table\s+/i, '') : rawTable;
      const remark    = this.sanitize(order.remark);
      const header    = this.sanitize(options?.headerText);
      const footer    = options?.documentType === 'order-list' ? '' : this.sanitize(options?.footerText || 'Thank you! Please come again.');
      const bizAddrLine1 = this.sanitize(options?.businessAddressLine1 || options?.businessAddress);
      const bizAddrLine2 = this.sanitize(options?.businessAddressLine2);
      const bizPhone  = this.sanitize(options?.businessPhone);
      const documentTitle = options?.documentType === 'order-list' ? 'ORDER LIST' : 'PAYMENT RECEIPT';

      const showDT     = options?.showDateTime !== false;
      const showOrdId  = options?.showOrderId !== false;
      const showTable  = options?.showTableNumber !== false;
      const showDining = options?.showDiningOption !== false;
      const showItems  = options?.showItems !== false;
      const showItemPrice = options?.showItemPrice !== false;
      const showRemark = options?.showRemark !== false;
      const showTotal  = options?.showTotal !== false;
      const showPaymentMethod = options?.showPaymentMethod !== false;

      // ── Initialize & set density ──
      r.init();
      if (options?.printDensity) r.density(options.printDensity);

      // ── Business Name — use title customization ──
      const titleAlign = options?.titleAlignment || 'center';
      const titleSz = options?.titleSize || 2;
      const titleFnt = options?.titleFont || 'A';
      if (bizName) {
        r.align(titleAlign).bold(true).font(titleFnt).size(titleSz, titleSz);
        r.line(bizName);
        r.normalSize().bold(false).font('A');

        // ── Address & Phone — centered, normal ──
        r.align(titleAlign);
        if (bizAddrLine1) r.line(bizAddrLine1);
        if (bizAddrLine2) r.line(bizAddrLine2);
        if (bizPhone) r.line(bizPhone);
      }

      // ── Custom header text — use header customization ──
      if (header) {
        const hdrAlign = options?.headerAlignment || 'center';
        const hdrSz = options?.headerSize || 1;
        const hdrFnt = options?.headerFont || 'A';
        r.align(hdrAlign).font(hdrFnt).size(hdrSz, hdrSz);
        r.line(header);
        r.normalSize().font('A');
      }

      // ── Document header ──
      const docAlign = options?.documentAlignment || 'center';
      const docSz = options?.documentSize || 1;
      const docFnt = options?.documentFont || 'A';

      r.align(docAlign).normalSize().font('A').bold(false);
      r.line('.'.repeat(cols));
      r.lineSpacing(16);
      r.bold(true).font(docFnt).size(docSz, docSz).line(documentTitle);
      r.normalSize().bold(false).defaultLineSpacing();
      r.line('.'.repeat(cols));

      r.align('left');

      // ── Date/Time ──
      if (showDT) {
        r.columns2(this.formatDate(now), this.formatTime(now));
      }

      // ── Order Number ──
      if (showOrdId && orderId) {
        r.bold(true).line(`Order #${orderId}`).bold(false);
      }

      // ── Order Source ──
      if (options?.showOrderSource && order.orderSource) {
        const src = order.orderSource === 'counter' ? 'Counter'
          : order.orderSource === 'qr_order' ? 'QR Order'
          : order.orderSource === 'online' ? 'Online'
          : order.orderSource === 'tableside' ? 'Tableside'
          : this.sanitize(order.orderSource);
        r.line(`Source: ${src}`);
      }

      // ── Cashier ──
      if (options?.showCashierName && options.cashierName) {
        r.line(`Cashier: ${this.sanitize(options.cashierName)}`);
      }

      // ── Table Number — bold ──
      if (showTable && tableNum) {
        r.feed(1).bold(true);
        r.line(`Table: ${tableNum}`);
        r.bold(false);
      }

      // ── Dining Option — same style as table ──
      if (showDining && order.diningType) {
        if (!(showTable && tableNum)) r.feed(1);
        r.bold(true);
        r.line(`Dining: ${this.sanitize(order.diningType)}`);
        r.bold(false);
      }

      // ── Items header ──
      r.separator();

      // ── Items ──
      if (showItems && Array.isArray(order.items) && order.items.length > 0) {
        for (const item of order.items) {
          const name = this.sanitize(item.name) || 'Item';
          const qty  = item.quantity || 1;
          const lineLabel = `${qty}x ${name}`;

          r.bold(true);
          if (showItemPrice) {
            const price = this.formatPrice(item.price ? item.price * qty : 0);
            r.columns2(lineLabel, price);
          } else {
            r.line(lineLabel);
          }
          r.bold(false);

          // Item options / variants
          if (item.selectedSize)
            r.line(`  Size: ${this.sanitize(item.selectedSize)}`);
          if (item.selectedTemp)
            r.line(`  Temp: ${this.sanitize(item.selectedTemp)}`);
          if (item.selectedOtherVariant) {
            const label = this.sanitize(item.otherVariantName) || 'Option';
            r.line(`  ${label}: ${this.sanitize(item.selectedOtherVariant)}`);
          }
          if (item.selectedVariantOption)
            r.line(`  Variant: ${this.sanitize(item.selectedVariantOption)}`);

          // Mix & Match
          if (Array.isArray(item.selectedMixMatch)) {
            for (const mm of item.selectedMixMatch) {
              if (mm.choice) {
                const label = this.sanitize(mm.label) || 'Selection';
                r.line(`  ${label}: ${this.sanitize(mm.choice)}`);
              }
            }
          }

          // Add-ons
          if (Array.isArray(item.selectedAddOns)) {
            for (const addon of item.selectedAddOns) {
              const an = this.sanitize(addon.name) || 'Add-on';
              const aq = addon.quantity || 1;
              r.line(aq > 1 ? `  + ${an} x${aq}` : `  + ${an}`);
            }
          }
        }
        r.feed(1);
      } else {
        r.line(showItems ? 'No items' : '').feed(1);
      }

      // ── Remark ──
      if (showRemark && remark) {
        r.separator();
        r.bold(true).line('Note:').bold(false);
        r.line(remark);
        r.feed(1);
      }

      // ── Taxes ──
      if (options?.showTaxes && options.taxes && options.taxes.length > 0) {
        r.separator();
        for (const tax of options.taxes) {
          r.columns2(this.sanitize(tax.name), this.formatPrice(tax.amount));
        }
      }

      // ── Total / Payment details ──
      const hasTotal = showTotal;
      const hasPayment = showPaymentMethod && order.paymentMethod;
      const hasAmountReceived = options?.showAmountReceived !== false && order.amountReceived != null && Number(order.amountReceived) > 0;
      const hasChange = options?.showChange !== false && order.changeAmount != null && Number(order.changeAmount) >= 0;
      const hasTotalSection = hasTotal || hasPayment || hasAmountReceived || hasChange;

      if (hasTotalSection) {
        r.separator();
        if (showTotal) {
          r.bold(true);
          r.columns2('TOTAL', `RM ${this.formatPrice(order.total)}`);
          r.bold(false);
        }

        // ── Payment method ──
        if (hasPayment) {
          r.line(`Paid: ${this.sanitize(order.paymentMethod)}`);
        }
        // ── Amount Received ──
        if (hasAmountReceived) {
          r.columns2('Amount Received', `RM ${this.formatPrice(order.amountReceived)}`);
        }
        // ── Change ──
        if (hasChange) {
          r.columns2('Change', `RM ${this.formatPrice(order.changeAmount)}`);
        }
      }

      // ── Payment indicator for order lists ──
      if (options?.documentType === 'order-list') {
        const isPaid = !!(order.paymentMethod && order.paymentMethod.trim());
        const label = isPaid ? 'ORDER PAID' : 'NOT YET PAID';
        const psAlign = options?.paymentStatusAlignment || 'center';
        const psSz = options?.paymentStatusSize || 1;
        const psFnt = options?.paymentStatusFont || 'A';
        const dashes = '--';
        const padded = `${dashes} ${label} ${dashes}`;
        r.align(psAlign).font(psFnt).size(psSz, psSz);
        r.bold(true);
        r.line(padded);
        r.normalSize().bold(false).font('A');
        r.align('left');
      }

      // ── Footer ──
      if (footer) {
        r.thickSeparator();
        const ftrAlign = options?.footerAlignment || 'center';
        const ftrSz = options?.footerSize || 1;
        const ftrFnt = options?.footerFont || 'A';
        r.align(ftrAlign).font(ftrFnt).size(ftrSz, ftrSz);
        r.line(footer);
        r.normalSize().font('A');
      }

      // ── Feed & cut ──
      r.align('left').feed(4);
      if (options?.autoCut !== false) r.cut();

      // ── Send to printer ──
      await this.writeData(r.encode());
      await new Promise(resolve => setTimeout(resolve, 2500));

      // Store for reprint
      this.lastPrintedOrder = { ...order };
      this.lastPrintedRestaurant = { ...restaurant };
      this.lastPrintedOptions = options ? { ...options } : undefined;
      this.lastPrintTime = Date.now();

      return true;
    } catch (error) {
      console.error('Print error:', error);
      return false;
    } finally {
      this.isPrinting = false;
    }
  }


  // ─── Test Page ──────────────────────────────────────────────────────────

  async printTestPage(businessName?: string, paperSize?: PaperSize): Promise<boolean> {
    if (!await this.ensureConnection()) throw new Error('Printer not connected');
    if (!this.characteristic) throw new Error('No writable characteristic');

    this.isPrinting = true;
    try {
      const r = new EscPosBuilder(paperSize || '58mm');
      const name = this.sanitize(businessName) || 'QUICKSERVE';
      const now = new Date();

      r.init()
        .align('center')
        .bold(true).size(2, 2)
        .line(name)
        .normalSize().bold(false)
        .feed(1)
        .thickSeparator()
        .align('center')
        .bold(true).line('PRINTER TEST')
        .bold(false).feed(1)
        .line(`${this.formatDate(now)} ${this.formatTime(now)}`)
        .feed(1)
        .line('Alignment Test:')
        .align('left').line('LEFT')
        .align('center').line('CENTER')
        .align('right').line('RIGHT')
        .feed(1)
        .align('center')
        .bold(true).line('Size Test:')
        .bold(false)
        .normalSize().line('Normal')
        .size(1, 2).line('Tall')
        .size(2, 1).line('Wide')
        .size(2, 2).line('Large')
        .normalSize()
        .feed(1)
        .thickSeparator()
        .align('center')
        .line('Printer is working!')
        .align('left')
        .feed(4)
        .cut();

      await this.writeData(r.encode());
      await new Promise(resolve => setTimeout(resolve, 2000));
      this.lastPrintTime = Date.now();
      return true;
    } catch (error) {
      console.error('Test page error:', error);
      return false;
    } finally {
      this.isPrinting = false;
    }
  }


  // ─── Kitchen Ticket ─────────────────────────────────────────────────────

  async printKitchenTicket(
    order: any,
    restaurant: any,
    config?: KitchenTicketConfig,
    paperSize?: PaperSize,
  ): Promise<boolean> {
    if (!await this.ensureConnection()) throw new Error('Printer not connected');
    if (!this.characteristic) throw new Error('No writable characteristic');

    this.isPrinting = true;
    try {
      const r = new EscPosBuilder(paperSize || '58mm');
      const now = new Date(order.timestamp);
      const orderId = this.sanitize(order.id) || 'ORDER';
      const rawTableK = this.sanitize(order.tableNumber);
      const tableNum = rawTableK ? rawTableK.replace(/^Table\s+/i, '') : rawTableK;

      r.init();

      // ── Header ──
      r.align('center').bold(true);
      r.size(1, 2).line('*** KITCHEN ***');
      r.normalSize().bold(false);
      r.thickSeparator();

      // ── Order number ──
      if (config?.printLargeOrderNumber !== false) {
        r.align('center').bold(true).size(3, 3);
        r.line(`#${orderId}`);
        r.normalSize().bold(false);
      } else {
        r.align('center').bold(true).line(`#${orderId}`).bold(false);
      }

      // ── Table ──
      if (tableNum) {
        r.align('center').bold(true).size(2, 2);
        r.line(`Table ${tableNum}`);
        r.normalSize().bold(false);
      }

      // ── Time ──
      r.align('left');
      r.line(`${this.formatDate(now)} ${this.formatTime(now)}`);
      r.separator();

      // ── Items ──
      if (Array.isArray(order.items)) {
        for (const item of order.items) {
          const name = this.sanitize(item.name) || 'Item';
          const qty = item.quantity || 1;
          r.bold(true).size(1, 2);
          r.line(`${qty}x ${name}`);
          r.normalSize().bold(false);

          if (item.selectedSize)
            r.line(`  Size: ${this.sanitize(item.selectedSize)}`);
          if (item.selectedTemp)
            r.line(`  Temp: ${this.sanitize(item.selectedTemp)}`);
          if (item.selectedOtherVariant) {
            const label = this.sanitize(item.otherVariantName) || 'Option';
            r.line(`  ${label}: ${this.sanitize(item.selectedOtherVariant)}`);
          }
          if (item.selectedVariantOption)
            r.line(`  Variant: ${this.sanitize(item.selectedVariantOption)}`);
          if (Array.isArray(item.selectedMixMatch)) {
            for (const mm of item.selectedMixMatch) {
              if (mm.choice) {
                const label = this.sanitize(mm.label) || 'Selection';
                r.line(`  ${label}: ${this.sanitize(mm.choice)}`);
              }
            }
          }
          if (Array.isArray(item.selectedAddOns)) {
            for (const addon of item.selectedAddOns) {
              const n = this.sanitize(addon.name) || 'Add-on';
              const q = addon.quantity || 1;
              r.line(q > 1 ? `  + ${n} x${q}` : `  + ${n}`);
            }
          }
          r.feed(1);
        }
      }

      // ── Remark ──
      if (order.remark) {
        const remark = this.sanitize(order.remark);
        if (remark) {
          r.separator();
          r.bold(true).line('Note:').bold(false);
          r.line(remark);
        }
      }

      // ── Footer ──
      r.thickSeparator();
      r.feed(4).cut();

      await this.writeData(r.encode());
      await new Promise(resolve => setTimeout(resolve, 2500));
      return true;
    } catch (error) {
      console.error('Kitchen ticket error:', error);
      return false;
    } finally {
      this.isPrinting = false;
    }
  }

  async printShiftDetails(
    shift: ShiftPrintData,
    restaurant?: { name?: string },
    options?: ShiftPrintOptions,
  ): Promise<boolean> {
    if (!await this.ensureConnection()) throw new Error('Printer not connected');
    if (!this.characteristic) throw new Error('No writable characteristic');

    this.isPrinting = true;
    try {
      const paperSize: PaperSize = options?.paperSize || '58mm';
      const r = new EscPosBuilder(paperSize);
      const businessName = this.sanitize(options?.businessName || restaurant?.name) || 'RESTAURANT';
      const currencySymbol = this.sanitize(options?.currencySymbol) || 'RM ';
      const headerText = this.sanitize(options?.headerText);
      const footerText = this.sanitize(options?.footerText || 'Shift closed successfully.');
      const businessAddressLine1 = this.sanitize(options?.businessAddressLine1);
      const businessAddressLine2 = this.sanitize(options?.businessAddressLine2);
      const businessPhone = this.sanitize(options?.businessPhone);
      const openedAt = new Date(shift.openedAt);
      const closedAt = new Date(shift.closedAt);
      const durationMinutes = Math.max(0, Math.round((closedAt.getTime() - openedAt.getTime()) / 60000));
      const durationHours = Math.floor(durationMinutes / 60);
      const remainingMinutes = durationMinutes % 60;
      const durationLabel = `${durationHours}h ${remainingMinutes}m`;
      const fmtMoney = (amount: number) => `${currencySymbol}${this.formatPrice(amount)}`;

      r.init();
      if (options?.printDensity) r.density(options.printDensity);

      r.align('center').bold(true).size(2, 2).line(businessName).normalSize().bold(false);
      if (businessAddressLine1) r.line(businessAddressLine1);
      if (businessAddressLine2) r.line(businessAddressLine2);
      if (businessPhone) r.line(businessPhone);
      if (headerText) {
        r.feed(1);
        r.line(headerText);
      }

      r.thickSeparator();
      r.align('center').bold(true).size(1, 2).line('SHIFT CLOSE').normalSize().bold(false);
      r.align('left').separator();
      r.columns2('Shift ID', this.sanitize(shift.shiftId) || '-');
      r.columns2('Cashier', this.sanitize(shift.cashierName) || '-');
      r.columns2('Opened', `${this.formatDate(openedAt)} ${this.formatTime(openedAt)}`);
      r.columns2('Closed', `${this.formatDate(closedAt)} ${this.formatTime(closedAt)}`);
      r.columns2('Duration', durationLabel);

      r.separator();
      r.bold(true).line('SALES BREAKDOWN').bold(false);
      r.columns2('Cash Sales', fmtMoney(shift.totalCashSales));
      r.columns2('Card Sales', fmtMoney(shift.totalCardSales));
      r.columns2('QR Sales', fmtMoney(shift.totalQrSales));
      r.columns2('Other Sales', fmtMoney(shift.totalOtherSales));
      r.columns2('Orders', String(shift.totalOrders || 0));
      if ((shift.totalRefunds || 0) > 0) {
        r.columns2('Refunds', fmtMoney(shift.totalRefunds || 0));
      }

      r.separator();
      r.bold(true).size(1, 2);
      r.columns2('TOTAL SALES', fmtMoney(shift.totalSales));
      r.normalSize().bold(false);

      r.separator();
      r.bold(true).line('CASH DRAWER').bold(false);
      r.columns2('Opening Amount', fmtMoney(shift.openingAmount));
      r.columns2('Expected Close', fmtMoney(shift.expectedClosingAmount));
      r.columns2('Actual Close', fmtMoney(shift.actualClosingAmount));
      r.bold(true);
      r.columns2(
        shift.difference === 0 ? 'Balanced' : shift.difference > 0 ? 'Overage' : 'Shortage',
        `${shift.difference > 0 ? '+' : ''}${fmtMoney(shift.difference)}`,
      );
      r.bold(false);

      if (shift.closeNote && this.sanitize(shift.closeNote)) {
        r.separator();
        r.bold(true).line('NOTE').bold(false);
        r.line(this.sanitize(shift.closeNote));
      }

      r.thickSeparator();
      r.align('center').line(footerText);
      r.align('left').feed(4);
      if (options?.autoCut !== false) r.cut();

      await this.writeData(r.encode());
      await new Promise(resolve => setTimeout(resolve, 2500));
      this.lastPrintTime = Date.now();
      return true;
    } catch (error) {
      console.error('Shift print error:', error);
      return false;
    } finally {
      this.isPrinting = false;
    }
  }


  // ─── Reprint & Drawer ──────────────────────────────────────────────────

  async reprintLast(): Promise<boolean> {
    if (!this.lastPrintedOrder || !this.lastPrintedRestaurant) {
      throw new Error('No previous receipt to reprint');
    }
    return this.printReceipt(this.lastPrintedOrder, this.lastPrintedRestaurant, this.lastPrintedOptions);
  }

  hasLastReceipt(): boolean {
    return !!this.lastPrintedOrder;
  }

  async openDrawer(pin: 0 | 1 = 0): Promise<boolean> {
    try {
      if (!await this.ensureConnection()) throw new Error('Printer not connected');
      if (!this.characteristic) throw new Error('No writable characteristic');

      const r = new EscPosBuilder();
      r.openDrawer(pin);
      await this.writeData(r.encode());
      return true;
    } catch (error) {
      console.error('Open drawer error:', error);
      return false;
    }
  }

  async beep(): Promise<boolean> {
    try {
      if (!await this.ensureConnection()) throw new Error('Printer not connected');
      if (!this.characteristic) throw new Error('No writable characteristic');

      const r = new EscPosBuilder();
      r.beep();
      await this.writeData(r.encode());
      return true;
    } catch (error) {
      console.error('Beep error:', error);
      return false;
    }
  }
}

export default new PrinterService();
