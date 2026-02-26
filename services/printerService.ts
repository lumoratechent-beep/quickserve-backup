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

  constructor() {
    this.encoder = new EscPosEncoder();
  }

  async scanForPrinters(): Promise<PrinterDevice[]> {
    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
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
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ name: deviceName }],
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
      });

      const server = await this.device.gatt?.connect();
      if (!server) {
        throw new Error('Failed to connect to GATT server');
      }
      this.server = server;

      const service = await this.server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
      this.service = service;
      
      const characteristics = await this.service.getCharacteristics();
      
      for (const char of characteristics) {
        if (char.properties.write || char.properties.writeWithoutResponse) {
          this.characteristic = char;
          break;
        }
      }

      if (!this.characteristic) {
        throw new Error('No writable characteristic found');
      }

      this.device.addEventListener('gattserverdisconnected', this.handleDisconnect.bind(this));

      return true;
    } catch (error) {
      console.error('Connection error:', error);
      this.device = null;
      this.server = null;
      this.service = null;
      this.characteristic = null;
      return false;
    }
  }

  private handleDisconnect() {
    this.server = null;
    this.service = null;
    this.characteristic = null;
    console.log('Printer disconnected');
  }

  isConnected(): boolean {
    return this.server?.connected || false;
  }

  async disconnect() {
    if (this.server?.connected) {
      try {
        await this.server.disconnect();
      } catch (error) {
        console.error('Disconnect error:', error);
      }
    }
    this.device = null;
    this.server = null;
    this.service = null;
    this.characteristic = null;
  }

  async printTestPage(): Promise<boolean> {
    try {
      if (!this.characteristic) {
        throw new Error('Printer not connected');
      }

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

      await this.characteristic.writeValue(data);
      return true;
    } catch (error) {
      console.error('Print error:', error);
      return false;
    }
  }

  async printReceipt(order: any, restaurant: any): Promise<boolean> {
    try {
      if (!this.characteristic) {
        throw new Error('Printer not connected');
      }

      // Format date and time
      const orderDate = new Date(order.timestamp);
      const dateStr = orderDate.toLocaleDateString();
      const timeStr = orderDate.toLocaleTimeString();

      // Build receipt data with better formatting
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

      // Items with proper formatting
      order.items.forEach((item: any) => {
        const itemTotal = (item.price * item.quantity).toFixed(2);
        
        // Item name and quantity on same line, price aligned right
        data = data
          .text(`${item.name} x${item.quantity}`)
          .align('right')
          .text(`RM ${itemTotal}`)
          .align('left');

        // Variants indented
        if (item.selectedSize) {
          data = data.text(`  - Size: ${item.selectedSize}`);
        }
        if (item.selectedTemp) {
          data = data.text(`  - ${item.selectedTemp}`);
        }
        if (item.selectedOtherVariant) {
          data = data.text(`  - ${item.selectedOtherVariant}`);
        }

        // Add-ons indented further
        if (item.selectedAddOns && item.selectedAddOns.length > 0) {
          item.selectedAddOns.forEach((addon: any) => {
            const addonTotal = (addon.price * addon.quantity).toFixed(2);
            data = data.text(`    + ${addon.name} x${addon.quantity} RM ${addonTotal}`);
          });
        }
        
        // Empty line between items for readability
        data = data.newline();
      });

      // Total with proper formatting
      data = data
        .line('-'.repeat(32))
        .align('right')
        .size(1, 1)
        .line(`TOTAL: RM ${order.total.toFixed(2)}`)
        .align('center')
        .size(1, 1)
        .line('='.repeat(32))
        .line('Thank you!')
        .line('Please come again')
        .newline() // Add space before cut
        .newline() // Extra space to separate orders
        .cut()
        .encode();

      await this.characteristic.writeValue(data);
      return true;
    } catch (error) {
      console.error('Print error:', error);
      return false;
    }
  }
}

export default new PrinterService();
