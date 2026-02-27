// services/printerService.ts

import EscPosEncoder from 'esc-pos-encoder';

export interface PrinterDevice {
  id: string;
  name: string;
}

class PrinterService {
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
      if (this.isConnected() && this.characteristic && !this.isPrinting) {
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

  private formatDate(date: Date): string {
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  async printTestPage(): Promise<boolean> {
    if (this.isPrinting) {
      return false;
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
      
      // Simple test page with only ASCII characters
      const data = this.encoder
        .initialize()
        .align('center')
        .size(2, 2)
        .line('QUICKSERVE')
        .size(1, 1)
        .line('='.repeat(32))
        .line('TEST PAGE')
        .line('')
        .line(this.formatDate(now) + ' ' + this.formatTime(now))
        .line('')
        .line('Printer is working!')
        .line('='.repeat(32))
        .cut()
        .encode();

      // Send data
      await this.characteristic.writeValue(data);
      
      // Wait for printer to finish
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Reset printer after test
      const resetPrinter = new Uint8Array([0x1B, 0x40]); // ESC @
      await this.characteristic.writeValue(resetPrinter);
      
      this.lastPrintTime = Date.now();
      return true;
      
    } catch (error) {
      console.error('Print test page error:', error);
      return false;
    } finally {
      this.isPrinting = false;
    }
  }

  async printReceipt(order: any, restaurant: any): Promise<boolean> {
    if (this.isPrinting) {
      console.log('Print already in progress');
      return false;
    }

    this.isPrinting = true;
    
    try {
      if (!await this.ensureConnection()) {
        throw new Error('Printer not connected');
      }

      if (!this.characteristic) {
        throw new Error('No writable characteristic found');
      }

      // Log the raw order data for debugging (remove in production)
      console.log('Printing order:', order.id);

      const orderDate = new Date(order.timestamp);
      const dateStr = this.formatDate(orderDate);
      const timeStr = this.formatTime(orderDate);

      // SANITIZE ALL TEXT INPUTS
      const safeRestaurantName = this.sanitizeText(restaurant?.name) || 'RESTAURANT';
      const safeOrderId = this.sanitizeText(order.id) || 'ORDER';
      const safeTableNumber = this.sanitizeText(order.tableNumber) || '0';
      const safeRemark = this.sanitizeText(order.remark);

      // Start building receipt with printer reset
      let receipt = this.encoder
        .initialize() // ESC @ - reset printer
        .align('center')
        .size(2, 2)
        .line(safeRestaurantName)
        .size(1, 1)
        .line('='.repeat(32))
        .align('left')
        .line(`${dateStr} ${timeStr} | #${safeOrderId}`);

      // Add table info if available
      if (order.tableNumber) {
        receipt = receipt
          .line('')
          .line(`Table: ${safeTableNumber}`);
      }

      receipt = receipt.line('-'.repeat(32));

      // Process items safely
      if (order.items && Array.isArray(order.items) && order.items.length > 0) {
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
        receipt = receipt.line('No items').line('');
      }

      // Add remark if present and sanitized
      if (safeRemark) {
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
        .line('-'.repeat(32))
        .align('right')
        .line(`TOTAL: RM ${safeTotal}`)
        .align('center')
        .line('='.repeat(32))
        .line('Thank you!')
        .line('Please come again')
        .newline()
        .newline()
        .cut();

      const data = receipt.encode();

      // Send the entire receipt in one go
      await this.characteristic.writeValue(data);
      
      // CRITICAL: Wait for printer to completely finish processing
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Send reset command to clear printer state
      const resetPrinter = new Uint8Array([0x1B, 0x40]); // ESC @
      await this.characteristic.writeValue(resetPrinter);
      
      // Wait again for reset to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      this.lastPrintTime = Date.now();
      console.log('Print successful for order:', order.id);
      return true;
      
    } catch (error) {
      console.error('Print error for order:', order?.id, error);
      
      // Try to reset printer even after error
      try {
        if (this.characteristic) {
          const resetPrinter = new Uint8Array([0x1B, 0x40]); // ESC @
          await this.characteristic.writeValue(resetPrinter);
        }
      } catch (resetError) {
        // Ignore reset errors
      }
      
      return false;
    } finally {
      this.isPrinting = false;
    }
  }

  getConnectionStatus() {
    return {
      connected: this.isConnected(),
      deviceName: this.device?.name,
      hasCharacteristic: !!this.characteristic,
      isPrinting: this.isPrinting,
      lastPrintTime: this.lastPrintTime
    };
  }
}

export default new PrinterService();
