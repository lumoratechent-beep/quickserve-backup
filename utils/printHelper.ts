export const createReceiptData = (order: any, restaurant: any) => {
  const encoder = new TextEncoder();
  const lines: number[][] = [];
  
  // Initialize printer
  lines.push([0x1B, 0x40]); // ESC @
  
  // Center align header
  lines.push([0x1B, 0x61, 0x31]); // ESC a 1 (center)
  
  // Restaurant name
  lines.push([0x1B, 0x21, 0x30]); // Double height + double width
  lines.push(Array.from(encoder.encode(restaurant.name)));
  lines.push([0x0A]); // New line
  
  // Normal text
  lines.push([0x1B, 0x21, 0x00]); // Normal text
  
  // Order info
  lines.push(Array.from(encoder.encode('='.repeat(32))));
  lines.push([0x0A]);
  lines.push(Array.from(encoder.encode(`Order: ${order.id}`)));
  lines.push([0x0A]);
  lines.push(Array.from(encoder.encode(`Table: ${order.tableNumber}`)));
  lines.push([0x0A]);
  lines.push(Array.from(encoder.encode(`Date: ${new Date(order.timestamp).toLocaleString()}`)));
  lines.push([0x0A]);
  lines.push(Array.from(encoder.encode('='.repeat(32))));
  lines.push([0x0A]);
  
  // Items
  order.items.forEach((item: any) => {
    lines.push(Array.from(encoder.encode(`${item.name} x${item.quantity}`)));
    lines.push([0x0A]);
    lines.push(Array.from(encoder.encode(`  RM ${(item.price * item.quantity).toFixed(2)}`)));
    lines.push([0x0A]);
    
    // Add-ons
    if (item.selectedAddOns && item.selectedAddOns.length > 0) {
      item.selectedAddOns.forEach((addon: any) => {
        lines.push(Array.from(encoder.encode(`  + ${addon.name} x${addon.quantity}`)));
        lines.push([0x0A]);
      });
    }
  });
  
  // Total
  lines.push(Array.from(encoder.encode('-'.repeat(32))));
  lines.push([0x0A]);
  lines.push(Array.from(encoder.encode(`TOTAL: RM ${order.total.toFixed(2)}`)));
  lines.push([0x0A]);
  lines.push(Array.from(encoder.encode('='.repeat(32))));
  lines.push([0x0A]);
  lines.push(Array.from(encoder.encode('Thank you for your order!')));
  lines.push([0x0A]);
  lines.push(Array.from(encoder.encode('Please come again')));
  lines.push([0x0A]);
  lines.push([0x0A]);
  
  // Cut paper
  lines.push([0x1D, 0x56, 0x41, 0x03]); // GS V A 3 (cut paper)
  
  // Flatten the array of arrays into a single Uint8Array
  const flattened = lines.reduce((acc, val) => acc.concat(val), []);
  return new Uint8Array(flattened);
};

export const printOrder = async (order: any, restaurant: any, device: any) => {
  try {
    const receiptData = createReceiptData(order, restaurant);
    
    // Reconnect to printer
    const bluetoothDevice = await navigator.bluetooth.requestDevice({
      filters: [{ name: device.name }],
      optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
    });
    
    const server = await bluetoothDevice.gatt?.connect();
    if (!server) throw new Error('Failed to connect to printer');
    
    // You'll need to find the correct service and characteristic for your printer
    // This is a common pattern for thermal printers, but may need adjustment
    const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
    const characteristics = await service.getCharacteristics();
    
    if (characteristics.length > 0) {
      await characteristics[0].writeValue(receiptData);
    }
    
    // Disconnect after printing
    await server.disconnect();
    
    return { success: true };
  } catch (error) {
    console.error('Print error:', error);
    return { success: false, error };
  }
};
