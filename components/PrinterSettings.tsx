import React, { useState, useEffect, useRef } from 'react';
import { Printer, Bluetooth, Plus, Trash2, CheckCircle2, AlertCircle, ChevronDown, ChevronRight, X, Wifi, Usb, Settings, FileText, UtensilsCrossed, RotateCw, ListOrdered, Smartphone, Download, HelpCircle, Building2 } from 'lucide-react';
import printerService, { PrinterDevice, SavedPrinter, ReceiptConfig, OrderListConfig, KitchenTicketConfig, DEFAULT_RECEIPT_CONFIG, DEFAULT_ORDER_LIST_CONFIG, DEFAULT_KITCHEN_TICKET_CONFIG, createDefaultPrinter, PRINTER_MODELS, applyModelPreset } from '../services/printerService';
import type { PaperSize, ConnectionType, PrintDensity, PrintJobType, PrintMode, TextSize, TextFont, TextAlignment } from '../services/printerService';
import { KitchenDepartment } from '../src/types';

interface Props {
  restaurantId: string;
  restaurantName: string;
  categories?: string[];
  /** Kitchen departments for department-to-printer routing */
  departments?: KitchenDepartment[];
  savedPrinters?: SavedPrinter[];
  receiptConfig?: ReceiptConfig;
  orderListConfig?: OrderListConfig;
  kitchenConfig?: KitchenTicketConfig;
  initialTab?: SettingsTab;
  visibleTabs?: SettingsTab[];
  onPrinterConnected?: (device: PrinterDevice) => void;
  onReceiptConfigChange?: (config: ReceiptConfig) => void;
  onOrderListConfigChange?: (config: OrderListConfig) => void;
  onKitchenConfigChange?: (config: KitchenTicketConfig) => void;
  onPrintersChange?: (printers: SavedPrinter[]) => void;
}

type SettingsTab = 'printers' | 'receipts' | 'orderList' | 'kitchen' | 'help';

