import React, { useState } from 'react';
import { GripVertical, X } from 'lucide-react';

interface ReceiptElement {
  id: string;
  type: 'title' | 'header1' | 'header2' | 'separator' | 'datetime' | 'table' | 'items' | 'total' | 'footer-sep' | 'footer1' | 'footer2';
  text: string;
  align: 'left' | 'center' | 'right';
  size: number;
  order: number;
  visible: boolean;
}

interface ReceiptPreviewProps {
  receiptSettings?: any;
  sampleOrder?: any;
  onClose: () => void;
}

const ReceiptPreview: React.FC<ReceiptPreviewProps> = ({ receiptSettings, sampleOrder, onClose }) => {
  const [elements, setElements] = useState<ReceiptElement[]>([
    {
      id: 'title',
      type: 'title',
      text: receiptSettings?.businessName || 'QUICKSERVE',
      align: 'center',
      size: 20,
      order: 0,
      visible: true,
    },
    {
      id: 'header1',
      type: 'header1',
      text: receiptSettings?.headerLine1 || 'Welcome to our restaurant',
      align: 'center',
      size: 12,
      order: 1,
      visible: !!receiptSettings?.headerLine1,
    },
    {
      id: 'header2',
      type: 'header2',
      text: receiptSettings?.headerLine2 || 'Thank you for dining',
      align: 'center',
      size: 12,
      order: 2,
      visible: !!receiptSettings?.headerLine2,
    },
    {
      id: 'sep1',
      type: 'separator',
      text: '════════════════════════════',
      align: 'center',
      size: 12,
      order: 3,
      visible: true,
    },
    {
      id: 'datetime',
      type: 'datetime',
      text: '02/28/2026 03:30 PM | #ORD001',
      align: 'left',
      size: 12,
      order: 4,
      visible: true,
    },
    {
      id: 'table',
      type: 'table',
      text: 'Table: 5',
      align: 'left',
      size: 12,
      order: 5,
      visible: true,
    },
    {
      id: 'items',
      type: 'items',
      text: '1x Iced Coffee\n   Large\n   Extra Sugar',
      align: 'left',
      size: 12,
      order: 6,
      visible: true,
    },
    {
      id: 'total',
      type: 'total',
      text: 'TOTAL: RM 8.50',
      align: 'right',
      size: 14,
      order: 7,
      visible: true,
    },
    {
      id: 'sep2',
      type: 'footer-sep',
      text: '════════════════════════════',
      align: 'center',
      size: 12,
      order: 8,
      visible: true,
    },
    {
      id: 'footer1',
      type: 'footer1',
      text: receiptSettings?.footerLine1 || 'Thank you!',
      align: 'center',
      size: 12,
      order: 9,
      visible: !!receiptSettings?.footerLine1,
    },
    {
      id: 'footer2',
      type: 'footer2',
      text: receiptSettings?.footerLine2 || 'Please come again',
      align: 'center',
      size: 12,
      order: 10,
      visible: !!receiptSettings?.footerLine2,
    },
  ]);

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(true);

  // ESC-POS Font A (default): 32 characters per 80mm line
  const PRINTER_WIDTH = 32;

  const getAlignment = (align: string, text: string) => {
    const padding = Math.max(0, PRINTER_WIDTH - text.length);
    switch (align) {
      case 'center':
        const leftPad = Math.floor(padding / 2);
        return ' '.repeat(leftPad) + text;
      case 'right':
        return ' '.repeat(padding) + text;
      default:
        return text;
    }
  };

  const handleDragStart = (id: string) => {
    setDraggedId(id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetId: string) => {
    if (!draggedId) return;

    const draggedElement = elements.find(e => e.id === draggedId);
    const targetElement = elements.find(e => e.id === targetId);

    if (!draggedElement || !targetElement) return;

    const newElements = [...elements];
    const draggedIndex = newElements.findIndex(e => e.id === draggedId);
    const targetIndex = newElements.findIndex(e => e.id === targetId);

    [newElements[draggedIndex], newElements[targetIndex]] = [
      newElements[targetIndex],
      newElements[draggedIndex],
    ];

    // Update order values
    newElements.forEach((el, idx) => {
      el.order = idx;
    });

    setElements(newElements);
    setDraggedId(null);
  };

  const toggleVisibility = (id: string) => {
    setElements(
      elements.map(el => (el.id === id ? { ...el, visible: !el.visible } : el))
    );
  };

  const sortedElements = elements.sort((a, b) => a.order - b.order);
  const visibleElements = sortedElements.filter(el => el.visible);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b p-4 flex justify-between items-center">
          <h2 className="text-xl font-bold">Receipt Preview & Debug</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left: Receipt Preview */}
          <div className="order-2 lg:order-1">
            <h3 className="font-bold mb-2 text-green-700">Printer Output (32 chars/line - Font A)</h3>
            <div className="bg-yellow-50 border-2 border-yellow-200 p-4 rounded font-mono text-xs whitespace-pre-wrap break-words bg-gradient-to-b from-yellow-50 to-yellow-100 shadow-inner min-h-96 overflow-auto">
              {visibleElements.map(el => (
                <div key={el.id}>
                  {getAlignment(el.align, el.text)}
                </div>
              ))}
            </div>

            {/* Debug Info */}
            {showDebug && (
              <div className="mt-4 bg-gray-100 p-3 rounded text-xs">
                <h4 className="font-bold mb-2">Debug Info (ESC-POS Font A):</h4>
                <p>Line Width: {PRINTER_WIDTH} chars (80mm thermal)</p>
                <p>Double-Width Mode: ~16 chars (for titles)</p>
                <p>Visible Elements: {visibleElements.length}</p>
                <div className="mt-2 max-h-40 overflow-auto">
                  {visibleElements.map(el => (
                    <div key={el.id} className="text-gray-600 mb-1">
                      <span className="font-mono">{el.type}:</span> align=
                      <span className="text-blue-600">{el.align}</span> | len=
                      <span className="text-red-600">{el.text.length}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Element Controls */}
          <div className="order-1 lg:order-2">
            <h3 className="font-bold mb-3 text-blue-700">Receipt Elements (Drag to reorder)</h3>
            <div className="space-y-2 max-h-96 overflow-auto">
              {elements.map((el, idx) => (
                <div
                  key={el.id}
                  draggable
                  onDragStart={() => handleDragStart(el.id)}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(el.id)}
                  className={`p-3 bg-white border-2 rounded cursor-grab transition-all ${
                    draggedId === el.id ? 'bg-blue-100 border-blue-400' : 'border-gray-200 hover:border-gray-400'
                  } ${!el.visible ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    <GripVertical size={16} className="mt-1 text-gray-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-mono text-sm font-bold">{el.type}</span>
                        <input
                          type="checkbox"
                          checked={el.visible}
                          onChange={() => toggleVisibility(el.id)}
                          className="w-4 h-4"
                          title="Toggle visibility"
                        />
                      </div>
                      <p className="text-xs text-gray-600 truncate">{el.text}</p>
                      <div className="text-xs text-gray-500 mt-1">
                        Align: <span className="font-mono text-blue-600">{el.align}</span> | 
                        Length: <span className="font-mono text-red-600">{el.text.length}</span> chars
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowDebug(!showDebug)}
              className="mt-3 w-full text-xs px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded"
            >
              {showDebug ? 'Hide' : 'Show'} Debug Info
            </button>
          </div>
        </div>

        <div className="border-t p-4 bg-gray-50">
          <p className="text-xs text-gray-600">
            <strong>Issues Found (Font A - 32 chars/line):</strong>
          </p>
          <ul className="text-xs text-gray-700 mt-2 space-y-1 ml-4 list-disc">
            {visibleElements.filter(el => el.type === 'separator' && el.text.length > PRINTER_WIDTH).length > 0 && (
              <li>Separator lines overflow - will wrap (use 32 chars max)</li>
            )}
            {visibleElements.find(el => el.type === 'title' && el.text.length > 16) && (
              <li>Business name too long (double-width = max 16 chars)</li>
            )}
            {visibleElements.find(el => el.type === 'total' && el.text.length > PRINTER_WIDTH) && (
              <li>TOTAL line might wrap if too long ({PRINTER_WIDTH} chars max)</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ReceiptPreview;
