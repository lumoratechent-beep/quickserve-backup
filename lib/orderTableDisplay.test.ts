import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { getOrderTableDisplay, getReportTableDisplay } from './orderTableDisplay';

test('non-dine-in reports hide both legacy Counter values and stale table assignments', () => {
  for (const diningType of ['Takeaway', 'Take away', 'Delivery', 'Pickup', 'Drive through']) {
    for (const tableNumber of ['Counter', 'Table 2', '', '-']) {
      assert.equal(getOrderTableDisplay({ diningType, tableNumber }, '#'), '-');
    }
  }
});

test('dine-in keeps assigned tables and hides unassigned values', () => {
  assert.equal(getOrderTableDisplay({ diningType: 'Dine-in', tableNumber: 'Table 2' }, '#'), '#Table 2');
  assert.equal(getOrderTableDisplay({ tableNumber: 'Table 3' }), 'Table 3');
  for (const tableNumber of ['Counter', '', '-', 'N/A', undefined]) {
    assert.equal(getOrderTableDisplay({ diningType: 'Dine-in', tableNumber }, '#'), '-');
  }
});

test('reports show only a number or a dash', () => {
  for (const tableNumber of ['3', 'Table 3', '#Table 3', 'F2-3', 'Patio 3']) {
    assert.equal(getReportTableDisplay({ diningType: 'Dine-in', tableNumber }), '3');
  }
  for (const tableNumber of ['Counter', '', '-', 'N/A', 'Patio', undefined]) {
    assert.equal(getReportTableDisplay({ diningType: 'Dine-in', tableNumber }), '-');
  }
  for (const diningType of ['Takeaway', 'Delivery', 'Pickup']) {
    assert.equal(getReportTableDisplay({ diningType, tableNumber: 'Table 3' }), '-');
  }
});
