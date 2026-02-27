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
    
    this.keepAliveInterval = setInterval(async () => {
      if (this.isConnected() && this.characteristic && !this.isPrinting) {
        try {
          // Send a simple no-op
          const keepAliveData = new Uint8Array([0x0A]);
          await this.characteristic.writeValue(keepAliveData);
        } catch (error) {
          // Ignore
        }
      }
    }, 15000);
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
      
      // SIMPLE test page - minimal data
      const data = this.encoder
        .initialize()
        .align('center')
        .line('TEST PAGE')
        .line('')
        .line('QuickServe')
        .line(new Date().toLocaleString())
        .cut()
        .encode();

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
        if (!await this.ensureConnection()) {
          throw new Error('Printer not connected');
        }

        if (!this.characteristic) {
          throw new Error('No writable characteristic found');
        }

        const orderDate = new Date(order.timestamp);
        const dateStr = this.formatDate(orderDate);
        const timeStr = this.formatTime(orderDate);

        // FIXED: Reset printer before each receipt
        let receipt = this.encoder
          .initialize()  // This sends ESC @ to reset printer
          .align('center')
          .size(2, 2)
          .line(restaurant.name.toUpperCase())
          .size(1, 1)
          .line('='.repeat(32))
          .align('left')
          .line(`${dateStr} ${timeStr} | #${order.id}`);

        // Table
        if (order.tableNumber) {
          receipt = receipt
            .line('')
            .line(`Table: ${order.tableNumber}`);
        }

        receipt = receipt.line('-'.repeat(32));

        // Items - KEEP IT SIMPLE, avoid special characters
        order.items.forEach((item: any) => {
          // Item line
          receipt = receipt.line(`${item.quantity}x ${item.name}`);

          // Options - indented with spaces, no special characters
          if (item.selectedSize) {
            receipt = receipt.line(`   ${item.selectedSize}`);
          }
          if (item.selectedTemp) {
            receipt = receipt.line(`   ${item.selectedTemp}`);
          }
          if (item.selectedOtherVariant) {
            receipt = receipt.line(`   ${item.selectedOtherVariant}`);
          }

          // Add-ons
          if (item.selectedAddOns && item.selectedAddOns.length > 0) {
            item.selectedAddOns.forEach((addon: any) => {
              if (addon.quantity > 1) {
                receipt = receipt.line(`   + ${addon.name} x${addon.quantity}`);
              } else {
                receipt = receipt.line(`   + ${addon.name}`);
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
          .line(`TOTAL: RM ${order.total.toFixed(2)}`)
          .align('center')
          .line('='.repeat(32))
          .line('Thank you!')
          .line('Please come again')
          .newline()
          .newline()
          .cut();

        const data = receipt.encode();

        // FIXED: Clear any pending data by sending in chunks with delays
        const chunkSize = 128; // Smaller chunks to avoid buffer overflow
        for (let i = 0; i < data.length; i += chunkSize) {
          const chunk = data.slice(i, i + chunkSize);
          await this.characteristic.writeValue(chunk);
          // Add delay between chunks to let printer process
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // FIXED: Wait for printer to finish processing
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // FIXED: Send a partial cut or just a newline to clear buffer
        const clearBuffer = new Uint8Array([0x0A, 0x0A, 0x0A]);
        await this.characteristic.writeValue(clearBuffer);
        
        this.lastPrintTime = Date.now();
        return true;
        
      } catch (error) {
        console.error(`Print attempt ${attempts + 1} failed:`, error);
        attempts++;
        
        // FIXED: Reset printer state on error
        this.server = null;
        this.service = null;
        this.characteristic = null;
        
        if (attempts < this.maxReconnectAttempts) {
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
