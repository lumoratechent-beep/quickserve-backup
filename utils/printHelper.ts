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
  lines.push(Array.from(encoder.encode('Thank you!')));
