// services/printerService.ts
// Loyverse-style printer service — simplified interface, same BLE + ESC/POS core.

import EscPosEncoder from 'esc-pos-encoder';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PrinterDevice {
  id: string;
  name: string;
}

export type PaperSize = '58mm' | '80mm';
export type ConnectionType = 'bluetooth' | 'wifi' | 'usb';
export type PrintDensity = 'light' | 'medium' | 'dark';
export type PrintJobType = 'receipt' | 'kitchen';

/** Loyverse-style saved printer config */
export interface SavedPrinter {
  id: string;
  name: string;
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
}

/** Receipt content configuration */
export interface ReceiptConfig {
  businessName: string;
  businessAddress: string;
  businessPhone: string;
  headerText: string;
  footerText: string;
  showOrderNumber: boolean;
  showCashierName: boolean;
  showDateTime: boolean;
  showCustomerName: boolean;
  showTableNumber: boolean;
  showItems: boolean;
  showRemark: boolean;
  showTotal: boolean;
  showTaxes: boolean;
  showOrderSource: boolean;
  autoPrintAfterSale: boolean;
  printReceiptForRefund: boolean;
  openCashDrawerOnPayment: boolean;
}

/** Kitchen ticket config */
export interface KitchenTicketConfig {
  printLargeOrderNumber: boolean;
  numberOfCopies: number;
  autoPrintOnNewOrder: boolean;
}

export interface ReceiptPrintOptions {
  showDateTime?: boolean;
  showOrderId?: boolean;
  showTableNumber?: boolean;
  showItems?: boolean;
  showRemark?: boolean;
  showTotal?: boolean;
  headerText?: string;
  footerText?: string;
  businessAddress?: string;
  businessPhone?: string;
  autoOpenDrawer?: boolean;
  paperSize?: PaperSize;
  printDensity?: PrintDensity;
  autoCut?: boolean;
  showOrderSource?: boolean;
  showCashierName?: boolean;
  cashierName?: string;
  showTaxes?: boolean;
  taxes?: Array<{ name: string; amount: number }>;
}

// ─── Defaults ───────────────────────────────────────────────────────────────

export const DEFAULT_RECEIPT_CONFIG: ReceiptConfig = {
  businessName: '',
  businessAddress: '',
  businessPhone: '',
  headerText: '',
  footerText: 'Thank you! Please come again.',
  showOrderNumber: true,
  showCashierName: false,
  showDateTime: true,
  showCustomerName: false,
  showTableNumber: true,
  showItems: true,
  showRemark: true,
  showTotal: true,
  showTaxes: false,
  showOrderSource: false,
  autoPrintAfterSale: false,
  printReceiptForRefund: false,
  openCashDrawerOnPayment: false,
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
    connectionType: 'bluetooth',
    paperSize: '58mm',
    printDensity: 'medium',
    autoCut: true,
    cashDrawer: false,
    printJobs: ['receipt'],
    kitchenCategories: [],
    numberOfCopies: 1,
  };
}

// ─── Printer Service ────────────────────────────────────────────────────────

class PrinterService {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private service: BluetoothRemoteGATTService | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private encoder: EscPosEncoder;
  private readonly bleChunkSize: number = 180;
  private isPrinting: boolean = false;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private lastPrintTime: number = 0;
  private connectionPromise: Promise<boolean> | null = null;
  private disconnectRequested: boolean = false;

  private lastPrintedOrder: any = null;
  private lastPrintedRestaurant: any = null;
  private lastPrintedOptions: ReceiptPrintOptions | undefined = undefined;

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
  private maxQueueSize: number = 50;

  constructor() {
    this.encoder = new EscPosEncoder();
  }

  // ─── Connection ─────────────────────────────────────────────────────────

