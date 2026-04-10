import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Check, Circle, Square, RectangleHorizontal } from 'lucide-react';

type CropShape = 'circle' | 'square' | 'rectangle' | 'portrait';

interface Props {
  imageFile: File;
  onCrop: (blob: Blob, shape: CropShape, width: number, height: number) => void;
  onCancel: () => void;
  /** When 'team-member', locks to portrait 4:5 crop with a visual guide showing the colored bg zone */
  mode?: 'default' | 'team-member';
}

const SHAPES: { id: CropShape; label: string; icon: React.ReactNode; aspect?: number }[] = [
  { id: 'circle', label: 'Circle', icon: <Circle size={16} />, aspect: 1 },
  { id: 'square', label: 'Square', icon: <Square size={16} />, aspect: 1 },
  { id: 'rectangle', label: 'Wide', icon: <RectangleHorizontal size={16} />, aspect: 2 },
  { id: 'portrait', label: 'Portrait', icon: <RectangleHorizontal size={16} className="rotate-90" />, aspect: 4 / 5 },
];

const HANDLE_SIZE = 10;

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | null;

const ImageCropModal: React.FC<Props> = ({ imageFile, onCrop, onCancel, mode = 'default' }) => {
  const isTeamMode = mode === 'team-member';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [shape, setShape] = useState<CropShape>(isTeamMode ? 'portrait' : 'square');

  // Crop box state (relative to displayed image)
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const dragRef = useRef<{ mode: DragMode; startX: number; startY: number; origCrop: typeof crop } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const MIN_SIZE = 30;

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
    if (!img || !containerRef.current) return { dw: 0, dh: 0, offsetX: 0, offsetY: 0, scale: 1 };
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

  // Detect which handle or region the mouse is over
  const getHitZone = useCallback((mx: number, my: number): DragMode => {
    const { offsetX, offsetY } = getDisplayDims();
    const cx = offsetX + crop.x;
    const cy = offsetY + crop.y;
    const cr = cx + crop.w;
    const cb = cy + crop.h;
    const hs = HANDLE_SIZE;

    // Corner handles (check first — they take priority)
    if (Math.abs(mx - cx) <= hs && Math.abs(my - cy) <= hs) return 'nw';
    if (Math.abs(mx - cr) <= hs && Math.abs(my - cy) <= hs) return 'ne';
    if (Math.abs(mx - cx) <= hs && Math.abs(my - cb) <= hs) return 'sw';
    if (Math.abs(mx - cr) <= hs && Math.abs(my - cb) <= hs) return 'se';

    // Edge handles
    if (Math.abs(my - cy) <= hs && mx > cx + hs && mx < cr - hs) return 'n';
    if (Math.abs(my - cb) <= hs && mx > cx + hs && mx < cr - hs) return 's';
    if (Math.abs(mx - cx) <= hs && my > cy + hs && my < cb - hs) return 'w';
    if (Math.abs(mx - cr) <= hs && my > cy + hs && my < cb - hs) return 'e';

    // Inside = move
    if (mx >= cx && mx <= cr && my >= cy && my <= cb) return 'move';

    return null;
  }, [crop, getDisplayDims]);

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

    // Team member mode: draw colored background zone guide (bottom 75%)
    if (isTeamMode) {
      const bgTop = cy + crop.h * 0.45;
      const bgH = crop.h * 0.55;
      ctx.save();
      ctx.fillStyle = 'rgba(251, 191, 36, 0.35)';
      const bgR = 8;
      ctx.beginPath();
      ctx.moveTo(cx + bgR, bgTop);
      ctx.lineTo(cx + crop.w - bgR, bgTop);
      ctx.arcTo(cx + crop.w, bgTop, cx + crop.w, bgTop + bgH, bgR);
      ctx.arcTo(cx + crop.w, cy + crop.h, cx, cy + crop.h, bgR);
      ctx.arcTo(cx, cy + crop.h, cx, bgTop, bgR);
      ctx.lineTo(cx, bgTop);
      ctx.closePath();
      ctx.fill();
      // Dashed line at bg top edge
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, bgTop);
      ctx.lineTo(cx + crop.w, bgTop);
      ctx.stroke();
      ctx.setLineDash([]);
      // Labels
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText('\u2191 Image overflow', cx + crop.w / 2, cy + crop.h * 0.22);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText('Colored background', cx + crop.w / 2, bgTop + bgH / 2 + 4);
      ctx.restore();
    }

    // Draw resize handles
    const handles = [
      { x: cx, y: cy },                           // nw
      { x: cx + crop.w, y: cy },                  // ne
      { x: cx, y: cy + crop.h },                  // sw
      { x: cx + crop.w, y: cy + crop.h },         // se
      { x: cx + crop.w / 2, y: cy },              // n
      { x: cx + crop.w / 2, y: cy + crop.h },     // s
      { x: cx, y: cy + crop.h / 2 },              // w
      { x: cx + crop.w, y: cy + crop.h / 2 },     // e
    ];
    handles.forEach(h => {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(h.x, h.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }, [img, crop, shape, isTeamMode, getDisplayDims]);

  // Update cursor based on hover position
  const updateCursor = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || dragRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const zone = getHitZone(mx, my);
    const cursors: Record<string, string> = {
      nw: 'nwse-resize', se: 'nwse-resize',
      ne: 'nesw-resize', sw: 'nesw-resize',
      n: 'ns-resize', s: 'ns-resize',
      e: 'ew-resize', w: 'ew-resize',
      move: 'move',
    };
    canvas.style.cursor = zone ? (cursors[zone] || 'default') : 'default';
  }, [getHitZone]);

  // Pointer handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const mode = getHitZone(mx, my);
    if (!mode) return;
    dragRef.current = { mode, startX: mx, startY: my, origCrop: { ...crop } };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    updateCursor(e);
    if (!dragRef.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const dx = mx - dragRef.current.startX;
    const dy = my - dragRef.current.startY;
    const { dw, dh } = getDisplayDims();
    const o = dragRef.current.origCrop;
    const mode = dragRef.current.mode;

    if (mode === 'move') {
      const nx = Math.max(0, Math.min(dw - o.w, o.x + dx));
      const ny = Math.max(0, Math.min(dh - o.h, o.y + dy));
      setCrop({ ...o, x: nx, y: ny });
      return;
    }

    // Aspect-locked resize: use the dominant drag axis to scale both w and h proportionally
    const aspect = o.w / o.h;
    let nw = o.w, nh = o.h, nx = o.x, ny = o.y;

    // Pick delta based on which axis moved more (or use the constrained axis for edge handles)
    const useDx = (mode === 'e' || mode === 'w') || (mode !== 'n' && mode !== 's' && Math.abs(dx) >= Math.abs(dy));
    let delta = useDx ? dx : dy;

    // Invert delta for handles that shrink when dragged in positive direction
    if (mode === 'nw' || mode === 'w' || mode === 'sw') delta = -delta;
    if (!useDx && (mode === 'nw' || mode === 'n' || mode === 'ne')) delta = -delta;

    nw = Math.max(MIN_SIZE, o.w + delta);
    nh = nw / aspect;
    if (nh < MIN_SIZE) { nh = MIN_SIZE; nw = nh * aspect; }

    // Clamp to image bounds and anchor to the correct corner
    if (mode === 'se' || mode === 'e' || mode === 's') {
      nw = Math.min(nw, dw - o.x); nh = nw / aspect;
      if (o.y + nh > dh) { nh = dh - o.y; nw = nh * aspect; }
    } else if (mode === 'nw' || mode === 'w' || mode === 'n') {
      nw = Math.min(nw, o.x + o.w); nh = nw / aspect;
      nx = o.x + o.w - nw;
      ny = o.y + o.h - nh;
      if (nx < 0) { nx = 0; nw = o.x + o.w; nh = nw / aspect; ny = o.y + o.h - nh; }
      if (ny < 0) { ny = 0; nh = o.y + o.h; nw = nh * aspect; nx = o.x + o.w - nw; }
    } else if (mode === 'ne') {
      nw = Math.min(nw, dw - o.x); nh = nw / aspect;
      ny = o.y + o.h - nh;
      if (ny < 0) { ny = 0; nh = o.y + o.h; nw = nh * aspect; }
    } else if (mode === 'sw') {
      nw = Math.min(nw, o.x + o.w); nh = nw / aspect;
      nx = o.x + o.w - nw;
      if (nx < 0) { nx = 0; nw = o.x + o.w; nh = nw / aspect; }
      if (o.y + nh > dh) { nh = dh - o.y; nw = nh * aspect; nx = o.x + o.w - nw; }
    }

    setCrop({ x: nx, y: ny, w: nw, h: nh });
  };

  const handlePointerUp = () => { dragRef.current = null; };

  // Apply crop — output capped at MAX_DIM and exported as compressed JPEG
  const MAX_DIM = 1200;
  const applyCrop = () => {
    if (!img) return;
    const { dw, dh } = getDisplayDims();
    const scaleX = img.width / dw;
    const scaleY = img.height / dh;
    const sx = crop.x * scaleX;
    const sy = crop.y * scaleY;
    const sw = crop.w * scaleX;
    const sh = crop.h * scaleY;

    // Cap output dimensions to avoid oversized payloads
    let outW = Math.round(sw);
    let outH = Math.round(sh);
    if (outW > MAX_DIM || outH > MAX_DIM) {
      const ratio = Math.min(MAX_DIM / outW, MAX_DIM / outH);
      outW = Math.round(outW * ratio);
      outH = Math.round(outH * ratio);
    }
    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    const octx = out.getContext('2d');
    if (!octx) return;

    if (shape === 'circle') {
      octx.beginPath();
      octx.ellipse(outW / 2, outH / 2, outW / 2, outH / 2, 0, 0, Math.PI * 2);
      octx.clip();
    }

    octx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
    out.toBlob(blob => { if (blob) onCrop(blob, shape, outW, outH); }, 'image/webp', 0.85);
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
          {/* Team member guide */}
          {isTeamMode && (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
              <div className="w-10 h-14 flex-shrink-0 rounded-md overflow-hidden relative border border-amber-300 dark:border-amber-700">
                <div className="absolute bottom-0 left-0 right-0 h-[55%] bg-amber-400 rounded-t-sm" />
                <div className="absolute inset-0 flex items-end justify-center">
                  <div className="w-5 h-10 bg-gray-400 rounded-t-full" />
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-amber-800 dark:text-amber-300">Team Member Photo Guide</p>
                <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5 leading-relaxed">Upload a photo with background removed (PNG). The top 25% overflows above the colored background. Position the head/shoulders in the top area.</p>
              </div>
            </div>
          )}

          {/* Shape picker */}
          {!isTeamMode && (
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Shape</label>
            <div className="flex gap-2">
              {SHAPES.filter(s => s.id !== 'portrait').map(s => (
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
          )}

          {/* Crop size indicator */}
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Crop size:</span>
            <span className="text-xs font-bold text-gray-600 dark:text-gray-300">{Math.round(crop.w)} × {Math.round(crop.h)} px</span>
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
