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
  
  // Add keep-alive interval
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private lastPrintTime: number = 0;

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
    try {
      // Clean up any existing connection first
      await this.disconnect();

      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ name: deviceName }],
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', '00001800-0000-1000-8000-00805f9b34fb']
      });

      // Set up disconnect listener BEFORE connecting
      this.device.addEventListener('gattserverdisconnected', this.handleDisconnect.bind(this));

      const server = await this.device.gatt?.connect();
      if (!server) {
        throw new Error('Failed to connect to GATT server');
      }
      this.server = server;

      // Try to get the service
      try {
        this.service = await this.server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
      } catch (e) {
        // Try alternative service
        this.service = await this.server.getPrimaryService('00001800-0000-1000-8000-00805f9b34fb');
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

      // Start keep-alive to prevent disconnection
      this.startKeepAlive();
      
      this.reconnectAttempts = 0;
      return true;

    } catch (error) {
      console.error('Connection error:', error);
      await this.cleanup();
      return false;
    }
  }

  private handleDisconnect() {
    console.log('Printer disconnected - will attempt to reconnect on next print');
    this.stopKeepAlive();
    this.server = null;
    this.service = null;
    this.characteristic = null;
  }

  private async cleanup() {
    this.stopKeepAlive();
    try {
      if (this.server?.connected) {
        await this.server.disconnect();
      }
    } catch (e) {
      // Ignore cleanup errors
    }
    this.server = null;
    this.service = null;
    this.characteristic = null;
  }

  private startKeepAlive() {
    // Stop any existing keep-alive
    this.stopKeepAlive();
    
    // Send a keep-alive every 30 seconds to prevent disconnection
    this.keepAliveInterval = setInterval(async () => {
      // Only send keep-alive if we're connected and not printing
      if (this.isConnected() && this.characteristic && !this.isPrinting) {
        try {
          // Send a simple no-op command (just a newline)
          const keepAliveData = new Uint8Array([0x0A]);
          await this.characteristic.writeValue(keepAliveData);
          console.log('Keep-alive sent to printer');
        } catch (error) {
          console.log('Keep-alive failed, printer may be disconnected');
          // Don't cleanup here, let the next print attempt handle reconnection
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

  async ensureConnection(): Promise<boolean> {
    // If we're already connected and have a characteristic, return true
    if (this.isConnected() && this.characteristic) {
      return true;
    }

    // If we have a device but server is disconnected, try to reconnect
    if (this.device) {
      console.log('Attempting to reconnect...');
      try {
        // Remove old disconnect listener to avoid duplicates
        this.device.removeEventListener('gattserverdisconnected', this.handleDisconnect.bind(this));
        
        const server = await this.device.gatt?.connect();
        if (server) {
          this.server = server;
          
          // Re-establish service and characteristic
          try {
            this.service = await this.server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
          } catch (e) {
            this.service = await this.server.getPrimaryService('00001800-0000-1000-8000-00805f9b34fb');
          }
          
          const characteristics = await this.service.getCharacteristics();
          for (const char of characteristics) {
            if (char.properties.writeWithoutResponse || char.properties.write) {
              this.characteristic = char;
              break;
            }
          }
          
          // Re-attach disconnect listener
          this.device.addEventListener('gattserverdisconnected', this.handleDisconnect.bind(this));
          
          // Restart keep-alive
          this.startKeepAlive();
          
          console.log('Reconnected successfully');
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
    this.stopKeepAlive();
    if (this.device) {
      this.device.removeEventListener('gattserverdisconnected', this.handleDisconnect.bind(this));
    }
    await this.cleanup();
    this.device = null;
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

      // Create test page data
      const data = this.encoder
        .initialize()
        .align('center')
        .size(2, 2)
        .line('QuickServe')
        .size(1, 1)
        .line('Test Page')
        .line(new Date().toLocaleString())
        .line('Printer Connected!')
        .cut()
        .encode();

      // Write data in chunks
      const chunkSize = 512;
      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        await this.characteristic.writeValue(chunk);
        if (i + chunkSize < data.length) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
      
      this.lastPrintTime = Date.now();
      return true;
      
    } catch (error) {
      console.error('Print test page error:', error);
      // Don't cleanup on error - let ensureConnection handle it next time
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

        // Format date and time
        const orderDate = new Date(order.timestamp);
        const dateStr = orderDate.toLocaleDateString();
        const timeStr = orderDate.toLocaleTimeString();

        // Build receipt data
        let data = this.encoder
          .initialize()
          .align('center')
          .size(2, 2)
          .line(restaurant.name)
          .size(1, 1)
          .line('='.repeat(32))
          .line(`Order: ${order.id}`)
          .line(`Table: ${order.tableNumber}`)
          .line(`Date: ${dateStr}`)
          .line(`Time: ${timeStr}`)
          .line('='.repeat(32))
          .align('left');

        // Items
        order.items.forEach((item: any) => {
          const itemTotal = (item.price * item.quantity).toFixed(2);
          
          data = data
            .text(`${item.name} x${item.quantity}`)
            .align('right')
            .text(`RM ${itemTotal}`)
            .align('left');

          if (item.selectedSize) {
            data = data.text(`  - ${item.selectedSize}`);
          }
          if (item.selectedTemp) {
            data = data.text(`  - ${item.selectedTemp}`);
          }

          if (item.selectedAddOns && item.selectedAddOns.length > 0) {
            item.selectedAddOns.slice(0, 3).forEach((addon: any) => {
              data = data.text(`    + ${addon.name} x${addon.quantity}`);
            });
            if (item.selectedAddOns.length > 3) {
              data = data.text(`    +${item.selectedAddOns.length - 3} more`);
            }
          }
          
          data = data.newline();
        });

        data = data
          .line('-'.repeat(32))
          .align('right')
          .size(1, 1)
          .line(`TOTAL: RM ${order.total.toFixed(2)}`)
          .align('center')
          .size(1, 1)
          .line('='.repeat(32))
          .line('Thank you!')
          .newline()
          .newline()
          .cut()
          .encode();

        // Write data in chunks
        const chunkSize = 512;
        for (let i = 0; i < data.length; i += chunkSize) {
          const chunk = data.slice(i, i + chunkSize);
          await this.characteristic.writeValue(chunk);
          if (i + chunkSize < data.length) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }
        
        this.lastPrintTime = Date.now();
        return true;
        
      } catch (error) {
        console.error(`Print attempt ${attempts + 1} failed:`, error);
        attempts++;
        
        // Don't cleanup fully, just mark as disconnected and let ensureConnection handle it
        this.server = null;
        this.service = null;
        this.characteristic = null;
        
        if (attempts < this.maxReconnectAttempts) {
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempts), 5000);
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
