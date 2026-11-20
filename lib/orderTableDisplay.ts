/** Hide table assignments for service options that do not use tables, including legacy orders. */
export function getOrderTableDisplay(order: { tableNumber?: string | null; diningType?: string | null }, prefix = ''): string {
  const dining = order.diningType?.trim().toLowerCase().replace(/[\s_-]/g, '');
  const table = order.tableNumber?.trim();
  if ((dining && dining !== 'dinein') || !table || /^(counter|n\/a|none|no table|-)$/i.test(table)) return '-';
  return `${prefix}${table}`;
}

/** Reports show only the table number, without a label, floor prefix, or hash. */
export function getReportTableDisplay(order: { tableNumber?: string | null; diningType?: string | null }): string {
  const table = getOrderTableDisplay(order);
  return table.match(/\d+$/)?.[0] || '-';
}
