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
    
    // Simple keep-alive - just a null byte every 30 seconds
    this.keepAliveInterval = setInterval(async () => {
      if (this.isConnected() && this.characteristic && !this.isPrinting) {
        try {
          // Send null byte - won't cause paper movement
          const keepAliveData = new Uint8Array([0x00]);
          await this.characteristic.writeValue(keepAliveData);
        } catch (error) {
          // Ignore keep-alive failures
        }
      }
    }, 30000); // 30 seconds
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
      
      // Simple test page
      let data = this.encoder
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
      
      // Wait and clear buffer
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Clear buffer after test
      const clearBuffer = new Uint8Array([0x18]); // CAN command
      await this.characteristic.writeValue(clearBuffer);
      
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
        if (!await this.ensureConnection()) {
          throw new Error('Printer not connected');
        }

        if (!this.characteristic) {
          throw new Error('No writable characteristic found');
        }

        const orderDate = new Date(order.timestamp);
        const dateStr = this.formatDate(orderDate);
        const timeStr = this.formatTime(orderDate);

        // Build receipt - using your template format
        let receipt = this.encoder
          .initialize() // Reset printer state
          .align('center')
          .size(2, 2)
          .line(restaurant.name.toUpperCase())
          .size(1, 1)
          .line('='.repeat(32))
          .align('left')
          .line(`${dateStr} ${timeStr} | Ticket #:${order.id}`);

        // Table information
        if (order.tableNumber) {
          receipt = receipt
            .line('')
            .line(`Table: ${order.tableNumber}`);
        }

        // Separator
        receipt = receipt.line('-'.repeat(32));

        // Order items
        order.items.forEach((item: any) => {
          // Item line
          receipt = receipt.line(`${item.quantity}x ${item.name}`);

          // Options/Tags
          if (item.selectedSize) {
            receipt = receipt.line(`     * ${item.selectedSize}`);
          }
          if (item.selectedTemp) {
            receipt = receipt.line(`     * ${item.selectedTemp}`);
          }
          if (item.selectedOtherVariant) {
            receipt = receipt.line(`     * ${item.selectedOtherVariant}`);
          }

          // Add-ons
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

        // Order notes
        if (order.remark) {
          receipt = receipt
            .line('-'.repeat(32))
            .line('Ticket Note:')
            .line(order.remark)
            .line('');
        }

        // Total and footer
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

        // Send data in small chunks to prevent buffer overflow
        const chunkSize = 64; // Very small chunks
        for (let i = 0; i < data.length; i += chunkSize) {
          const chunk = data.slice(i, i + chunkSize);
          await this.characteristic.writeValue(chunk);
          // Delay between chunks to let printer process
          await new Promise(resolve => setTimeout(resolve, 150));
        }
        
        // CRITICAL: Wait for printer to finish processing
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Clear printer buffer - CAN command
        const clearBuffer = new Uint8Array([0x18]);
        await this.characteristic.writeValue(clearBuffer);
        
        // Form Feed - eject any partial page
        const formFeed = new Uint8Array([0x0C]);
        await this.characteristic.writeValue(formFeed);
        
        // Final wait
        await new Promise(resolve => setTimeout(resolve, 500));
        
        this.lastPrintTime = Date.now();
        return true;
        
      } catch (error) {
        console.error(`Print attempt ${attempts + 1} failed:`, error);
        attempts++;
        
        // Clear connection state but keep device
        this.server = null;
        this.service = null;
        this.characteristic = null;
        
        if (attempts < this.maxReconnectAttempts) {
          const delay = attempts * 1000;
          console.log(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
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
