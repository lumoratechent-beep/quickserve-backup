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
  drawerCommands?: string;
  autoOpenDrawer?: boolean;
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

      // === FIXED STANDARD RECEIPT LAYOUT ===
      // All lines use align('left') - centering done via space padding
      // because ESC/POS align('center') shifts right on some printers

      // Company Name (centered manually, double size = 16 chars per line)
      let receipt = this.encoder
        .initialize()
        .align('left')
        .size(2, 2)
        .line(this.centerText(this.truncateText(safeRestaurantName, 16), 16))
        .size(1, 1);

      // Header lines (centered manually, normal size = 32 chars per line)
      if (safeHeaderLine1) {
        receipt = receipt.line(this.centerText(this.truncateText(safeHeaderLine1, this.charsPerLine), this.charsPerLine));
      }
      if (safeHeaderLine2) {
        receipt = receipt.line(this.centerText(this.truncateText(safeHeaderLine2, this.charsPerLine), this.charsPerLine));
      }

      // Full double separator
      receipt = receipt
        .align('left')
        .line('='.repeat(32));

      // Date (left)
      if (showDateTime) {
        receipt = receipt.line(`${dateStr} ${timeStr}`);
      }

      // Order ID (left)
      if (showOrderId) {
        receipt = receipt.line(`#${safeOrderId}`);
      }

      // Space + Table No (left) - EMPHASIZED
      if (showTableNumber && order.tableNumber) {
        receipt = receipt
          .line('')
          .size(1, 2)
          .line(`Table: ${safeTableNumber}`)
          .size(1, 1);
      }

      // Full single separator
      receipt = receipt.line('-'.repeat(32));

      // Items (left)
      if (showItems && order.items && Array.isArray(order.items) && order.items.length > 0) {
        order.items.forEach((item: any) => {
          const safeItemName = this.sanitizeText(item.name) || 'ITEM';
          const quantity = item.quantity || 1;
          const itemPrice = this.formatPrice(item.price ? item.price * quantity : 0);

          // quantity x name  RM price
          const leftPart = `${quantity}x ${safeItemName}`;
          const rightPart = `RM${itemPrice}`;
          const spaceBetween = Math.max(1, this.charsPerLine - leftPart.length - rightPart.length);
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

      // Remark if present
      if (showRemark && safeRemark) {
        receipt = receipt
          .line('-'.repeat(32))
          .line('Note:')
          .line(safeRemark)
          .line('');
      }

      // Full single separator
      receipt = receipt.line('-'.repeat(32));

      // Total (left)
      if (showTotal) {
        const safeTotal = this.formatPrice(order.total);
        receipt = receipt.line(`TOTAL: RM ${safeTotal}`);
      }

      // Full double separator
      receipt = receipt.line('='.repeat(32));

      // Footer lines (centered manually)
      if (safeFooterLine1) {
        receipt = receipt.line(this.centerText(this.truncateText(safeFooterLine1, this.charsPerLine), this.charsPerLine));
      }
      if (safeFooterLine2) {
        receipt = receipt.line(this.centerText(this.truncateText(safeFooterLine2, this.charsPerLine), this.charsPerLine));
      }

      receipt = receipt
        .newline()
        .newline()
        .cut();

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
   * Open the cash drawer using either custom commands or default ESC/POS command
   * @param drawerCommands Optional custom ESC/POS commands as hex string (e.g., "1B7030304278" for standard drawer)
   */
  async openDrawer(drawerCommands?: string): Promise<boolean> {
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
      // ESC p m t1 t2 (0x1B 0x70 0x00 0x30 0x78 or similar)
      // Standard: 0x1B 0x70 = ESC p, followed by 0x00 (mode) and 0x30 0x78 (timing)
      const defaultDrawerCommand = new Uint8Array([0x1B, 0x70, 0x00, 0x30, 0x78]);
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
