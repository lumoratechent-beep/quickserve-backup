// services/printerService.ts

import EscPosEncoder from 'esc-pos-encoder';

export interface PrinterDevice {
  id: string;
  name: string;
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
  horizontalOffset?: number;
  businessNameAlign?: 'left' | 'center' | 'right';
  headerLine1Align?: 'left' | 'center' | 'right';
  headerLine2Align?: 'left' | 'center' | 'right';
  footerLine1Align?: 'left' | 'center' | 'right';
  footerLine2Align?: 'left' | 'center' | 'right';
  totalAlign?: 'left' | 'center' | 'right';
}

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
  private readonly charsPerLine: number = 32;
  private readonly bleChunkSize: number = 180;
  private readonly fontACharWidthDots: number = 12;
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
  
  // Print queue system
  private printQueue: PrintJob[] = [];
  private isProcessingQueue: boolean = false;
  private maxQueueSize: number = 50; // Prevent memory issues

  constructor() {
    this.encoder = new EscPosEncoder();
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

  /**
   * Generate a centered separator line (respects thermal printer width)
   * Font A (default): 32 chars per 80mm line
   * Font A double-width (size 2x): ~16 chars per line
   */
  private createSeparator(doubleSized: boolean = false): string {
    // Font A: 32 chars, Font A double-size: ~16 chars
    const width = doubleSized ? 16 : this.charsPerLine;
    return '='.repeat(width);
  }

  private truncateText(text: string, width: number): string {
    const safe = this.sanitizeText(text || '');
    if (!safe) return '';
    return safe.length > width ? safe.slice(0, width) : safe;
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

  private async writePreparedPayload(data: Uint8Array, offsetChars: number): Promise<void> {
    const payload = this.stripLeadingInitialize(data);
    await this.resetPrinterFormattingState(offsetChars);
    await this.writeDataInChunks(payload);
  }

  private async resetPrinterFormattingState(offsetChars: number = 0): Promise<void> {
    if (!this.characteristic) {
      throw new Error('No writable characteristic found');
    }

    // Only reset and align - NO global margin (GS L)
    // Margin is applied selectively to center/right aligned lines only via padding
    const reset = new Uint8Array([0x1B, 0x40]); // ESC @ - reset printer
    const alignLeft = new Uint8Array([0x1B, 0x61, 0x00]); // ESC a 0 - align left

    // Combine into single buffer
    const combinedBuffer = new Uint8Array(reset.length + alignLeft.length);
    combinedBuffer.set(reset, 0);
    combinedBuffer.set(alignLeft, reset.length);

    await this.characteristic.writeValue(combinedBuffer);
    await new Promise(resolve => setTimeout(resolve, 30));
  }

  /**
   * Helper: Center text with optional offset (calibration)
   * Offset shifts the centered text to the right
   */
  private centerTextWithOffset(text: string, width: number, offsetChars: number = 0): string {
    const normalizedOffset = Math.max(0, Math.min(16, Math.floor(offsetChars)));
    const padding = Math.max(0, width - text.length - normalizedOffset);
    const leftPad = Math.floor(padding / 2) + normalizedOffset;
    return ' '.repeat(leftPad) + text;
  }

  /**
   * Helper: Right-align text with optional offset (calibration)
   * Offset shifts the right-aligned text to the left (reduces right padding)
   */
  private rightAlignTextWithOffset(text: string, width: number, offsetChars: number = 0): string {
    const normalizedOffset = Math.max(0, Math.min(16, Math.floor(offsetChars)));
    const padding = Math.max(0, width - text.length);
    // Offset reduces the right padding, pulling text left
    const adjustedPadding = Math.max(0, padding - normalizedOffset);
    return ' '.repeat(adjustedPadding) + text;
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
      const horizontalOffset = Math.min(16, Math.max(0, Number(options?.horizontalOffset ?? 0)));
      const businessNameAlign = options?.businessNameAlign ?? 'center';
      const headerLine1Align = options?.headerLine1Align ?? 'center';
      const headerLine2Align = options?.headerLine2Align ?? 'center';
      const footerLine1Align = options?.footerLine1Align ?? 'center';
      const footerLine2Align = options?.footerLine2Align ?? 'center';
      const totalAlign = options?.totalAlign ?? 'right';

      // Start building receipt with printer reset
      // CRITICAL: Initialize and set alignment BEFORE any size changes
      let receipt = this.encoder
        .initialize() // ESC @ - reset printer
        .align('left') // Start with LEFT alignment (neutral state)
        .line(''); // Blank line to ensure printer state is clear

      // Business name section - centered with offset calibration
      receipt = receipt.size(2, 2);
      if (businessNameAlign === 'center') {
        const centeredName = this.centerTextWithOffset(this.truncateText(safeRestaurantName, 16), 16, horizontalOffset);
        receipt = receipt.align('left').line(centeredName);
      } else if (businessNameAlign === 'right') {
        const rightName = this.rightAlignTextWithOffset(this.truncateText(safeRestaurantName, 16), 16, horizontalOffset);
        receipt = receipt.align('left').line(rightName);
      } else {
        receipt = receipt.align('left').line(this.truncateText(safeRestaurantName, 16));
      }
      receipt = receipt.size(1, 1).line(''); // Blank line to reset state

      // Headers section - apply offset to center/right aligned  
      if (safeHeaderLine1) {
        const headerText1 = this.truncateText(safeHeaderLine1, this.charsPerLine);
        if (headerLine1Align === 'center') {
          receipt = receipt.align('left').line(this.centerTextWithOffset(headerText1, this.charsPerLine, horizontalOffset));
        } else if (headerLine1Align === 'right') {
          receipt = receipt.align('left').line(this.rightAlignTextWithOffset(headerText1, this.charsPerLine, horizontalOffset));
        } else {
          receipt = receipt.align('left').line(headerText1);
        }
      }

      if (safeHeaderLine2) {
        const headerText2 = this.truncateText(safeHeaderLine2, this.charsPerLine);
        if (headerLine2Align === 'center') {
          receipt = receipt.line(this.centerTextWithOffset(headerText2, this.charsPerLine, horizontalOffset));
        } else if (headerLine2Align === 'right') {
          receipt = receipt.line(this.rightAlignTextWithOffset(headerText2, this.charsPerLine, horizontalOffset));
        } else {
          receipt = receipt.line(headerText2);
        }
      }

      // Double separator after header (fills full line)
      receipt = receipt
        .line('='.repeat(32))
        .line(''); // Blank line

      // Switch to LEFT alignment for content
      receipt = receipt.align('left');

      if (showDateTime || showOrderId) {
        if (showDateTime && showOrderId) {
          receipt = receipt.line(`${dateStr} ${timeStr} | #${safeOrderId}`);
        } else if (showDateTime) {
          receipt = receipt.line(`${dateStr} ${timeStr}`);
        } else {
          receipt = receipt.line(`#${safeOrderId}`);
        }
      }

      // Add table info if available
      if (showTableNumber && order.tableNumber) {
        receipt = receipt
          .line('')
          .line(`Table: ${safeTableNumber}`);
      }

      receipt = receipt.line('-'.repeat(32));

      // Process items safely
      if (showItems && order.items && Array.isArray(order.items) && order.items.length > 0) {
        order.items.forEach((item: any) => {
          // Sanitize item name
          const safeItemName = this.sanitizeText(item.name) || 'ITEM';
          const quantity = item.quantity || 1;
          
          receipt = receipt.line(`${quantity}x ${safeItemName}`);

          // Add size if present
          if (item.selectedSize) {
            const safeSize = this.sanitizeText(item.selectedSize);
            if (safeSize) receipt = receipt.line(`   ${safeSize}`);
          }

          // Add temperature if present
          if (item.selectedTemp) {
            const safeTemp = this.sanitizeText(item.selectedTemp);
            if (safeTemp) receipt = receipt.line(`   ${safeTemp}`);
          }

          // Add other variant if present
          if (item.selectedOtherVariant) {
            const safeVariant = this.sanitizeText(item.selectedOtherVariant);
            if (safeVariant) receipt = receipt.line(`   ${safeVariant}`);
          }

          // Add add-ons if present
          if (item.selectedAddOns && Array.isArray(item.selectedAddOns) && item.selectedAddOns.length > 0) {
            item.selectedAddOns.forEach((addon: any) => {
              const safeAddonName = this.sanitizeText(addon.name) || 'ADDON';
              const addonQty = addon.quantity || 1;
              if (addonQty > 1) {
                receipt = receipt.line(`   + ${safeAddonName} x${addonQty}`);
              } else {
                receipt = receipt.line(`   + ${safeAddonName}`);
              }
            });
          }

          receipt = receipt.line('');
        });
      } else {
        receipt = receipt.line(showItems ? 'No items' : 'Items hidden').line('');
      }

      // Add remark if present and sanitized
      if (showRemark && safeRemark) {
        receipt = receipt
          .line('-'.repeat(32))
          .line('Note:')
          .line(safeRemark)
          .line('');
      }

      // Calculate total safely
      const safeTotal = this.formatPrice(order.total);

      // Add total and footer
      receipt = receipt
        .align('left')
        .line('-'.repeat(32));

      if (showTotal) {
        // Format total with configurable alignment and offset
        const totalLabel = this.truncateText(`TOTAL: RM ${safeTotal}`, this.charsPerLine);
        if (totalAlign === 'center') {
          receipt = receipt.align('left').line(this.centerTextWithOffset(totalLabel, this.charsPerLine, horizontalOffset));
        } else if (totalAlign === 'right') {
          receipt = receipt.align('left').line(this.rightAlignTextWithOffset(totalLabel, this.charsPerLine, horizontalOffset));
        } else {
          receipt = receipt.align('left').line(totalLabel);
        }
      }

      // Double separator before footer (fills full line)
      receipt = receipt
        .align('left')
        .line('='.repeat(32))
        .line('');

      if (safeFooterLine1) {
        const footerText1 = this.truncateText(safeFooterLine1, this.charsPerLine);
        if (footerLine1Align === 'center') {
          receipt = receipt.align('left').line(this.centerTextWithOffset(footerText1, this.charsPerLine, horizontalOffset));
        } else if (footerLine1Align === 'right') {
          receipt = receipt.align('left').line(this.rightAlignTextWithOffset(footerText1, this.charsPerLine, horizontalOffset));
        } else {
          receipt = receipt.align('left').line(footerText1);
        }
      }

      if (safeFooterLine2) {
        const footerText2 = this.truncateText(safeFooterLine2, this.charsPerLine);
        if (footerLine2Align === 'center') {
          receipt = receipt.line(this.centerTextWithOffset(footerText2, this.charsPerLine, horizontalOffset));
        } else if (footerLine2Align === 'right') {
          receipt = receipt.line(this.rightAlignTextWithOffset(footerText2, this.charsPerLine, horizontalOffset));
        } else {
          receipt = receipt.line(footerText2);
        }
      }

      receipt = receipt
        .newline()
        .newline()
        .cut();

      const data = receipt.encode() as Uint8Array;

      await this.writePreparedPayload(data, horizontalOffset);
      
      // Wait for printer to completely finish processing
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      this.lastPrintTime = Date.now();
      console.log('Print successful');
      return true;
      
    } catch (error) {
      console.error('Execute print error:', error);
      
      // Try to reset printer even after error
      try {
        if (this.characteristic) {
          await this.resetPrinterFormattingState(0);
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
      const horizontalOffset = Math.min(16, Math.max(0, Number(options?.horizontalOffset ?? 0)));
      const businessNameAlign = options?.businessNameAlign ?? 'center';
      const headerLine1Align = options?.headerLine1Align ?? 'center';
      const totalAlign = options?.totalAlign ?? 'right';
      
      // Build test page with offset-aware alignment
      const truncatedName = this.truncateText(testBusinessName, 16);
      let testData = this.encoder
        .initialize()
        .align('left')
        .line('')
        .size(2, 2);
      
      // Apply centered business name with offset
      if (businessNameAlign === 'center') {
        testData = testData.line(this.centerTextWithOffset(truncatedName, 16, horizontalOffset));
      } else if (businessNameAlign === 'right') {
        testData = testData.line(this.rightAlignTextWithOffset(truncatedName, 16, horizontalOffset));
      } else {
        testData = testData.line(truncatedName);
      }
      
      testData = testData
        .size(1, 1)
        .line('')
        .line('='.repeat(32));
      
      // Apply centered test page header with offset
      const testPageText = 'TEST PAGE';
      if (headerLine1Align === 'center') {
        testData = testData.line(this.centerTextWithOffset(testPageText, 32, horizontalOffset));
      } else if (headerLine1Align === 'right') {
        testData = testData.line(this.rightAlignTextWithOffset(testPageText, 32, horizontalOffset));
      } else {
        testData = testData.align('left').line(testPageText);
      }
      
      testData = testData
        .align('left')
        .line('')
        .line(this.formatDate(now) + ' ' + this.formatTime(now))
        .line('');
      
      // Apply aligned result text with offset
      const resultText = 'Printer is working!';
      if (totalAlign === 'center') {
        testData = testData.line(this.centerTextWithOffset(resultText, 32, horizontalOffset));
      } else if (totalAlign === 'right') {
        testData = testData.line(this.rightAlignTextWithOffset(resultText, 32, horizontalOffset));
      } else {
        testData = testData.align('left').line(resultText);
      }
      
      const data = testData
        .line('='.repeat(32))
        .cut()
        .encode() as Uint8Array;

      await this.writePreparedPayload(data, horizontalOffset);
      
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

      await this.writePreparedPayload(data, 0);
      
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