  async scanForPrinters(): Promise<PrinterDevice[]> {
    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', '00001800-0000-1000-8000-00805f9b34fb']
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
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', '00001800-0000-1000-8000-00805f9b34fb']
      });

      this.device.addEventListener('gattserverdisconnected', () => {
        if (!this.disconnectRequested) {
          this.server = null;
          this.service = null;
          this.characteristic = null;
        }
      });

      const server = await this.device.gatt?.connect();
      if (!server) throw new Error('Failed to connect to GATT server');
      this.server = server;

      try {
        this.service = await this.server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
      } catch {
        try {
          this.service = await this.server.getPrimaryService('00001800-0000-1000-8000-00805f9b34fb');
        } catch {
          throw new Error('Could not find printer service');
        }
      }

      const characteristics = await this.service.getCharacteristics();
      for (const char of characteristics) {
        if (char.properties.writeWithoutResponse) { this.characteristic = char; break; }
        else if (char.properties.write) { this.characteristic = char; }
      }
      if (!this.characteristic) throw new Error('No writable characteristic found');

      this.startKeepAlive();
      return true;
    } catch (error) {
      console.error('Connection error:', error);
      await this.cleanup();
      return false;
    }
  }

  async autoReconnect(deviceName: string): Promise<boolean> {
    if (this.isConnected()) return true;

    try {
      const bluetooth = (navigator as any).bluetooth;
      if (!bluetooth || typeof bluetooth.getDevices !== 'function') return false;

      const devices: BluetoothDevice[] = await bluetooth.getDevices();
      const target = devices.find((d: BluetoothDevice) => d.name === deviceName);
      if (!target) return false;

      const connectToDevice = async (): Promise<boolean> => {
        try {
          this.device = target;
          this.disconnectRequested = false;

          this.device.addEventListener('gattserverdisconnected', () => {
            if (!this.disconnectRequested) {
              this.server = null;
              this.service = null;
              this.characteristic = null;
            }
          });

          const server = await this.device.gatt?.connect();
          if (!server) throw new Error('Failed to connect to GATT server');
          this.server = server;

          try {
            this.service = await this.server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
          } catch {
            try {
              this.service = await this.server.getPrimaryService('00001800-0000-1000-8000-00805f9b34fb');
            } catch {
              throw new Error('Could not find printer service');
            }
          }

          const characteristics = await this.service.getCharacteristics();
          for (const char of characteristics) {
            if (char.properties.writeWithoutResponse) { this.characteristic = char; break; }
            else if (char.properties.write) { this.characteristic = char; }
          }
          if (!this.characteristic) throw new Error('No writable characteristic found');

          this.startKeepAlive();
          return true;
        } catch (error) {
          console.error('Auto-reconnect GATT error:', error);
          await this.cleanup();
          this.device = null;
          return false;
        }
      };

      const directResult = await connectToDevice();
      if (directResult) return true;

      if (typeof (target as any).watchAdvertisements === 'function') {
        const abortController = new AbortController();
        return new Promise<boolean>((resolve) => {
          const timeout = setTimeout(() => { abortController.abort(); resolve(false); }, 5000);
          target.addEventListener('advertisementreceived', async () => {
            clearTimeout(timeout);
            abortController.abort();
            resolve(await connectToDevice());
          }, { once: true });
          (target as any).watchAdvertisements({ signal: abortController.signal }).catch(() => {
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
    return this.server?.connected || false;
  }

  async disconnect() {
    this.disconnectRequested = true;
    this.stopKeepAlive();
    this.clearQueue();
    if (this.device) this.device.removeEventListener('gattserverdisconnected', () => {});
    try { if (this.server?.connected) await this.server.disconnect(); } catch {}
    await this.cleanup();
    this.device = null;
  }

  getConnectionStatus() {
    return {
      connected: this.isConnected(),
      deviceName: this.device?.name,
      hasCharacteristic: !!this.characteristic,
      isPrinting: this.isPrinting,
      isProcessingQueue: this.isProcessingQueue,
      queueSize: this.printQueue.length,
      lastPrintTime: this.lastPrintTime,
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
    if (this.keepAliveInterval) { clearInterval(this.keepAliveInterval); this.keepAliveInterval = null; }
  }

  private async cleanup() {
    this.stopKeepAlive();
    this.server = null;
    this.service = null;
    this.characteristic = null;
  }

  // ─── Write Helpers ──────────────────────────────────────────────────────

  private async writeDataInChunks(data: Uint8Array): Promise<void> {
    if (!this.characteristic) throw new Error('No writable characteristic found');
    for (let i = 0; i < data.length; i += this.bleChunkSize) {
      const chunk = data.slice(i, i + this.bleChunkSize);
      await this.characteristic.writeValue(chunk as BufferSource);
      await new Promise(resolve => setTimeout(resolve, 15));
    }
  }

  private async resetPrinterFormattingState(): Promise<void> {
    if (!this.characteristic) throw new Error('No writable characteristic found');
    const reset = new Uint8Array([0x1B, 0x40, 0x1B, 0x61, 0x00]);
    await this.characteristic.writeValue(reset);
    await new Promise(resolve => setTimeout(resolve, 30));
  }

  private stripLeadingInitialize(data: Uint8Array): Uint8Array {
    if (data.length >= 2 && data[0] === 0x1B && data[1] === 0x40) return data.slice(2);
    return data;
  }

  private async writePreparedPayload(data: Uint8Array): Promise<void> {
    await this.resetPrinterFormattingState();
    await this.writeDataInChunks(this.stripLeadingInitialize(data));
  }

  async ensureConnection(): Promise<boolean> {
    if (this.isConnected() && this.characteristic) return true;
    if (this.device && !this.disconnectRequested) {
      try {
        const server = await this.device.gatt?.connect();
        if (server) {
          this.server = server;
          try {
            this.service = await this.server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
          } catch {
            this.service = await this.server.getPrimaryService('00001800-0000-1000-8000-00805f9b34fb');
          }
          if (!this.service) throw new Error('Could not find printer service');
          const characteristics = await this.service.getCharacteristics();
          for (const char of characteristics) {
            if (char.properties.writeWithoutResponse || char.properties.write) {
              this.characteristic = char;
              break;
            }
          }
          if (!this.characteristic) throw new Error('No writable characteristic found');
          this.startKeepAlive();
          return true;
        }
      } catch (error) {
        console.error('Reconnection failed:', error);
      }
    }
    return false;
  }

  // ─── Text Helpers ───────────────────────────────────────────────────────

  private sanitizeText(text: any): string {
    if (text === null || text === undefined) return '';
    return String(text)
      .replace(/[^\x20-\x7E\n\r\t\s]/g, '')
      .replace(/[™®©]/g, '')
      .replace(/[^\w\s\-.,!?$%&*()@#\/\\:]/g, '')
      .trim();
  }

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
    return safe.length > width ? safe.slice(0, width) : safe;
  }

  private centerText(text: string, lineWidth: number): string {
    if (text.length >= lineWidth) return text;
    const leftPad = Math.floor((lineWidth - text.length) / 2);
    return ' '.repeat(leftPad) + text;
  }

  private getColumns(paperSize: PaperSize): number {
    return paperSize === '80mm' ? 42 : 32;
  }

  // ─── Queue ──────────────────────────────────────────────────────────────

  clearQueue(): void {
    this.printQueue.forEach(job => job.reject(new Error('Queue cleared')));
    this.printQueue = [];
  }

  getQueueSize(): number { return this.printQueue.length; }
  isBusy(): boolean { return this.isPrinting || this.isProcessingQueue || this.printQueue.length > 0; }

  private async processNextJob(): Promise<void> {
    if (this.isProcessingQueue || this.printQueue.length === 0) return;
    this.isProcessingQueue = true;

    while (this.printQueue.length > 0) {
      const job = this.printQueue[0];
      try {
        if (!await this.ensureConnection()) throw new Error('Printer disconnected');
        if (!this.characteristic) throw new Error('Lost connection');

        const success = await this.executePrint(job.order, job.restaurant, job.options);
        if (success) {
          if (job.options?.autoOpenDrawer) await this.openDrawer();
          job.resolve(true);
        } else {
          job.reject(new Error('Print failed'));
        }
        this.printQueue.shift();
        if (this.printQueue.length > 0) await new Promise(r => setTimeout(r, 2000));
      } catch (error) {
        job.reject(error);
        this.printQueue.shift();
        await new Promise(r => setTimeout(r, 3000));
      }
    }
    this.isProcessingQueue = false;
  }

  // ─── Print Operations ───────────────────────────────────────────────────

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
      this.processNextJob();
    });
  }

  private async executePrint(order: any, restaurant: any, options?: ReceiptPrintOptions): Promise<boolean> {
    try {
      const paperSize = options?.paperSize || '58mm';
      const cols = this.getColumns(paperSize);
      const orderDate = new Date(order.timestamp);
      const dateStr = this.formatDate(orderDate);
      const timeStr = this.formatTime(orderDate);

      const safeBusinessName = this.sanitizeText(restaurant?.name) || 'RESTAURANT';
      const safeOrderId = this.sanitizeText(order.id) || 'ORDER';
      const safeTableNumber = this.sanitizeText(order.tableNumber) || '0';
      const safeRemark = this.sanitizeText(order.remark);
      const safeHeaderText = this.sanitizeText(options?.headerText || '');
      const safeFooterText = this.sanitizeText(options?.footerText || 'Thank you! Please come again.');
      const safeBusinessAddress = this.sanitizeText(options?.businessAddress || '');
      const safeBusinessPhone = this.sanitizeText(options?.businessPhone || '');

      const showDateTime = options?.showDateTime !== false;
      const showOrderId = options?.showOrderId !== false;
      const showTableNumber = options?.showTableNumber !== false;
      const showItems = options?.showItems !== false;
      const showRemark = options?.showRemark !== false;
      const showTotal = options?.showTotal !== false;

      let receipt = this.encoder.initialize();

      // ── Business Name (large, centered, bold) ──
      receipt = receipt.align('center').bold(true).size(2, 2);
      receipt = receipt.line(this.truncateText(safeBusinessName, Math.floor(cols / 2)));
      receipt = receipt.size(1, 1).bold(false);

      // ── Business Address & Phone ──
      if (safeBusinessAddress) receipt = receipt.line(this.truncateText(safeBusinessAddress, cols));
      if (safeBusinessPhone) receipt = receipt.line(this.truncateText(safeBusinessPhone, cols));

      // ── Header ──
      if (safeHeaderText) receipt = receipt.line(this.truncateText(safeHeaderText, cols));

      // ── Separator ──
      receipt = receipt.align('left').line('='.repeat(cols));

      // ── Date/Time ──
      if (showDateTime) receipt = receipt.line(`${dateStr} ${timeStr}`);

      // ── Order ID ──
      if (showOrderId) receipt = receipt.line(`#${safeOrderId}`);

      // ── Order Source ──
      if (options?.showOrderSource && order.orderSource) {
        const sourceLabel = order.orderSource === 'counter' ? 'Counter'
          : order.orderSource === 'qr_order' ? 'QR Order'
          : order.orderSource === 'online' ? 'Online'
          : order.orderSource === 'tableside' ? 'Tableside'
          : order.orderSource;
        receipt = receipt.line(`Source: ${sourceLabel}`);
      }

      // ── Cashier Name ──
      if (options?.showCashierName && options.cashierName) {
        receipt = receipt.line(`Cashier: ${this.sanitizeText(options.cashierName)}`);
      }

      // ── Table Number (large, bold) ──
      if (showTableNumber && order.tableNumber) {
        receipt = receipt.line('');
        receipt = receipt.bold(true).size(1, 2);
        receipt = receipt.line(safeTableNumber);
        receipt = receipt.size(1, 1).bold(false);
      }

      // ── Sub-separator ──
      receipt = receipt.line('-'.repeat(cols));

      // ── Items ──
      if (showItems && order.items && Array.isArray(order.items) && order.items.length > 0) {
        order.items.forEach((item: any) => {
          const safeItemName = this.sanitizeText(item.name) || 'ITEM';
          const quantity = item.quantity || 1;
          const itemPrice = this.formatPrice(item.price ? item.price * quantity : 0);

          const leftPart = `${quantity}x ${safeItemName}`;
          const rightPart = `RM${itemPrice}`;
          const space = Math.max(1, cols - leftPart.length - rightPart.length);
          receipt = receipt.line(leftPart + ' '.repeat(space) + rightPart);

          if (item.selectedSize) {
            const s = this.sanitizeText(item.selectedSize);
            if (s) receipt = receipt.line(`  -Size: ${s}`);
          }
          if (item.selectedTemp) {
            const s = this.sanitizeText(item.selectedTemp);
            if (s) receipt = receipt.line(`  -Temp: ${s}`);
          }
          if (item.selectedOtherVariant) {
            const s = this.sanitizeText(item.selectedOtherVariant);
            const label = this.sanitizeText(item.otherVariantName) || 'Variant';
            if (s) receipt = receipt.line(`  -${label}: ${s}`);
          }
          if (item.selectedVariantOption) {
            const s = this.sanitizeText(item.selectedVariantOption);
            if (s) receipt = receipt.line(`  -Variant: ${s}`);
          }

          if (item.selectedAddOns && Array.isArray(item.selectedAddOns)) {
            item.selectedAddOns.forEach((addon: any) => {
              const addonName = this.sanitizeText(addon.name) || 'ADDON';
              const addonQty = addon.quantity || 1;
              receipt = receipt.line(addonQty > 1 ? `  -${addonName} x${addonQty}` : `  -${addonName}`);
            });
          }
        });
        receipt = receipt.line('');
      } else {
        receipt = receipt.line(showItems ? 'No items' : 'Items hidden').line('');
      }

      // ── Remark ──
      if (showRemark && safeRemark) {
        receipt = receipt.line('-'.repeat(cols));
        receipt = receipt.line('Note:');
        receipt = receipt.line(safeRemark).line('');
      }

      // ── Taxes ──
      if (options?.showTaxes && options.taxes && options.taxes.length > 0) {
        receipt = receipt.line('-'.repeat(cols));
        options.taxes.forEach(tax => {
          const taxLabel = this.sanitizeText(tax.name);
          const taxAmount = this.formatPrice(tax.amount);
          const space = Math.max(1, cols - taxLabel.length - taxAmount.length);
          receipt = receipt.line(taxLabel + ' '.repeat(space) + taxAmount);
        });
      }

      // ── Sub-separator ──
      receipt = receipt.line('-'.repeat(cols));

      // ── Total (bold, large) ──
      if (showTotal) {
        receipt = receipt.bold(true).size(1, 2);
        receipt = receipt.line(`TOTAL: RM ${this.formatPrice(order.total)}`);
        receipt = receipt.size(1, 1).bold(false);
      }

      // ── Separator ──
      receipt = receipt.line('='.repeat(cols));

      // ── Footer ──
      if (safeFooterText) {
        receipt = receipt.align('center');
        receipt = receipt.line(this.truncateText(safeFooterText, cols));
      }

      // ── Feed & Cut ──
      receipt = receipt.align('left').newline().newline();
      if (options?.autoCut !== false) receipt = receipt.cut();

      const data = receipt.encode() as Uint8Array;
      await this.writePreparedPayload(data);
      await new Promise(resolve => setTimeout(resolve, 3000));

      this.lastPrintedOrder = { ...order };
      this.lastPrintedRestaurant = { ...restaurant };
      this.lastPrintedOptions = options ? { ...options } : undefined;
      this.lastPrintTime = Date.now();

      return true;
    } catch (error) {
      console.error('Execute print error:', error);
      try { if (this.characteristic) await this.resetPrinterFormattingState(); } catch {}
      return false;
    }
  }

  async printTestPage(businessName?: string, paperSize?: PaperSize): Promise<boolean> {
    if (this.isPrinting) {
      return new Promise((resolve, reject) => {
        this.printQueue.push({
          id: `test-${Date.now()}`,
          order: { id: 'TEST', tableNumber: 'TEST', timestamp: Date.now(), total: 0, items: [], remark: '' },
          restaurant: { name: businessName || 'QUICKSERVE' },
          resolve, reject, timestamp: Date.now(),
        });
        this.processNextJob();
      });
    }

    this.isPrinting = true;
    try {
      if (!await this.ensureConnection()) throw new Error('Printer not connected');
      if (!this.characteristic) throw new Error('No writable characteristic found');

      const cols = this.getColumns(paperSize || '58mm');
      const now = new Date();
      const safeName = this.sanitizeText(businessName || 'QUICKSERVE') || 'QUICKSERVE';

      const data = this.encoder
        .initialize()
        .align('center')
        .size(2, 2)
        .line(this.truncateText(safeName, Math.floor(cols / 2)))
        .size(1, 1)
        .line('')
        .align('left')
        .line('='.repeat(cols))
        .align('center')
        .line('TEST PAGE')
        .line('')
        .line(`${this.formatDate(now)} ${this.formatTime(now)}`)
        .line('')
        .line('Printer is working!')
        .line('='.repeat(cols))
        .align('left')
        .newline()
        .cut()
        .encode() as Uint8Array;

      await this.writePreparedPayload(data);
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

  async printKitchenTicket(order: any, restaurant: any, config?: KitchenTicketConfig, paperSize?: PaperSize): Promise<boolean> {
    try {
      if (!await this.ensureConnection()) throw new Error('Printer not connected');
      if (!this.characteristic) throw new Error('No writable characteristic found');

      const cols = this.getColumns(paperSize || '58mm');
      const orderDate = new Date(order.timestamp);
      const safeOrderId = this.sanitizeText(order.id) || 'ORDER';
      const safeTableNumber = this.sanitizeText(order.tableNumber) || '';

      let ticket = this.encoder.initialize();

      ticket = ticket.align('center').bold(true);
      ticket = ticket.line('*** KITCHEN ORDER ***');
      ticket = ticket.bold(false);
      ticket = ticket.line('='.repeat(cols));

      if (config?.printLargeOrderNumber !== false) {
        ticket = ticket.size(2, 2).bold(true);
        ticket = ticket.line(`#${this.truncateText(safeOrderId, Math.floor(cols / 2))}`);
        ticket = ticket.size(1, 1).bold(false);
      } else {
        ticket = ticket.bold(true).line(`#${safeOrderId}`).bold(false);
      }

      if (safeTableNumber) {
        ticket = ticket.bold(true).size(1, 2);
        ticket = ticket.line(`Table: ${safeTableNumber}`);
        ticket = ticket.size(1, 1).bold(false);
      }

      ticket = ticket.align('left');
      ticket = ticket.line(`${this.formatDate(orderDate)} ${this.formatTime(orderDate)}`);
      ticket = ticket.line('-'.repeat(cols));

      if (order.items && Array.isArray(order.items)) {
        order.items.forEach((item: any) => {
          const name = this.sanitizeText(item.name) || 'ITEM';
          const qty = item.quantity || 1;
          ticket = ticket.bold(true).line(`${qty}x ${name}`).bold(false);

          if (item.selectedSize) ticket = ticket.line(`  -Size: ${this.sanitizeText(item.selectedSize)}`);
          if (item.selectedTemp) ticket = ticket.line(`  -Temp: ${this.sanitizeText(item.selectedTemp)}`);
          if (item.selectedOtherVariant) {
            const label = this.sanitizeText(item.otherVariantName) || 'Variant';
            ticket = ticket.line(`  -${label}: ${this.sanitizeText(item.selectedOtherVariant)}`);
          }
          if (item.selectedVariantOption) ticket = ticket.line(`  -Variant: ${this.sanitizeText(item.selectedVariantOption)}`);
          if (item.selectedAddOns && Array.isArray(item.selectedAddOns)) {
            item.selectedAddOns.forEach((addon: any) => {
              const n = this.sanitizeText(addon.name) || 'ADDON';
              const q = addon.quantity || 1;
              ticket = ticket.line(q > 1 ? `  -${n} x${q}` : `  -${n}`);
            });
          }
          ticket = ticket.line('');
        });
      }

      if (order.remark) {
        const safeRemark = this.sanitizeText(order.remark);
        if (safeRemark) {
          ticket = ticket.line('-'.repeat(cols));
          ticket = ticket.bold(true).line('Note:').bold(false);
          ticket = ticket.line(safeRemark);
        }
      }

      ticket = ticket.line('='.repeat(cols));
      ticket = ticket.newline().newline().cut();

      const data = ticket.encode() as Uint8Array;
      await this.writePreparedPayload(data);
      await new Promise(resolve => setTimeout(resolve, 3000));
      return true;
    } catch (error) {
      console.error('Kitchen ticket print error:', error);
      return false;
    }
  }

  async reprintLast(): Promise<boolean> {
    if (!this.lastPrintedOrder || !this.lastPrintedRestaurant) {
      throw new Error('No previous receipt to reprint');
    }
    return this.printReceipt(this.lastPrintedOrder, this.lastPrintedRestaurant, this.lastPrintedOptions);
  }

  hasLastReceipt(): boolean {
    return !!this.lastPrintedOrder;
  }

  async openDrawer(pin: number = 0, onMs: number = 120, offMs: number = 240): Promise<boolean> {
    try {
      if (!await this.ensureConnection()) throw new Error('Printer not connected');
      if (!this.characteristic) throw new Error('No writable characteristic found');

      const pinVal = Math.max(0, Math.min(1, pin));
      const t1 = Math.max(1, Math.min(255, Math.floor(onMs / 2)));
      const t2 = Math.max(1, Math.min(255, Math.floor(offMs / 2)));
      const cmd = new Uint8Array([0x1B, 0x70, pinVal, t1, t2]);
      await this.writeDataInChunks(cmd);
      return true;
    } catch (error) {
      console.error('Open drawer error:', error);
      return false;
    }
  }
}

export default new PrinterService();
