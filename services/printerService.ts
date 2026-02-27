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
      await this.disconnect();

      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ name: deviceName }],
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', '00001800-0000-1000-8000-00805f9b34fb']
      });

      this.device.addEventListener('gattserverdisconnected', this.handleDisconnect.bind(this));

      const server = await this.device.gatt?.connect();
      if (!server) {
        throw new Error('Failed to connect to GATT server');
      }
      this.server = server;

      try {
        this.service = await this.server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
      } catch (e) {
        this.service = await this.server.getPrimaryService('00001800-0000-1000-8000-00805f9b34fb');
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

  private handleDisconnect() {
    console.log('Printer disconnected');
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
    this.stopKeepAlive();
    
    this.keepAliveInterval = setInterval(async () => {
      if (this.isConnected() && this.characteristic && !this.isPrinting) {
        try {
          const keepAliveData = new Uint8Array([0x0A]);
          await this.characteristic.writeValue(keepAliveData);
        } catch (error) {
          // Ignore keep-alive failures
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

  async ensureConnection(): Promise<boolean> {
    if (this.isConnected() && this.characteristic) {
      return true;
    }

    if (this.device) {
      try {
        this.device.removeEventListener('gattserverdisconnected', this.handleDisconnect.bind(this));
        
        const server = await this.device.gatt?.connect();
        if (server) {
          this.server = server;
          
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
          
          this.device.addEventListener('gattserverdisconnected', this.handleDisconnect.bind(this));
          this.startKeepAlive();
          
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
      
      // Build test page using the template format
      let data = this.encoder
        .initialize()
        .align('center')
        .size(2, 2)
        .line('QUICKSERVE')
        .size(1, 1)
        .line('='.repeat(32))
        .align('left')
        .line(`<J00>${this.formatDate(now)} ${this.formatTime(now)} | Test Print`)
        .line('<F>-')
        .line('<L11>Printer Test Page')
        .line('<L00>')
        .line('If you can read this,')
        .line('your printer is working!')
        .line('')
        .line('<F>=')
        .align('center')
        .size(1, 1)
        .line('QuickServe v1.0')
        .line('')
        .newline()
        .newline()
        .cut()
        .encode();

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
      return false;
    } finally {
      this.isPrinting = false;
    }
  }

  async printReceipt(order: any, restaurant: any): Promise<boolean> {
    if (this.isPrinting) {
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

        // Start building receipt with template format
        let receipt = this.encoder
          .initialize()
          .align('center')
          .size(2, 2)
          .line(restaurant.name.toUpperCase())
          .size(1, 1)
          .line('='.repeat(32))
          .align('left');

        // Header line with date/time and ticket number
        receipt = receipt
          .line(`<J00>${dateStr} ${timeStr} | Ticket #:${order.id}`);

        // Table information
        if (order.tableNumber) {
          receipt = receipt
            .line('<EB>')
            .line(`<L11>Table: ${order.tableNumber}`);
          
          // Add guest count if available (you can modify this based on your data)
          // .line(`<L00>Guests: [${order.guestCount || 1}]`)
          
          receipt = receipt.line('<DB>');
        }

        // Customer information if available
        if (order.customerName || order.customerPhone) {
          receipt = receipt
            .line('<EB>');
          
          if (order.customerName) {
            receipt = receipt.line(`<L00>Cust: ${order.customerName}`);
          }
          if (order.customerPhone) {
            receipt = receipt.line(`<L00>Cust Tel: ${order.customerPhone}`);
          }
          
          receipt = receipt.line('<DB>');
        }

        // Order notes
        if (order.remark) {
          receipt = receipt
            .line('<F>-')
            .line('<L11>Ticket Note:')
            .line(`<L00>${order.remark}`);
        }

        // Separator before items
        receipt = receipt.line('<F>-');

        // Order items
        order.items.forEach((item: any) => {
          // Check if item is voided (you can add this logic based on your needs)
          const isVoid = item.isVoided || false;
          
          if (isVoid) {
            receipt = receipt
              .line(`<J10>${item.quantity}x ${item.name}|**Void**`);
          } else {
            receipt = receipt
              .line(`<J10>${item.quantity}x ${item.name}`);
          }

          // Add item tags/options
          if (item.selectedSize) {
            receipt = receipt.line(`<J00>     * ${item.selectedSize}`);
          }
          if (item.selectedTemp) {
            receipt = receipt.line(`<J00>     * ${item.selectedTemp}`);
          }
          if (item.selectedOtherVariant) {
            receipt = receipt.line(`<J00>     * ${item.selectedOtherVariant}`);
          }

          // Add add-ons as tags
          if (item.selectedAddOns && item.selectedAddOns.length > 0) {
            item.selectedAddOns.forEach((addon: any) => {
              if (addon.quantity > 1) {
                receipt = receipt.line(`<J00>     * ${addon.name} x${addon.quantity}`);
              } else {
                receipt = receipt.line(`<J00>     * ${addon.name}`);
              }
            });
          }

          receipt = receipt.line('');
        });

        // Total
        receipt = receipt
          .line('<F>-')
          .align('right')
          .size(1, 1)
          .line(`TOTAL: RM ${order.total.toFixed(2)}`)
          .align('center')
          .size(1, 1)
          .line('<F>=')
          .line('Thank you!')
          .line('Please come again')
          .newline()
          .newline()
          .cut();

        const data = receipt.encode();

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
        
        this.server = null;
        this.service = null;
        this.characteristic = null;
        
        if (attempts < this.maxReconnectAttempts) {
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
