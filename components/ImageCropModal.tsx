import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Check, Circle, Square, RectangleHorizontal } from 'lucide-react';

type CropShape = 'circle' | 'square' | 'rectangle';

interface Props {
  imageFile: File;
  onCrop: (blob: Blob, shape: CropShape, width: number, height: number) => void;
  onCancel: () => void;
}

const SHAPES: { id: CropShape; label: string; icon: React.ReactNode; aspect?: number }[] = [
  { id: 'circle', label: 'Circle', icon: <Circle size={16} />, aspect: 1 },
  { id: 'square', label: 'Square', icon: <Square size={16} />, aspect: 1 },
  { id: 'rectangle', label: 'Wide', icon: <RectangleHorizontal size={16} />, aspect: 2 },
];

const ImageCropModal: React.FC<Props> = ({ imageFile, onCrop, onCancel }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [shape, setShape] = useState<CropShape>('square');
  const [cropW, setCropW] = useState(120);
  const [cropH, setCropH] = useState(60);

  // Crop box state (relative to displayed image)
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const dragging = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load image
  useEffect(() => {
    const image = new Image();
    const url = URL.createObjectURL(imageFile);
    image.onload = () => {
      setImg(image);
      URL.revokeObjectURL(url);
    };
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  // Calculate displayed image dimensions
  const getDisplayDims = useCallback(() => {
    if (!img || !containerRef.current) return { dw: 0, dh: 0, offsetX: 0, offsetY: 0 };
    const maxW = containerRef.current.clientWidth;
    const maxH = containerRef.current.clientHeight;
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    const dw = img.width * scale;
    const dh = img.height * scale;
    return { dw, dh, offsetX: (maxW - dw) / 2, offsetY: (maxH - dh) / 2, scale };
  }, [img]);

  // Init crop box when image loads or shape changes
  useEffect(() => {
    if (!img) return;
    const { dw, dh } = getDisplayDims();
    const selectedShape = SHAPES.find(s => s.id === shape);
    const aspect = selectedShape?.aspect || 1;
    const boxW = Math.min(dw * 0.6, dh * 0.6 * aspect);
    const boxH = boxW / aspect;
    setCrop({ x: (dw - boxW) / 2, y: (dh - boxH) / 2, w: boxW, h: boxH });
  }, [img, shape, getDisplayDims]);

  // Draw canvas
  useEffect(() => {
    if (!img || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { dw, dh, offsetX, offsetY } = getDisplayDims();
    canvas.width = containerRef.current?.clientWidth || 400;
    canvas.height = containerRef.current?.clientHeight || 300;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw image
    ctx.drawImage(img, offsetX, offsetY, dw, dh);

    // Dim overlay
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Clear crop area
    const cx = offsetX + crop.x;
    const cy = offsetY + crop.y;
    ctx.save();
    if (shape === 'circle') {
      ctx.beginPath();
      ctx.ellipse(cx + crop.w / 2, cy + crop.h / 2, crop.w / 2, crop.h / 2, 0, 0, Math.PI * 2);
      ctx.clip();
    } else {
      ctx.beginPath();
      const r = 8;
      ctx.moveTo(cx + r, cy);
      ctx.arcTo(cx + crop.w, cy, cx + crop.w, cy + crop.h, r);
      ctx.arcTo(cx + crop.w, cy + crop.h, cx, cy + crop.h, r);
      ctx.arcTo(cx, cy + crop.h, cx, cy, r);
      ctx.arcTo(cx, cy, cx + crop.w, cy, r);
      ctx.clip();
    }
    ctx.drawImage(img, offsetX, offsetY, dw, dh);
    ctx.restore();

    // Border
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 2;
    if (shape === 'circle') {
      ctx.beginPath();
      ctx.ellipse(cx + crop.w / 2, cy + crop.h / 2, crop.w / 2, crop.h / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      const r = 8;
      ctx.moveTo(cx + r, cy);
      ctx.arcTo(cx + crop.w, cy, cx + crop.w, cy + crop.h, r);
      ctx.arcTo(cx + crop.w, cy + crop.h, cx, cy + crop.h, r);
      ctx.arcTo(cx, cy + crop.h, cx, cy, r);
      ctx.arcTo(cx, cy, cx + crop.w, cy, r);
      ctx.closePath();
      ctx.stroke();
    }
  }, [img, crop, shape, getDisplayDims]);

  // Drag handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    const { offsetX, offsetY } = getDisplayDims();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const cx = offsetX + crop.x;
    const cy = offsetY + crop.y;
    if (mx >= cx && mx <= cx + crop.w && my >= cy && my <= cy + crop.h) {
      dragging.current = { startX: mx, startY: my, origX: crop.x, origY: crop.y };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const dx = mx - dragging.current.startX;
    const dy = my - dragging.current.startY;
    const { dw, dh } = getDisplayDims();
    const nx = Math.max(0, Math.min(dw - crop.w, dragging.current.origX + dx));
    const ny = Math.max(0, Math.min(dh - crop.h, dragging.current.origY + dy));
    setCrop(prev => ({ ...prev, x: nx, y: ny }));
  };

  const handlePointerUp = () => { dragging.current = null; };

  // Apply crop
  const applyCrop = () => {
    if (!img) return;
    const { dw, dh } = getDisplayDims();
    const scaleX = img.width / dw;
    const scaleY = img.height / dh;
    const sx = crop.x * scaleX;
    const sy = crop.y * scaleY;
    const sw = crop.w * scaleX;
    const sh = crop.h * scaleY;

    const out = document.createElement('canvas');
    out.width = cropW;
    out.height = cropH;
    const octx = out.getContext('2d');
    if (!octx) return;

    if (shape === 'circle') {
      octx.beginPath();
      octx.ellipse(cropW / 2, cropH / 2, cropW / 2, cropH / 2, 0, 0, Math.PI * 2);
      octx.clip();
    }

    octx.drawImage(img, sx, sy, sw, sh, 0, 0, cropW, cropH);
    out.toBlob(blob => { if (blob) onCrop(blob, shape, cropW, cropH); }, 'image/png');
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-3xl max-w-xl w-full shadow-2xl animate-in zoom-in fade-in duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b dark:border-gray-700">
          <h3 className="font-black text-lg dark:text-white uppercase tracking-tight">Crop Image</h3>
          <button onClick={onCancel} className="p-2 text-gray-400 hover:text-red-500 transition-colors"><X size={20} /></button>
        </div>

        {/* Canvas */}
        <div ref={containerRef} className="relative w-full h-72 bg-gray-100 dark:bg-gray-900">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full cursor-move"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
        </div>

        {/* Controls */}
        <div className="p-5 space-y-4">
          {/* Shape picker */}
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Shape</label>
            <div className="flex gap-2">
              {SHAPES.map(s => (
                <button
                  key={s.id}
                  onClick={() => setShape(s.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                    shape === s.id
                      ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {s.icon} {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Size sliders */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Width: {cropW}px</label>
              <input type="range" min={40} max={300} value={cropW} onChange={e => setCropW(Number(e.target.value))} className="w-full accent-orange-500" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Height: {cropH}px</label>
              <input type="range" min={20} max={200} value={cropH} onChange={e => setCropH(Number(e.target.value))} className="w-full accent-orange-500" />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onCancel} className="px-5 py-2.5 rounded-xl font-bold text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">Cancel</button>
            <button onClick={applyCrop} className="px-6 py-2.5 rounded-xl font-black text-sm bg-orange-500 text-white hover:bg-orange-600 transition-colors flex items-center gap-2 shadow-lg shadow-orange-500/25">
              <Check size={16} /> Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageCropModal;