const PrinterSettings: React.FC<Props> = ({
  restaurantId,
  restaurantName,
  categories = [],
  departments,
  savedPrinters: propPrinters,
  receiptConfig: propReceiptConfig,
  orderListConfig: propOrderListConfig,
  kitchenConfig: propKitchenConfig,
  initialTab = 'printers',
  visibleTabs,
  onPrinterConnected,
  onReceiptConfigChange,
  onOrderListConfigChange,
  onKitchenConfigChange,
  onPrintersChange,
}) => {
  // ─── State ──────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [isBluetoothSupported, setIsBluetoothSupported] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState<PrinterDevice | null>(null);
  const [printerStatus, setPrinterStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [realPrinterConnected, setRealPrinterConnected] = useState(false);
  const [testPrintStatus, setTestPrintStatus] = useState<'idle' | 'printing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [sunmiStatus, setSunmiStatus] = useState(() => printerService.getSunmiIntegrationStatus());

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
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const printServerRef = useRef<HTMLTextAreaElement>(null);

  const normalizeReceiptConfig = (config: Partial<ReceiptConfig> | null | undefined): ReceiptConfig => {
    const legacyAddress = typeof (config as (Partial<ReceiptConfig> & { businessAddress?: string }) | null | undefined)?.businessAddress === 'string'
      ? (config as (Partial<ReceiptConfig> & { businessAddress?: string })).businessAddress
      : '';

    return {
      ...DEFAULT_RECEIPT_CONFIG,
      businessName: restaurantName,
      ...(config || {}),
      businessAddressLine1: config?.businessAddressLine1 || legacyAddress || '',
      businessAddressLine2: config?.businessAddressLine2 || '',
    };
  };

  const normalizeOrderListConfig = (config: Partial<OrderListConfig> | null | undefined): OrderListConfig => {
    const legacyAddress = typeof (config as (Partial<OrderListConfig> & { businessAddress?: string }) | null | undefined)?.businessAddress === 'string'
      ? (config as (Partial<OrderListConfig> & { businessAddress?: string })).businessAddress
      : '';

    return {
      ...DEFAULT_ORDER_LIST_CONFIG,
      businessName: restaurantName,
      ...(config || {}),
      businessAddressLine1: config?.businessAddressLine1 || legacyAddress || '',
      businessAddressLine2: config?.businessAddressLine2 || '',
    };
  };

  // Receipt config
  const [receiptConfig, setReceiptConfig] = useState<ReceiptConfig>(() => {
    if (propReceiptConfig) return normalizeReceiptConfig(propReceiptConfig);
    const saved = localStorage.getItem(`receipt_config_${restaurantId}`);
    if (saved) {
      try {
        return normalizeReceiptConfig(JSON.parse(saved));
      } catch {}
    }
    return normalizeReceiptConfig({ businessName: restaurantName });
  });

  // Order-list config
  const [orderListConfig, setOrderListConfig] = useState<OrderListConfig>(() => {
    if (propOrderListConfig) return normalizeOrderListConfig(propOrderListConfig);
    const saved = localStorage.getItem(`order_list_config_${restaurantId}`);
    if (saved) {
      try {
        return normalizeOrderListConfig(JSON.parse(saved));
      } catch {}
    }
    return normalizeOrderListConfig({ businessName: restaurantName });
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
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const currentSunmiStatus = printerService.getSunmiIntegrationStatus();
    setSunmiStatus(currentSunmiStatus);

    if (!(('bluetooth' in navigator) && (navigator as any).bluetooth)) {
      setIsBluetoothSupported(false);
      if (!currentSunmiStatus.available) {
        setErrorMessage(currentSunmiStatus.likelySunmiDevice
          ? 'SUNMI device detected, but the printer bridge is not available. Open QuickServe from the SUNMI WebView wrapper to use the built-in printer.'
          : 'Web Bluetooth not supported. Use Chrome, Edge, Opera, or the SUNMI printer bridge.');
      }
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
      setSunmiStatus(printerService.getSunmiIntegrationStatus());
      setRealPrinterConnected(connected);
      if (connectedDevice) setPrinterStatus(connected ? 'connected' : 'disconnected');
    }, 3000);
    return () => clearInterval(interval);
  }, [connectedDevice]);

  // ─── Printer Actions ───────────────────────────────────────────

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

  const handleConnectSunmi = async () => {
    setPrinterStatus('connecting');
    setErrorMessage('');
    const device: PrinterDevice = { id: 'sunmi-inner-printer', name: 'SUNMI Built-in Printer' };
    const success = await printerService.connect(device.name);
    const status = printerService.getSunmiIntegrationStatus();
    setSunmiStatus(status);

    if (success) {
      setConnectedDevice(device);
      setPrinterStatus('connected');
      setRealPrinterConnected(true);
      setPrinterForm(f => {
        const next = applyModelPreset(f, f.printerModel.startsWith('sunmi_') ? f.printerModel : 'sunmi_v2');
        return {
          ...next,
          name: f.name.trim() ? f.name : 'SUNMI Built-in Printer',
          connectionType: 'sunmi',
          deviceId: device.id,
          deviceName: device.name,
          paperSize: '58mm',
          printWidth: 384,
          printResolution: 205,
          autoCut: false,
        };
      });
      localStorage.setItem(`printer_${restaurantId}`, JSON.stringify(device));
      onPrinterConnected?.(device);
      return;
    }

    setPrinterStatus('error');
    setRealPrinterConnected(false);
    setErrorMessage(status.likelySunmiDevice
      ? 'SUNMI printer bridge not found. Install or open QuickServe through the SUNMI WebView wrapper.'
      : 'SUNMI bridge not available on this browser.');
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

  // ─── Download print-server.js ──────────────────────────────────
  const handleDownloadPrintServer = () => {
    // Fetch the file and trigger download
    fetch('/print-server.js')
      .then(res => res.text())
      .then(content => {
        const blob = new Blob([content], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'print-server.js';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      })
      .catch(() => {
        // Fallback: show content in textarea for manual copy
        setErrorMessage('Could not download. Copy the content from the Help tab.');
        setTimeout(() => setErrorMessage(''), 5000);
      });
  };

  // ─── Receipt & Kitchen Config save ─────────────────────────────

  const updateReceiptConfig = <K extends keyof ReceiptConfig>(key: K, value: ReceiptConfig[K]) => {
    const updated = { ...receiptConfig, [key]: value };
    setReceiptConfig(updated);
    localStorage.setItem(`receipt_config_${restaurantId}`, JSON.stringify(updated));
    onReceiptConfigChange?.(updated);
  };

  const updateOrderListConfig = <K extends keyof OrderListConfig>(key: K, value: OrderListConfig[K]) => {
    const updated = { ...orderListConfig, [key]: value };
    setOrderListConfig(updated);
    localStorage.setItem(`order_list_config_${restaurantId}`, JSON.stringify(updated));
    onOrderListConfigChange?.(updated);
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
    <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-4 lg:gap-8">
      <div>
        <p className="text-xs font-black text-orange-500 uppercase tracking-widest">Printer Setup</p>
        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">Connect printers and manage printer profiles.</p>
      </div>
      <div className="min-w-0 space-y-4">
      {printerStatus === 'connected' && (
        <>
          <div className="p-4 rounded-xl border-2 transition-all bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
              <div className="flex-1">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Connected</p>
                {connectedDevice && <p className="text-xs font-bold dark:text-white mt-0.5">{connectedDevice.name}</p>}
              </div>
              <button onClick={handleDisconnect} className="text-[9px] font-black text-red-500 uppercase tracking-widest hover:text-red-600">
                Disconnect
              </button>
            </div>
          </div>

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
        </>
      )}

      {!isBluetoothSupported && !sunmiStatus.available && (
        <div className="text-center py-6">
          <AlertCircle size={24} className="mx-auto text-red-400 mb-2" />
          <p className="text-xs font-bold text-gray-500">
            {sunmiStatus.likelySunmiDevice ? 'SUNMI bridge not available' : 'Bluetooth not supported'}
          </p>
          <p className="text-[9px] text-gray-400 mt-1">
            {sunmiStatus.likelySunmiDevice
              ? 'Open QuickServe from the SUNMI WebView wrapper to print with the built-in printer.'
              : 'Use Chrome, Edge, Opera, or the SUNMI printer bridge.'}
          </p>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-200 dark:border-red-800">
          <p className="text-[9px] text-red-600 dark:text-red-400">{errorMessage}</p>
        </div>
      )}

      {/* ── Saved Printers List ── */}
      <div className="pt-4">
        <div className="flex items-center mb-3">
          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Printers</p>
          <div className="flex-1" />
          <button
            onClick={handleDownloadPrintServer}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg text-[8px] font-black text-gray-500 hover:text-orange-500 transition-all"
            title="Download print-server.js for LAN printing"
          >
            <Download size={10} /> Proxy Script
          </button>
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
                  <span className="text-[9px] text-gray-400">
                    {printer.printerModel === 'other' ? 'Custom' : (PRINTER_MODELS.find(m => m.id === printer.printerModel)?.name || printer.printerModel || 'Custom')}
                  </span>
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
              <button onClick={() => { setIsAddingPrinter(false); setEditingPrinterId(null); setPrinterForm(createDefaultPrinter()); setShowAdvancedSettings(false); }} className="text-gray-400 hover:text-red-500">
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

            {/* Printer Model */}
            <div>
              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Printer Model</label>
              <select
                value={printerForm.printerModel}
                onChange={e => {
                  const modelId = e.target.value;
                  setPrinterForm(f => applyModelPreset(f, modelId));
                  if (modelId === 'other') setShowAdvancedSettings(true);
                }}
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
              >
                {Object.entries(
                  PRINTER_MODELS.reduce<Record<string, typeof PRINTER_MODELS>>((acc, m) => {
                    (acc[m.brand] = acc[m.brand] || []).push(m);
                    return acc;
                  }, {})
                ).map(([brand, models]) => (
                  <optgroup key={brand} label={brand}>
                    {models.map(m => (
                      <option key={m.id} value={m.id}>{m.name} ({m.paperSize})</option>
                    ))}
                  </optgroup>
                ))}
                <option value="other">Other (Manual Configuration)</option>
              </select>
            </div>

            {/* Connection Type */}
            <div>
              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Interface</label>
              <div className="flex gap-2">
                {([
                  { type: 'sunmi' as ConnectionType, icon: Smartphone, label: 'SUNMI' },
                  { type: 'bluetooth' as ConnectionType, icon: Bluetooth, label: 'Bluetooth' },
                  { type: 'wifi' as ConnectionType, icon: Wifi, label: 'Ethernet' },
                  { type: 'usb' as ConnectionType, icon: Usb, label: 'USB' },
                ]).map(({ type, icon: Icon, label }) => (
                  <button
                    key={type}
                    onClick={() => setPrinterForm(f => {
                      if (type !== 'sunmi') return { ...f, connectionType: type };
                      const next = applyModelPreset(f, f.printerModel.startsWith('sunmi_') ? f.printerModel : 'sunmi_v2');
                      return {
                        ...next,
                        connectionType: 'sunmi',
                        name: f.name.trim() ? f.name : 'SUNMI Built-in Printer',
                        deviceId: 'sunmi-inner-printer',
                        deviceName: 'SUNMI Built-in Printer',
                        paperSize: '58mm',
                        printWidth: 384,
                        printResolution: 205,
                        autoCut: false,
                      };
                    })}
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

              {/* SUNMI: Built-in printer bridge */}
              {printerForm.connectionType === 'sunmi' && printerStatus !== 'connected' && (
                <div className="mt-2 space-y-2">
                  <div className={`p-2.5 rounded-lg border ${
                    sunmiStatus.available
                      ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
                      : 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800'
                  }`}>
                    <div className="flex items-start gap-2">
                      {sunmiStatus.available ? (
                        <CheckCircle2 size={13} className="text-green-500 mt-0.5" />
                      ) : (
                        <AlertCircle size={13} className="text-amber-500 mt-0.5" />
                      )}
                      <div>
                        <p className={`text-[9px] font-black uppercase tracking-widest ${sunmiStatus.available ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}>
                          {sunmiStatus.available ? 'SUNMI Bridge Ready' : 'SUNMI Bridge Required'}
                        </p>
                        <p className={`text-[9px] mt-0.5 ${sunmiStatus.available ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}>
                          {sunmiStatus.available
                            ? `Detected ${sunmiStatus.bridgeName || 'printer bridge'} for the built-in printer.`
                            : sunmiStatus.likelySunmiDevice
                              ? 'This looks like a SUNMI device, but the browser does not expose the printer bridge.'
                              : 'Use this when QuickServe is opened inside the SUNMI WebView wrapper.'}
                        </p>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleConnectSunmi}
                    disabled={printerStatus === 'connecting'}
                    className="w-full py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg font-black text-[9px] uppercase tracking-widest hover:bg-orange-500 hover:text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {printerStatus === 'connecting' ? (
                      <><div className="w-3 h-3 border-2 border-white dark:border-gray-900 border-t-transparent rounded-full animate-spin" /> Connecting...</>
                    ) : (
                      <><Smartphone size={12} /> Connect Built-in Printer</>
                    )}
                  </button>
                </div>
              )}

              {/* Bluetooth: Scan & Pair */}
              {printerForm.connectionType === 'bluetooth' && printerStatus !== 'connected' && isBluetoothSupported && (
                <div className="mt-2 space-y-2">
                  <button
                    onClick={async () => {
                      setIsScanning(true);
                      setErrorMessage('');
                      const found = await printerService.scanForPrinters();
                      setIsScanning(false);
                      if (found.length > 0) {
                        setPrinterForm(f => ({ ...f, deviceId: found[0].id, deviceName: found[0].name }));
                        // Auto-connect
                        const success = await printerService.connect(found[0].name);
                        if (success) {
                          setConnectedDevice(found[0]);
                          setPrinterStatus('connected');
                          setRealPrinterConnected(true);
                          localStorage.setItem(`printer_${restaurantId}`, JSON.stringify(found[0]));
                          onPrinterConnected?.(found[0]);
                        }
                      }
                    }}
                    disabled={isScanning}
                    className="w-full py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg font-black text-[9px] uppercase tracking-widest hover:bg-orange-500 hover:text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isScanning ? (
                      <><div className="w-3 h-3 border-2 border-white dark:border-gray-900 border-t-transparent rounded-full animate-spin" /> Scanning...</>
                    ) : (
                      <><Bluetooth size={12} /> Scan & Pair Bluetooth</>
                    )}
                  </button>
                  {printerForm.deviceName && (
                    <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/10 rounded-lg border border-green-200 dark:border-green-800">
                      <CheckCircle2 size={12} className="text-green-500" />
                      <span className="text-[10px] font-bold text-green-700 dark:text-green-400">{printerForm.deviceName}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Ethernet: Network Printer via Print Server */}
              {printerForm.connectionType === 'wifi' && (
                <div className="mt-2 space-y-2">
                  <div>
                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Print Server URL (required)</label>
                    <input
                      type="text"
                      value={printerForm.printServerUrl || ''}
                      onChange={e => setPrinterForm(f => ({ ...f, printServerUrl: e.target.value }))}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white font-mono"
                      placeholder="http://192.168.1.50:3001"
                    />
                    <p className="text-[8px] text-gray-400 mt-1">IP:port of the device running print-server.js on your LAN</p>
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Printer IP Address</label>
                    <input
                      type="text"
                      value={printerForm.ipAddress || ''}
                      onChange={e => setPrinterForm(f => ({ ...f, ipAddress: e.target.value }))}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
                      placeholder="192.168.1.100"
                    />
                    <p className="text-[8px] text-gray-400 mt-1">IP address of the thermal printer on your LAN</p>
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Printer Port</label>
                    <input
                      type="number"
                      value={printerForm.printerPort || 9100}
                      onChange={e => setPrinterForm(f => ({ ...f, printerPort: Number(e.target.value) || 9100 }))}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
                      placeholder="9100"
                    />
                    <p className="text-[8px] text-gray-400 mt-1">Default is 9100 for ESC/POS over TCP</p>
                  </div>
                  {printerForm.printServerUrl && (
                    <button
                      onClick={async () => {
                        setErrorMessage('');
                        try {
                          const ok = await printerService.checkNetworkPrinterHealth(printerForm.printServerUrl!);
                          if (ok) {
                            setErrorMessage('Print server reachable!');
                            setTimeout(() => setErrorMessage(''), 3000);
                          } else {
                            setErrorMessage('Cannot reach print server. Check the URL and ensure print-server.js is running.');
                          }
                        } catch {
                          setErrorMessage('Connection check failed.');
                        }
                      }}
                      className="w-full py-2 bg-gray-100 dark:bg-gray-700 border dark:border-gray-600 rounded-lg text-[10px] font-bold text-gray-600 dark:text-gray-300 hover:border-orange-500 transition-all"
                    >
                      Test Connection
                    </button>
                  )}
                </div>
              )}

              {/* USB: device selection info */}
              {printerForm.connectionType === 'usb' && (
                <div className="mt-2 p-2.5 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800">
                  <p className="text-[9px] text-blue-600 dark:text-blue-400 font-bold">USB printers connect via your system dialog. Select your USB device when prompted by the browser.</p>
                </div>
              )}
            </div>

            {/* Paper Size */}
            <div>
              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Paper Width</label>
              <div className="flex gap-2">
                {(['58mm', '80mm'] as PaperSize[]).map(size => (
                  <button
                    key={size}
                    onClick={() => setPrinterForm(f => ({ ...f, paperSize: size, printWidth: size === '80mm' ? 576 : 384 }))}
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

            {/* ── Department Assignment ── */}
            {departments && departments.length > 0 && (
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">
                  <Building2 size={12} className="inline mr-1" />
                  Kitchen Department
                </label>
                <p className="text-[8px] text-gray-400 mb-2">Tie this printer to a kitchen department. Kitchen tickets route to the matching printer.</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setPrinterForm(f => ({ ...f, departmentId: undefined }))}
                    className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                      !printerForm.departmentId
                        ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700 text-orange-600'
                        : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-500'
                    }`}
                  >
                    All Departments
                  </button>
                  {departments.map(dept => (
                    <button
                      key={dept.name}
                      onClick={() => setPrinterForm(f => ({ ...f, departmentId: dept.name }))}
                      className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                        printerForm.departmentId === dept.name
                          ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700 text-orange-600'
                          : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-500'
                      }`}
                    >
                      {dept.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Kitchen Categories (only if kitchen job selected) ── */}
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
                onClick={() => { setIsAddingPrinter(false); setEditingPrinterId(null); setPrinterForm(createDefaultPrinter()); setShowAdvancedSettings(false); }}
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
            onClick={() => { setIsAddingPrinter(true); setEditingPrinterId(null); setPrinterForm(createDefaultPrinter()); setShowAdvancedSettings(false); }}
            className="w-full py-3 bg-orange-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-orange-600 transition-all flex items-center justify-center gap-2 mt-3"
          >
            <Plus size={14} /> Add Printer
          </button>
        )}
      </div>
    </div>
  </div>
  );

  // ─── Render: Receipts Tab ──────────────────────────────────────

  const renderReceiptsTab = () => (
    <div className="divide-y divide-dotted divide-gray-200 dark:divide-gray-700">
      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-4 lg:gap-8 py-5 first:pt-0">
        <div>
          <p className="text-xs font-black text-orange-500 uppercase tracking-widest">Business Information</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">Business details shown on printed receipts.</p>
        </div>
        <div className="min-w-0 space-y-3">
          {([
            { key: 'businessName' as const, label: 'Business Name', placeholder: 'Store name on receipt' },
            { key: 'businessAddressLine1' as const, label: 'Address Line 1', placeholder: 'Street address (optional)' },
            { key: 'businessAddressLine2' as const, label: 'Address Line 2', placeholder: 'Suite, unit, city, state (optional)' },
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-4 lg:gap-8 py-5">
        <div>
          <p className="text-xs font-black text-orange-500 uppercase tracking-widest">Custom Text</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">Optional header and footer lines on receipts.</p>
        </div>
        <div className="min-w-0 space-y-3">
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-4 lg:gap-8 py-5">
        <div>
          <p className="text-xs font-black text-orange-500 uppercase tracking-widest">Text Formatting</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">Control size, font, and alignment per text block.</p>
        </div>
        <div className="min-w-0 space-y-3">
          {([
            { prefix: 'document' as const, label: 'Type (Payment Receipt)' },
            { prefix: 'title' as const, label: 'Title (Business Name)' },
            { prefix: 'header' as const, label: 'Header Text' },
            { prefix: 'footer' as const, label: 'Footer Text' },
          ]).map(({ prefix, label }) => (
            <div key={prefix} className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl space-y-2">
              <p className="text-[9px] font-black text-gray-500 dark:text-gray-300 uppercase tracking-widest">{label}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-[8px] font-bold text-gray-400 mb-1">Size</label>
                  <select
                    value={receiptConfig[`${prefix}Size`]}
                    onChange={e => updateReceiptConfig(`${prefix}Size`, Number(e.target.value) as TextSize)}
                    className="w-full px-2 py-1.5 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded text-[10px] font-bold dark:text-white"
                  >
                    <option value={1}>Normal</option>
                    <option value={2}>Large</option>
                    <option value={3}>Extra Large</option>
                    <option value={4}>Huge</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[8px] font-bold text-gray-400 mb-1">Font</label>
                  <select
                    value={receiptConfig[`${prefix}Font`]}
                    onChange={e => updateReceiptConfig(`${prefix}Font`, e.target.value as TextFont)}
                    className="w-full px-2 py-1.5 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded text-[10px] font-bold dark:text-white"
                  >
                    <option value="A">Font A (Standard)</option>
                    <option value="B">Font B (Compact)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[8px] font-bold text-gray-400 mb-1">Align</label>
                  <select
                    value={receiptConfig[`${prefix}Alignment`]}
                    onChange={e => updateReceiptConfig(`${prefix}Alignment`, e.target.value as TextAlignment)}
                    className="w-full px-2 py-1.5 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded text-[10px] font-bold dark:text-white"
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-4 lg:gap-8 py-5">
        <div>
          <p className="text-xs font-black text-orange-500 uppercase tracking-widest">Visible Fields</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">Choose which details are printed on each receipt.</p>
        </div>
        <div className="min-w-0 divide-y divide-dotted divide-gray-200 dark:divide-gray-700">
          {([
            { key: 'showOrderNumber' as const, label: 'Order Number', desc: 'Show order number on receipt' },
            { key: 'showCashierName' as const, label: 'Cashier Name', desc: 'Show cashier who processed the order' },
            { key: 'showDateTime' as const, label: 'Date & Time', desc: 'Show order date and time' },
            { key: 'showTableNumber' as const, label: 'Table Number', desc: 'Show table number' },
            { key: 'showDiningOption' as const, label: 'Dining Option', desc: 'Show dining option (Dine-in, Takeaway, etc.)' },
            { key: 'showItems' as const, label: 'Item Details', desc: 'Show ordered items' },
            { key: 'showRemark' as const, label: 'Order Notes', desc: 'Show order remarks/notes' },
            { key: 'showTotal' as const, label: 'Total', desc: 'Show order total' },
            { key: 'showAmountReceived' as const, label: 'Amount Received', desc: 'Show amount paid by customer' },
            { key: 'showChange' as const, label: 'Total Change', desc: 'Show change given to customer' },
            { key: 'showTaxes' as const, label: 'Tax Breakdown', desc: 'Show tax details' },
            { key: 'showOrderSource' as const, label: 'Order Source', desc: 'Show where order came from' },
          ]).map(field => (
            <div key={field.key} className="flex flex-col gap-3 py-5 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{field.label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{field.desc}</p>
              </div>
              <div className="flex items-center self-end sm:self-auto shrink-0">
                <button
                  onClick={() => updateReceiptConfig(field.key, !receiptConfig[field.key])}
                  className={`w-11 h-6 rounded-full transition-all relative ${receiptConfig[field.key] ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${receiptConfig[field.key] ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );

  // ─── Render: Order List Tab ───────────────────────────────────

  const renderOrderListTab = () => (
    <div className="divide-y divide-dotted divide-gray-200 dark:divide-gray-700">
      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-4 lg:gap-8 py-5 first:pt-0">
        <div>
          <p className="text-xs font-black text-orange-500 uppercase tracking-widest">Business Information</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">Business details shown on printed order lists.</p>
        </div>
        <div className="min-w-0 space-y-3">
          {([
            { key: 'businessName' as const, label: 'Business Name', placeholder: 'Store name on order list' },
            { key: 'businessAddressLine1' as const, label: 'Address Line 1', placeholder: 'Street address (optional)' },
            { key: 'businessAddressLine2' as const, label: 'Address Line 2', placeholder: 'Suite, unit, city, state (optional)' },
            { key: 'businessPhone' as const, label: 'Phone', placeholder: 'Contact number (optional)' },
          ]).map(field => (
            <div key={field.key}>
              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">{field.label}</label>
              <input
                type="text"
                value={orderListConfig[field.key]}
                onChange={e => updateOrderListConfig(field.key, e.target.value)}
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
                placeholder={field.placeholder}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-4 lg:gap-8 py-5">
        <div>
          <p className="text-xs font-black text-orange-500 uppercase tracking-widest">Text Formatting</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">Control size, font, and alignment per text block.</p>
        </div>
        <div className="min-w-0 space-y-3">
          {([
            { prefix: 'document' as const, label: 'Type (Order List)' },
            { prefix: 'title' as const, label: 'Title (Business Name)' },
            { prefix: 'header' as const, label: 'Header Text' },
            { prefix: 'paymentStatus' as const, label: 'Payment Status' },
          ]).map(({ prefix, label }) => (
            <div key={prefix} className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl space-y-2">
              <p className="text-[9px] font-black text-gray-500 dark:text-gray-300 uppercase tracking-widest">{label}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-[8px] font-bold text-gray-400 mb-1">Size</label>
                  <select
                    value={orderListConfig[`${prefix}Size`]}
                    onChange={e => updateOrderListConfig(`${prefix}Size`, Number(e.target.value) as TextSize)}
                    className="w-full px-2 py-1.5 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded text-[10px] font-bold dark:text-white"
                  >
                    <option value={1}>Normal</option>
                    <option value={2}>Large</option>
                    <option value={3}>Extra Large</option>
                    <option value={4}>Huge</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[8px] font-bold text-gray-400 mb-1">Font</label>
                  <select
                    value={orderListConfig[`${prefix}Font`]}
                    onChange={e => updateOrderListConfig(`${prefix}Font`, e.target.value as TextFont)}
                    className="w-full px-2 py-1.5 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded text-[10px] font-bold dark:text-white"
                  >
                    <option value="A">Font A (Standard)</option>
                    <option value="B">Font B (Compact)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[8px] font-bold text-gray-400 mb-1">Align</label>
                  <select
                    value={orderListConfig[`${prefix}Alignment`]}
                    onChange={e => updateOrderListConfig(`${prefix}Alignment`, e.target.value as TextAlignment)}
                    className="w-full px-2 py-1.5 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded text-[10px] font-bold dark:text-white"
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-4 lg:gap-8 py-5 last:pb-0">
        <div>
          <p className="text-xs font-black text-orange-500 uppercase tracking-widest">Visible Fields</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">Control what your kitchen/prep team sees on the order list.</p>
        </div>
        <div className="min-w-0 divide-y divide-dotted divide-gray-200 dark:divide-gray-700">
          {([
            { key: 'showOrderNumber' as const, label: 'Order Number', desc: 'Show order number on order list' },
            { key: 'showDateTime' as const, label: 'Date & Time', desc: 'Show order date and time' },
            { key: 'showTableNumber' as const, label: 'Table Number', desc: 'Show table number' },
            { key: 'showDiningOption' as const, label: 'Dining Option', desc: 'Show dining option (Dine-in, Takeaway, etc.)' },
            { key: 'showItems' as const, label: 'Item Details', desc: 'Show ordered items' },
            { key: 'showItemPrice' as const, label: 'Item Price', desc: 'Show item prices on each line' },
            { key: 'showRemark' as const, label: 'Order Notes', desc: 'Show order remarks/notes' },
            { key: 'showCashierName' as const, label: 'Cashier Name', desc: 'Show cashier name if available' },
            { key: 'showOrderSource' as const, label: 'Order Source', desc: 'Show where order came from' },
            { key: 'showTotal' as const, label: 'Total', desc: 'Show grand total amount' },
            { key: 'showPaymentMethod' as const, label: 'Payment Method', desc: 'Show payment method details' },
          ]).map(field => (
            <div key={field.key} className="flex flex-col gap-3 py-5 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{field.label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{field.desc}</p>
              </div>
              <div className="flex items-center self-end sm:self-auto shrink-0">
                <button
                  onClick={() => updateOrderListConfig(field.key, !orderListConfig[field.key])}
                  className={`w-11 h-6 rounded-full transition-all relative ${orderListConfig[field.key] ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${orderListConfig[field.key] ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ─── Render: Kitchen Tab ───────────────────────────────────────

  const renderKitchenTab = () => (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-4 lg:gap-8">
      <div>
        <p className="text-xs font-black text-orange-500 uppercase tracking-widest">Kitchen Ticket Settings</p>
        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">Configure default print behavior for kitchen tickets.</p>
      </div>
      <div className="min-w-0 space-y-3">
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
    </div>
  );

  // ─── Render: Help Tab ──────────────────────────────────────────

  const renderHelpTab = () => (
    <div className="grid grid-cols-1 gap-6">
      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-4 lg:gap-8">
        <div>
          <p className="text-xs font-black text-orange-500 uppercase tracking-widest">LAN Printer Setup</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">How to print over your local network.</p>
        </div>
        <div className="min-w-0 space-y-4">
          {/* Step 1 */}
          <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center text-[10px] font-black">1</div>
              <p className="text-xs font-black dark:text-white">Download the print proxy script</p>
            </div>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-2">
              Download <strong>print-server.js</strong> and save it to the device on your LAN that will act as the print proxy.
            </p>
            <button
              onClick={handleDownloadPrintServer}
              className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 text-white rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-orange-600 transition-all"
            >
              <Download size={14} /> Download print-server.js
            </button>
          </div>

          {/* Step 2 */}
          <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center text-[10px] font-black">2</div>
              <p className="text-xs font-black dark:text-white">Run it on a LAN device</p>
            </div>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-2">
              On any PC, laptop, or Android tablet with <strong>Termux + Node.js</strong> installed:
            </p>
            <div className="bg-gray-900 text-green-300 rounded-lg p-3 font-mono text-[10px] leading-relaxed">
              <div>node print-server.js</div>
            </div>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-2">
              Keep it running in the background. Takes note of the IP shown (e.g. <code>192.168.1.50</code>).
            </p>
          </div>

          {/* Step 3 */}
          <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center text-[10px] font-black">3</div>
              <p className="text-xs font-black dark:text-white">Connect your printer via Ethernet</p>
            </div>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">
              Connect your thermal printer's RJ45 port to your LAN switch. Find its IP address from the printer's network settings menu.
              Most thermal printers use <strong>port 9100</strong> for raw ESC/POS data.
            </p>
          </div>

          {/* Step 4 */}
          <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center text-[10px] font-black">4</div>
              <p className="text-xs font-black dark:text-white">Add printer in QuickServe</p>
            </div>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-2">
              Go to the <strong>Printers</strong> tab, click <strong>Add Printer</strong>, and select <strong>Ethernet</strong> interface. Fill in:
            </p>
            <ul className="text-[10px] text-gray-500 dark:text-gray-400 space-y-1 ml-4 list-disc">
              <li><strong>Print Server URL</strong> — e.g. <code>http://192.168.1.50:3001</code></li>
              <li><strong>Printer IP</strong> — your printer's LAN IP</li>
              <li><strong>Printer Port</strong> — usually 9100</li>
            </ul>
          </div>

          {/* Step 5 */}
          <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center text-[10px] font-black">5</div>
              <p className="text-xs font-black dark:text-white">Assign departments & print jobs</p>
            </div>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">
              Each printer can be assigned to a <strong>Kitchen Department</strong> (e.g. Kitchen, Drinks, Grill) so tickets route to the right printer automatically.
              You can also assign menu categories and select Receipt / Kitchen ticket jobs. Add as many printers as you need.
            </p>
          </div>

          {/* Topology diagram */}
          <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-200 dark:border-blue-800">
            <p className="text-[10px] font-black text-blue-700 dark:text-blue-400 uppercase tracking-widest mb-2">Network Topology</p>
            <div className="text-[10px] text-blue-600 dark:text-blue-400 font-mono leading-relaxed">
              <div>┌──────────┐    WiFi/LAN    ┌────────────────┐    LAN Cable    ┌──────────┐</div>
              <div>│  Tablet   │ ─────────────→ │ print-server.js │ ─────────────→ │ Printer  │</div>
              <div>│ (browser) │                │ (any LAN device)│    Port 9100   │ (RJ45)   │</div>
              <div>└──────────┘                └────────────────┘                └──────────┘</div>
            </div>
          </div>

          {/* Termux instructions */}
          <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl border dark:border-gray-700">
            <p className="text-[10px] font-black text-gray-700 dark:text-gray-300 uppercase tracking-widest mb-2">Android Tablet (Termux) Setup</p>
            <div className="bg-gray-900 text-green-300 rounded-lg p-3 font-mono text-[10px] leading-relaxed">
              <div># 1. Install Termux from F-Droid (not Google Play)</div>
              <div># 2. Install Node.js:</div>
              <div>pkg install nodejs -y</div>
              <div># 3. Copy print-server.js to your tablet</div>
              <div># 4. Run the proxy:</div>
              <div>node ~/storage/downloads/print-server.js</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ─── Main Render ───────────────────────────────────────────────

  const tabs: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
    { id: 'printers', label: 'Printers', icon: Printer },
    { id: 'receipts', label: 'Receipts', icon: FileText },
    { id: 'orderList', label: 'Order List', icon: ListOrdered },
    { id: 'kitchen', label: 'Kitchen', icon: UtensilsCrossed },
    { id: 'help', label: 'Help', icon: HelpCircle },
  ];

  const filteredTabs = visibleTabs && visibleTabs.length > 0
    ? tabs.filter(tab => visibleTabs.includes(tab.id))
    : tabs;

  useEffect(() => {
    if (filteredTabs.length === 0) return;
    const isActiveVisible = filteredTabs.some(tab => tab.id === activeTab);
    if (!isActiveVisible) setActiveTab(filteredTabs[0].id);
  }, [activeTab, filteredTabs]);

  return (
    <div className="space-y-4">
      {/* Tab Navigation */}
      {filteredTabs.length > 1 && (
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          {filteredTabs.map(tab => {
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
      )}

      {/* Tab Content */}
      {activeTab === 'printers' && renderPrintersTab()}
      {activeTab === 'receipts' && renderReceiptsTab()}
      {activeTab === 'orderList' && renderOrderListTab()}
      {activeTab === 'kitchen' && renderKitchenTab()}
      {activeTab === 'help' && renderHelpTab()}
    </div>
  );
};

export default PrinterSettings;