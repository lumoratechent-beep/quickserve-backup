import React, { useState, useEffect } from 'react';
import { Printer, Bluetooth, Plus, Trash2, CheckCircle2, AlertCircle, ChevronDown, ChevronRight, X, Wifi, Usb, Settings, FileText, UtensilsCrossed, RotateCw } from 'lucide-react';
import printerService, { PrinterDevice, SavedPrinter, ReceiptConfig, KitchenTicketConfig, DEFAULT_RECEIPT_CONFIG, DEFAULT_KITCHEN_TICKET_CONFIG, createDefaultPrinter } from '../services/printerService';
import type { PaperSize, ConnectionType, PrintDensity, PrintJobType } from '../services/printerService';

interface Props {
  restaurantId: string;
  restaurantName: string;
  categories?: string[];
  savedPrinters?: SavedPrinter[];
  receiptConfig?: ReceiptConfig;
  kitchenConfig?: KitchenTicketConfig;
  onPrinterConnected?: (device: PrinterDevice) => void;
  onReceiptConfigChange?: (config: ReceiptConfig) => void;
  onKitchenConfigChange?: (config: KitchenTicketConfig) => void;
  onPrintersChange?: (printers: SavedPrinter[]) => void;
}

type SettingsTab = 'printers' | 'receipts' | 'kitchen';

