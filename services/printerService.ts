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
  
  // Add these to track connection state
  private connectionPromise: Promise<boolean> | null = null;
  private disconnectRequested: boolean = false;

  constructor() {
    this.encoder = new EscPosEncoder();
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
    // If already connecting, return that promise
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
      // Clean up any existing connection
      await this.disconnect();

      this.disconnectRequested = false;

      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ name: deviceName }],
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', '00001800-0000-1000-8000-00805f9b34fb']
      });

      // Set up disconnect listener
      this.device.addEventListener('gattserverdisconnected', () => {
        console.log('Printer disconnected - will reconnect on next print');
        if (!this.disconnectRequested) {
          // Only cleanup if disconnect wasn't requested
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

      // Try to get the service
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
      
      // Find the best characteristic for writing
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

      // Start keep-alive
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
    
    // Send keep-alive every 15 seconds to prevent disconnection
    this.keepAliveInterval = setInterval(async () => {
      if (this.isConnected() && this.characteristic && !this.isPrinting) {
        try {
          // Send a simple status request or no-op
          const keepAliveData = new Uint8Array([0x10, 0x04, 0x01]); // ESC/POS status request
          await this.characteristic.writeValue(keepAliveData);
        } catch (error) {
          console.log('Keep-alive failed, printer may be disconnected');
          // Don't cleanup here, let the next print handle reconnection
        }
      }
    }, 15000); // 15 seconds
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
    // If we're already connected and have a characteristic, return true
    if (this.isConnected() && this.characteristic) {
      return true;
    }

    // If we have a device but no connection, try to reconnect
    if (this.device && !this.disconnectRequested) {
      console.log('Attempting to reconnect printer...');
      try {
        const server = await this.device.gatt?.connect();
        if (server) {
          this.server = server;
          
          // Re-establish service
          try {
            this.service = await this.server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
          } catch (e) {
            this.service = await this.server.getPrimaryService('00001800-0000-1000-8000-00805f9b34fb');
          }
          
          if (!this.service) {
            throw new Error('Could not find printer service');
          }

          // Re-establish characteristic
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

          // Restart keep-alive
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
      // Remove listener to avoid handling our own disconnect
      this.device.removeEventListener('gattserverdisconnected', () => {});
    }
    
    try {
      if (this.server?.connected) {
        await this.server.disconnect();
      }
    } catch (e) {
      // Ignore disconnect errors
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
      console.log('Print already in progress');
      return false;
    }

    this.isPrinting = true;
    
    try {
      // Ensure we're connected
      if (!await this.ensureConnection()) {
        throw new Error('Printer not connected');
      }

      if (!this.characteristic) {
        throw new Error('No writable characteristic found');
      }

      const now = new Date();
      
      // Build test page
      let data = this.encoder
        .initialize()
        .align('center')
        .size(2, 2)
        .line('QUICKSERVE')
        .size(1, 1)
        .line('='.repeat(32))
        .align('left')
        .line(`${this.formatDate(now)} ${this.formatTime(now)} | Test Print`)
        .line('-'.repeat(32))
        .line('')
        .align('center')
        .line('Printer Test Page')
        .line('')
        .line('If you can read this,')
        .line('your printer is working!')
        .line('')
        .line('='.repeat(32))
        .line('QuickServe v1.0')
        .newline()
        .newline()
        .cut()
        .encode();

      // Write data
      await this.characteristic.writeValue(data);
      
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
    let attempts = 0;
    
    while (attempts < this.maxReconnectAttempts) {
      try {
        // Ensure we're connected before each attempt
        if (!await this.ensureConnection()) {
          throw new Error('Printer not connected');
        }

        if (!this.characteristic) {
          throw new Error('No writable characteristic found');
        }

        const orderDate = new Date(order.timestamp);
        const dateStr = this.formatDate(orderDate);
        const timeStr = this.formatTime(orderDate);

        // Build receipt
        let receipt = this.encoder
          .initialize()
          .align('center')
          .size(2, 2)
          .line(restaurant.name.toUpperCase())
          .size(1, 1)
          .line('='.repeat(32))
          .align('left');

        // Header
        receipt = receipt
          .line(`${dateStr} ${timeStr} | Ticket #:${order.id}`);

        // Table
        if (order.tableNumber) {
          receipt = receipt
            .line('')
            .line(`Table: ${order.tableNumber}`);
        }

        // Separator
        receipt = receipt
          .line('-'.repeat(32));

        // Items
        order.items.forEach((item: any) => {
          receipt = receipt
            .line(`${item.quantity}x ${item.name}`);

          // Add options
          if (item.selectedSize) {
            receipt = receipt.line(`     * ${item.selectedSize}`);
          }
          if (item.selectedTemp) {
            receipt = receipt.line(`     * ${item.selectedTemp}`);
          }
          if (item.selectedOtherVariant) {
            receipt = receipt.line(`     * ${item.selectedOtherVariant}`);
          }

          // Add add-ons
          if (item.selectedAddOns && item.selectedAddOns.length > 0) {
            item.selectedAddOns.forEach((addon: any) => {
              if (addon.quantity > 1) {
                receipt = receipt.line(`     * ${addon.name} x${addon.quantity}`);
              } else {
                receipt = receipt.line(`     * ${addon.name}`);
              }
            });
          }

          receipt = receipt.line('');
        });

        // Notes
        if (order.remark) {
          receipt = receipt
            .line('-'.repeat(32))
            .line('Note:')
            .line(order.remark)
            .line('');
        }

        // Total
        receipt = receipt
          .line('-'.repeat(32))
          .align('right')
          .size(1, 1)
          .line(`TOTAL: RM ${order.total.toFixed(2)}`)
          .align('center')
          .size(1, 1)
          .line('='.repeat(32))
          .line('Thank you!')
          .line('Please come again')
          .newline()
          .newline()
          .cut();

        const data = receipt.encode();

        // Write data
        await this.characteristic.writeValue(data);
        
        // Small delay to ensure print completes
        await new Promise(resolve => setTimeout(resolve, 500));
        
        this.lastPrintTime = Date.now();
        return true;
        
      } catch (error) {
        console.error(`Print attempt ${attempts + 1} failed:`, error);
        attempts++;
        
        // Clear connection state but keep device for reconnection
        this.server = null;
        this.service = null;
        this.characteristic = null;
        
        if (attempts < this.maxReconnectAttempts) {
          console.log(`Retrying in ${attempts} second(s)...`);
          await new Promise(resolve => setTimeout(resolve, attempts * 1000));
        }
      }
    }
    
    this.isPrinting = false;
    return false;
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