const PrinterSettings: React.FC<Props> = ({
  restaurantId,
  restaurantName,
  categories = [],
  savedPrinters: propPrinters,
  receiptConfig: propReceiptConfig,
  kitchenConfig: propKitchenConfig,
  onPrinterConnected,
  onReceiptConfigChange,
  onKitchenConfigChange,
  onPrintersChange,
}) => {
  // ─── State ──────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<SettingsTab>('printers');
  const [isBluetoothSupported, setIsBluetoothSupported] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<PrinterDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<PrinterDevice | null>(null);
  const [printerStatus, setPrinterStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [realPrinterConnected, setRealPrinterConnected] = useState(false);
  const [testPrintStatus, setTestPrintStatus] = useState<'idle' | 'printing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Saved printers
  const [savedPrinters, setSavedPrinters] = useState<SavedPrinter[]>(() => {
    if (propPrinters && propPrinters.length > 0) return propPrinters;
    const saved = localStorage.getItem(`printers_${restaurantId}`);
    return saved ? JSON.parse(saved) : [];
  });

  // Add/Edit printer
  const [isAddingPrinter, setIsAddingPrinter] = useState(false);
  const [editingPrinterId, setEditingPrinterId] = useState<string | null>(null);
  const [printerForm, setPrinterForm] = useState<SavedPrinter>(createDefaultPrinter());

  // Receipt config
  const [receiptConfig, setReceiptConfig] = useState<ReceiptConfig>(() => {
    if (propReceiptConfig) return propReceiptConfig;
    const saved = localStorage.getItem(`receipt_config_${restaurantId}`);
    if (saved) try { return { ...DEFAULT_RECEIPT_CONFIG, ...JSON.parse(saved) }; } catch {}
    return { ...DEFAULT_RECEIPT_CONFIG, businessName: restaurantName };
  });

  // Kitchen ticket config
  const [kitchenConfig, setKitchenConfig] = useState<KitchenTicketConfig>(() => {
    if (propKitchenConfig) return propKitchenConfig;
    const saved = localStorage.getItem(`kitchen_config_${restaurantId}`);
    if (saved) try { return { ...DEFAULT_KITCHEN_TICKET_CONFIG, ...JSON.parse(saved) }; } catch {}
    return { ...DEFAULT_KITCHEN_TICKET_CONFIG };
  });

  // ─── Effects ────────────────────────────────────────────────────

  useEffect(() => {
    if (!navigator.bluetooth) {
      setIsBluetoothSupported(false);
      setErrorMessage('Web Bluetooth not supported. Use Chrome, Edge, or Opera.');
    }

    // Auto-reconnect
    const savedPrinter = localStorage.getItem(`printer_${restaurantId}`);
    if (savedPrinter) {
      try {
        const device = JSON.parse(savedPrinter);
        setConnectedDevice(device);
        setPrinterStatus('connecting');
        printerService.autoReconnect(device.name).then(success => {
          setPrinterStatus(success ? 'connected' : 'disconnected');
          setRealPrinterConnected(success);
          if (success) onPrinterConnected?.(device);
        }).catch(() => {
          setPrinterStatus('disconnected');
          setRealPrinterConnected(false);
        });
      } catch {}
    }
  }, [restaurantId]);

  // Periodic connection check
  useEffect(() => {
    const interval = setInterval(() => {
      const connected = printerService.isConnected();
      setRealPrinterConnected(connected);
      if (connectedDevice) setPrinterStatus(connected ? 'connected' : 'disconnected');
    }, 3000);
    return () => clearInterval(interval);
  }, [connectedDevice]);

  // ─── Printer Actions ───────────────────────────────────────────

  const handleScan = async () => {
    setIsScanning(true);
    setDevices([]);
    setErrorMessage('');
    const found = await printerService.scanForPrinters();
    setDevices(found);
    setIsScanning(false);
  };

  const handleConnect = async (device: PrinterDevice) => {
    setPrinterStatus('connecting');
    setErrorMessage('');
    const success = await printerService.connect(device.name);
    if (success) {
      setConnectedDevice(device);
      setPrinterStatus('connected');
      setRealPrinterConnected(true);
      localStorage.setItem(`printer_${restaurantId}`, JSON.stringify(device));
      onPrinterConnected?.(device);
    } else {
      setPrinterStatus('error');
      setRealPrinterConnected(false);
      setErrorMessage('Failed to connect to printer');
    }
  };

  const handleDisconnect = async () => {
    await printerService.disconnect();
    setConnectedDevice(null);
    setPrinterStatus('disconnected');
    setRealPrinterConnected(false);
    localStorage.removeItem(`printer_${restaurantId}`);
  };

  const handleTestPrint = async () => {
    setTestPrintStatus('printing');
    setErrorMessage('');
    const printer = savedPrinters.length > 0 ? savedPrinters[0] : null;
    const success = await printerService.printTestPage(
      receiptConfig.businessName || restaurantName,
      printer?.paperSize || '58mm'
    );
    setTestPrintStatus(success ? 'success' : 'error');
    if (!success) setErrorMessage('Print failed');
    setTimeout(() => setTestPrintStatus('idle'), 3000);
  };

  // ─── Printer CRUD ──────────────────────────────────────────────

  const savePrinters = (printers: SavedPrinter[]) => {
    setSavedPrinters(printers);
    localStorage.setItem(`printers_${restaurantId}`, JSON.stringify(printers));
    onPrintersChange?.(printers);
  };

  const handleSavePrinter = () => {
    if (!printerForm.name.trim()) return;
    if (editingPrinterId) {
      savePrinters(savedPrinters.map(p => p.id === editingPrinterId ? { ...printerForm, id: editingPrinterId } : p));
    } else {
      savePrinters([...savedPrinters, { ...printerForm, id: Date.now().toString() }]);
    }
    setIsAddingPrinter(false);
    setEditingPrinterId(null);
    setPrinterForm(createDefaultPrinter());
  };

  const handleEditPrinter = (printer: SavedPrinter) => {
    setEditingPrinterId(printer.id);
    setPrinterForm({ ...printer });
    setIsAddingPrinter(true);
  };

  const handleDeletePrinter = (id: string) => {
    savePrinters(savedPrinters.filter(p => p.id !== id));
  };

  // ─── Receipt & Kitchen Config save ─────────────────────────────

  const updateReceiptConfig = <K extends keyof ReceiptConfig>(key: K, value: ReceiptConfig[K]) => {
    const updated = { ...receiptConfig, [key]: value };
    setReceiptConfig(updated);
    localStorage.setItem(`receipt_config_${restaurantId}`, JSON.stringify(updated));
    onReceiptConfigChange?.(updated);
  };

  const updateKitchenConfig = <K extends keyof KitchenTicketConfig>(key: K, value: KitchenTicketConfig[K]) => {
    const updated = { ...kitchenConfig, [key]: value };
    setKitchenConfig(updated);
    localStorage.setItem(`kitchen_config_${restaurantId}`, JSON.stringify(updated));
    onKitchenConfigChange?.(updated);
  };

  // ─── Toggle Component ──────────────────────────────────────────

  const Toggle: React.FC<{ enabled: boolean; onChange: (v: boolean) => void }> = ({ enabled, onChange }) => (
    <button
      onClick={() => onChange(!enabled)}
      className={`w-11 h-6 rounded-full transition-all relative flex-shrink-0 ${enabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
    >
      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${enabled ? 'left-6' : 'left-1'}`} />
    </button>
  );

  // ─── Setting Row ───────────────────────────────────────────────

  const SettingRow: React.FC<{ label: string; description?: string; children: React.ReactNode }> = ({ label, description, children }) => (
    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
      <div className="flex-1 mr-3">
        <p className="text-xs font-black dark:text-white">{label}</p>
        {description && <p className="text-[9px] text-gray-400 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );

  // ─── Render: Printers Tab ──────────────────────────────────────

  const renderPrintersTab = () => (
    <div className="space-y-4">
      {/* Connection Status */}
      <div className={`p-4 rounded-xl border-2 transition-all ${
        printerStatus === 'connected'
          ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
          : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${
            printerStatus === 'connected' ? 'bg-green-500' : printerStatus === 'connecting' ? 'bg-orange-500 animate-pulse' : 'bg-gray-300'
          }`} />
          <div className="flex-1">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
              {printerStatus === 'connected' ? 'Connected' : printerStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
            </p>
            {connectedDevice && <p className="text-xs font-bold dark:text-white mt-0.5">{connectedDevice.name}</p>}
          </div>
          {printerStatus === 'connected' && (
            <button onClick={handleDisconnect} className="text-[9px] font-black text-red-500 uppercase tracking-widest hover:text-red-600">
              Disconnect
            </button>
          )}
        </div>
      </div>

      {/* Scan + Connect */}
      {printerStatus !== 'connected' && isBluetoothSupported && (
        <button
          onClick={handleScan}
          disabled={isScanning}
          className="w-full py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-orange-500 hover:text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isScanning ? (
            <><div className="w-3 h-3 border-2 border-white dark:border-gray-900 border-t-transparent rounded-full animate-spin" /> Scanning...</>
          ) : (
            <><Bluetooth size={14} /> Scan for Printer</>
          )}
        </button>
      )}

      {devices.length > 0 && printerStatus !== 'connected' && (
        <div className="space-y-2">
          {devices.map(device => (
            <button
              key={device.id}
              onClick={() => handleConnect(device)}
              className="w-full p-3 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl flex items-center justify-between hover:border-orange-500 transition-all"
            >
              <span className="font-bold dark:text-white text-xs">{device.name}</span>
              <span className="text-[9px] font-black text-orange-500 uppercase tracking-widest">Connect</span>
            </button>
          ))}
        </div>
      )}

      {/* Test Print & Reprint */}
      {printerStatus === 'connected' && (
        <div className="flex gap-2">
          <button
            onClick={handleTestPrint}
            disabled={testPrintStatus === 'printing'}
            className="flex-1 py-2.5 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl font-black text-[9px] uppercase tracking-widest text-gray-600 dark:text-gray-300 hover:border-orange-500 hover:text-orange-500 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {testPrintStatus === 'printing' ? 'Printing...' : testPrintStatus === 'success' ? (<><CheckCircle2 size={12} className="text-green-500" /> Sent!</>) : (<><Printer size={12} /> Test Print</>)}
          </button>
          <button
            onClick={async () => { try { await printerService.reprintLast(); } catch (err: any) { setErrorMessage(err?.message || 'Reprint failed'); } }}
            disabled={!printerService.hasLastReceipt()}
            className="flex-1 py-2.5 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl font-black text-[9px] uppercase tracking-widest text-gray-600 dark:text-gray-300 hover:border-orange-500 hover:text-orange-500 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
          >
            <RotateCw size={12} /> Reprint
          </button>
        </div>
      )}

      {!isBluetoothSupported && (
        <div className="text-center py-6">
          <AlertCircle size={24} className="mx-auto text-red-400 mb-2" />
          <p className="text-xs font-bold text-gray-500">Bluetooth not supported</p>
          <p className="text-[9px] text-gray-400 mt-1">Use Chrome, Edge, or Opera</p>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-200 dark:border-red-800">
          <p className="text-[9px] text-red-600 dark:text-red-400">{errorMessage}</p>
        </div>
      )}

      {/* ── Saved Printers List ── */}
      <div className="border-t dark:border-gray-700 pt-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Printers</p>
          <span className="text-[9px] font-black text-gray-300">{savedPrinters.length}</span>
        </div>

        {savedPrinters.length === 0 && !isAddingPrinter && (
          <div className="text-center py-8 border border-dashed dark:border-gray-700 rounded-xl">
            <Printer size={24} className="mx-auto text-gray-300 mb-2" />
            <p className="text-[10px] text-gray-400">No printers configured</p>
            <p className="text-[9px] text-gray-300 mt-1">Add a printer to get started</p>
          </div>
        )}

        {savedPrinters.map(printer => (
          <div key={printer.id} className="mb-2 p-4 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex-1" onClick={() => handleEditPrinter(printer)} style={{ cursor: 'pointer' }}>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-black dark:text-white">{printer.name}</p>
                  {printer.printJobs.includes('receipt') && (
                    <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded text-[8px] font-black uppercase">Receipt</span>
                  )}
                  {printer.printJobs.includes('kitchen') && (
                    <span className="px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded text-[8px] font-black uppercase">Kitchen</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[9px] text-gray-400 capitalize">{printer.connectionType}</span>
                  <span className="text-[9px] text-gray-300">&middot;</span>
                  <span className="text-[9px] text-gray-400">{printer.paperSize}</span>
                  <span className="text-[9px] text-gray-300">&middot;</span>
                  <span className="text-[9px] text-gray-400 capitalize">{printer.printDensity}</span>
                  {printer.autoCut && <><span className="text-[9px] text-gray-300">&middot;</span><span className="text-[9px] text-gray-400">Auto-cut</span></>}
                  {printer.cashDrawer && <><span className="text-[9px] text-gray-300">&middot;</span><span className="text-[9px] text-gray-400">Drawer</span></>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => handleEditPrinter(printer)} className="p-2 text-gray-300 hover:text-orange-500 transition-colors">
                  <Settings size={14} />
                </button>
                <button onClick={() => handleDeletePrinter(printer.id)} className="p-2 text-gray-300 hover:text-red-500 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* ── Add / Edit Printer Form ── */}
        {isAddingPrinter ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-4 space-y-4 mt-3">
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                {editingPrinterId ? 'Edit Printer' : 'New Printer'}
              </p>
              <button onClick={() => { setIsAddingPrinter(false); setEditingPrinterId(null); setPrinterForm(createDefaultPrinter()); }} className="text-gray-400 hover:text-red-500">
                <X size={14} />
              </button>
            </div>

            {/* Printer Name */}
            <div>
              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Printer Name</label>
              <input
                type="text"
                value={printerForm.name}
                onChange={e => setPrinterForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
                placeholder="e.g. Receipt Printer, Kitchen Printer"
              />
            </div>

            {/* Connection Type */}
            <div>
              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Connection</label>
              <div className="flex gap-2">
                {([
                  { type: 'bluetooth' as ConnectionType, icon: Bluetooth, label: 'Bluetooth' },
                  { type: 'wifi' as ConnectionType, icon: Wifi, label: 'Wi-Fi' },
                  { type: 'usb' as ConnectionType, icon: Usb, label: 'USB' },
                ]).map(({ type, icon: Icon, label }) => (
                  <button
                    key={type}
                    onClick={() => setPrinterForm(f => ({ ...f, connectionType: type }))}
                    className={`flex-1 py-2.5 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 border transition-all ${
                      printerForm.connectionType === type
                        ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700 text-orange-600'
                        : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-500'
                    }`}
                  >
                    <Icon size={12} /> {label}
                  </button>
                ))}
              </div>
              {printerForm.connectionType === 'wifi' && (
                <div className="mt-2">
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">IP Address</label>
                  <input
                    type="text"
                    value={printerForm.ipAddress || ''}
                    onChange={e => setPrinterForm(f => ({ ...f, ipAddress: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
                    placeholder="192.168.1.100"
                  />
                </div>
              )}
            </div>

            {/* Paper Size */}
            <div>
              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Paper Size</label>
              <div className="flex gap-2">
                {(['58mm', '80mm'] as PaperSize[]).map(size => (
                  <button
                    key={size}
                    onClick={() => setPrinterForm(f => ({ ...f, paperSize: size }))}
                    className={`flex-1 py-2.5 rounded-lg text-[10px] font-black border transition-all ${
                      printerForm.paperSize === size
                        ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700 text-orange-600'
                        : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-500'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Print Density */}
            <div>
              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Print Density</label>
              <div className="flex gap-2">
                {(['light', 'medium', 'dark'] as PrintDensity[]).map(density => (
                  <button
                    key={density}
                    onClick={() => setPrinterForm(f => ({ ...f, printDensity: density }))}
                    className={`flex-1 py-2.5 rounded-lg text-[10px] font-black capitalize border transition-all ${
                      printerForm.printDensity === density
                        ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700 text-orange-600'
                        : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-500'
                    }`}
                  >
                    {density}
                  </button>
                ))}
              </div>
            </div>

            {/* Toggles */}
            <div className="space-y-2">
              <SettingRow label="Auto-Cut" description="Automatically cut paper after printing">
                <Toggle enabled={printerForm.autoCut} onChange={v => setPrinterForm(f => ({ ...f, autoCut: v }))} />
              </SettingRow>
              <SettingRow label="Cash Drawer" description="Cash drawer connected to this printer">
                <Toggle enabled={printerForm.cashDrawer} onChange={v => setPrinterForm(f => ({ ...f, cashDrawer: v }))} />
              </SettingRow>
            </div>

            {/* Print Jobs */}
            <div>
              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Print Jobs</label>
              <div className="space-y-2">
                {([
                  { job: 'receipt' as PrintJobType, icon: FileText, label: 'Receipts', desc: 'Print customer receipts' },
                  { job: 'kitchen' as PrintJobType, icon: UtensilsCrossed, label: 'Kitchen Tickets', desc: 'Print order tickets for kitchen' },
                ]).map(({ job, icon: Icon, label, desc }) => (
                  <label key={job} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl cursor-pointer">
                    <input
                      type="checkbox"
                      checked={printerForm.printJobs.includes(job)}
                      onChange={e => {
                        setPrinterForm(f => ({
                          ...f,
                          printJobs: e.target.checked
                            ? [...f.printJobs, job]
                            : f.printJobs.filter(j => j !== job),
                        }));
                      }}
                      className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                    />
                    <Icon size={16} className="text-gray-400" />
                    <div>
                      <p className="text-xs font-black dark:text-white">{label}</p>
                      <p className="text-[9px] text-gray-400">{desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Kitchen Categories (only if kitchen job selected) */}
            {printerForm.printJobs.includes('kitchen') && categories.length > 0 && (
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Kitchen Categories</label>
                <p className="text-[9px] text-gray-400 mb-2">Select which menu categories this printer handles</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {categories.map(cat => (
                    <label key={cat} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/30 text-[10px] font-bold text-gray-700 dark:text-gray-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={printerForm.kitchenCategories.includes(cat)}
                        onChange={e => {
                          setPrinterForm(f => ({
                            ...f,
                            kitchenCategories: e.target.checked
                              ? [...f.kitchenCategories, cat]
                              : f.kitchenCategories.filter(c => c !== cat),
                          }));
                        }}
                        className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                      />
                      {cat}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Number of Copies */}
            <div>
              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Number of Copies</label>
              <select
                value={printerForm.numberOfCopies}
                onChange={e => setPrinterForm(f => ({ ...f, numberOfCopies: Number(e.target.value) }))}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
              >
                {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => { setIsAddingPrinter(false); setEditingPrinterId(null); setPrinterForm(createDefaultPrinter()); }}
                className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-700 rounded-lg font-black uppercase text-[9px] tracking-widest text-gray-500"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePrinter}
                disabled={!printerForm.name.trim()}
                className="flex-1 py-2.5 bg-orange-500 text-white rounded-lg font-black uppercase text-[9px] tracking-widest hover:bg-orange-600 disabled:opacity-40 transition-all"
              >
                {editingPrinterId ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setIsAddingPrinter(true); setEditingPrinterId(null); setPrinterForm(createDefaultPrinter()); }}
            className="w-full py-3 bg-orange-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-orange-600 transition-all flex items-center justify-center gap-2 mt-3"
          >
            <Plus size={14} /> Add Printer
          </button>
        )}
      </div>
    </div>
  );

  // ─── Render: Receipts Tab ──────────────────────────────────────

  const renderReceiptsTab = () => (
    <div className="space-y-3">
      {/* Business Info */}
      <div className="space-y-3">
        <p className="text-[9px] font-black text-orange-500 uppercase tracking-widest">Business Information</p>
        {([
          { key: 'businessName' as const, label: 'Business Name', placeholder: 'Store name on receipt' },
          { key: 'businessAddress' as const, label: 'Address', placeholder: 'Store address (optional)' },
          { key: 'businessPhone' as const, label: 'Phone', placeholder: 'Contact number (optional)' },
        ]).map(field => (
          <div key={field.key}>
            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">{field.label}</label>
            <input
              type="text"
              value={receiptConfig[field.key]}
              onChange={e => updateReceiptConfig(field.key, e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
              placeholder={field.placeholder}
            />
          </div>
        ))}
      </div>

      {/* Custom Text */}
      <div className="space-y-3 border-t dark:border-gray-700 pt-4">
        <p className="text-[9px] font-black text-orange-500 uppercase tracking-widest">Custom Text</p>
        <div>
          <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Header Text</label>
          <input
            type="text"
            value={receiptConfig.headerText}
            onChange={e => updateReceiptConfig('headerText', e.target.value)}
            className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
            placeholder="Printed above items (optional)"
          />
        </div>
        <div>
          <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Footer Text</label>
          <input
            type="text"
            value={receiptConfig.footerText}
            onChange={e => updateReceiptConfig('footerText', e.target.value)}
            className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
            placeholder="Thank you! Please come again."
          />
        </div>
      </div>

      {/* Show/Hide Fields */}
      <div className="space-y-2 border-t dark:border-gray-700 pt-4">
        <p className="text-[9px] font-black text-orange-500 uppercase tracking-widest mb-2">Visible Fields</p>
        {([
          { key: 'showOrderNumber' as const, label: 'Order Number', desc: 'Show order number on receipt' },
          { key: 'showCashierName' as const, label: 'Cashier Name', desc: 'Show cashier who processed the order' },
          { key: 'showDateTime' as const, label: 'Date & Time', desc: 'Show order date and time' },
          { key: 'showTableNumber' as const, label: 'Table Number', desc: 'Show table number' },
          { key: 'showItems' as const, label: 'Item Details', desc: 'Show ordered items' },
          { key: 'showRemark' as const, label: 'Order Notes', desc: 'Show order remarks/notes' },
          { key: 'showTotal' as const, label: 'Total', desc: 'Show order total' },
          { key: 'showTaxes' as const, label: 'Tax Breakdown', desc: 'Show tax details' },
          { key: 'showOrderSource' as const, label: 'Order Source', desc: 'Show where order came from' },
        ]).map(field => (
          <SettingRow key={field.key} label={field.label} description={field.desc}>
            <Toggle enabled={receiptConfig[field.key]} onChange={v => updateReceiptConfig(field.key, v)} />
          </SettingRow>
        ))}
      </div>

      {/* Printing Behavior */}
      <div className="space-y-2 border-t dark:border-gray-700 pt-4">
        <p className="text-[9px] font-black text-orange-500 uppercase tracking-widest mb-2">Printing Behavior</p>
        <SettingRow label="Auto-Print After Sale" description="Automatically print receipt when order is completed">
          <Toggle enabled={receiptConfig.autoPrintAfterSale} onChange={v => updateReceiptConfig('autoPrintAfterSale', v)} />
        </SettingRow>
        <SettingRow label="Print Receipt for Refunds" description="Print a receipt when processing refunds">
          <Toggle enabled={receiptConfig.printReceiptForRefund} onChange={v => updateReceiptConfig('printReceiptForRefund', v)} />
        </SettingRow>
        <SettingRow label="Open Cash Drawer on Payment" description="Open cash drawer when payment is received">
          <Toggle enabled={receiptConfig.openCashDrawerOnPayment} onChange={v => updateReceiptConfig('openCashDrawerOnPayment', v)} />
        </SettingRow>
      </div>
    </div>
  );

  // ─── Render: Kitchen Tab ───────────────────────────────────────

  const renderKitchenTab = () => (
    <div className="space-y-3">
      <p className="text-[9px] font-black text-orange-500 uppercase tracking-widest mb-2">Kitchen Ticket Settings</p>

      <SettingRow label="Large Order Number" description="Print order number in large font on kitchen tickets">
        <Toggle enabled={kitchenConfig.printLargeOrderNumber} onChange={v => updateKitchenConfig('printLargeOrderNumber', v)} />
      </SettingRow>

      <SettingRow label="Auto-Print on New Order" description="Automatically print kitchen ticket when new order arrives">
        <Toggle enabled={kitchenConfig.autoPrintOnNewOrder} onChange={v => updateKitchenConfig('autoPrintOnNewOrder', v)} />
      </SettingRow>

      <div>
        <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Number of Copies</label>
        <select
          value={kitchenConfig.numberOfCopies}
          onChange={e => updateKitchenConfig('numberOfCopies', Number(e.target.value))}
          className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
        >
          {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      {/* Info about assigning categories */}
      <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-200 dark:border-blue-800">
        <p className="text-[9px] text-blue-600 dark:text-blue-400 font-bold">
          To assign menu categories to a kitchen printer, edit the printer in the Printers tab and select "Kitchen Tickets" as a print job, then choose the categories.
        </p>
      </div>
    </div>
  );

  // ─── Main Render ───────────────────────────────────────────────

  const tabs: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
    { id: 'printers', label: 'Printers', icon: Printer },
    { id: 'receipts', label: 'Receipts', icon: FileText },
    { id: 'kitchen', label: 'Kitchen', icon: UtensilsCrossed },
  ];

  return (
    <div className="space-y-4">
      {/* Tab Navigation */}
      <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-gray-700 text-orange-600 dark:text-orange-400 shadow-sm'
                  : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
            >
              <Icon size={13} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'printers' && renderPrintersTab()}
      {activeTab === 'receipts' && renderReceiptsTab()}
      {activeTab === 'kitchen' && renderKitchenTab()}
    </div>
  );
};

export default PrinterSettings;
