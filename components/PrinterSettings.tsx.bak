import React, { useState, useEffect } from 'react';
import { Printer, Bluetooth, BluetoothConnected, CheckCircle2, AlertCircle, X } from 'lucide-react';
import printerService, { PrinterDevice } from '../services/printerService';

interface Props {
  restaurantId: string;
  onPrinterConnected?: (connected: boolean) => void;
}

const PrinterSettings: React.FC<Props> = ({ restaurantId, onPrinterConnected }) => {
  const [isSupported, setIsSupported] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<PrinterDevice[]>([]);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'printing' | 'success' | 'error'>('idle');

  useEffect(() => {
    // Check Web Bluetooth support
    if (!navigator.bluetooth) {
      setIsSupported(false);
      setError('Web Bluetooth not supported. Use Chrome, Edge, or Opera.');
    }

    // Load saved connection
    const savedPrinter = localStorage.getItem(`printer_${restaurantId}`);
    if (savedPrinter) {
      const printer = JSON.parse(savedPrinter);
      handleConnect(printer.name);
    }
  }, [restaurantId]);

  const handleScan = async () => {
    setIsScanning(true);
    setError('');
    const found = await printerService.scanForPrinters();
    setDevices(found);
    setIsScanning(false);
  };

  const handleConnect = async (deviceName: string) => {
    setConnecting(true);
    setError('');
    
    const success = await printerService.connect(deviceName);
    
    if (success) {
      setConnected(true);
      localStorage.setItem(`printer_${restaurantId}`, JSON.stringify({ name: deviceName }));
      onPrinterConnected?.(true);
    } else {
      setError('Failed to connect to printer');
    }
    
    setConnecting(false);
  };

  const handleDisconnect = async () => {
    await printerService.disconnect();
    setConnected(false);
    localStorage.removeItem(`printer_${restaurantId}`);
    onPrinterConnected?.(false);
  };

  const handleTestPrint = async () => {
    setTestStatus('printing');
    const success = await printerService.printTestPage();
    setTestStatus(success ? 'success' : 'error');
    if (!success) setError('Test print failed');
    setTimeout(() => setTestStatus('idle'), 3000);
  };

  if (!isSupported) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="mx-auto text-red-500 mb-4" size={48} />
        <p className="text-sm text-gray-600 dark:text-gray-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status Card */}
      <div className={`p-4 rounded-xl border-2 transition-all ${
        connected 
          ? 'bg-green-50 dark:bg-green-900/10 border-green-200' 
          : 'bg-gray-50 dark:bg-gray-800 border-gray-200'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${
              connected ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
            }`}>
              <Printer size={20} />
            </div>
            <div>
              <h3 className="font-black text-sm">Thermal Printer</h3>
              <p className="text-xs text-gray-500">
                {connected ? 'Connected' : 'Not connected'}
              </p>
            </div>
          </div>
          {connected && (
            <span className="px-2 py-1 bg-green-100 text-green-600 rounded-full text-[10px] font-black">
              READY
            </span>
          )}
        </div>
      </div>

      {/* Connection Controls */}
      {!connected ? (
        <>
          <button
            onClick={handleScan}
            disabled={isScanning}
            className="w-full py-3 bg-orange-500 text-white rounded-xl font-black text-xs hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isScanning ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Bluetooth size={16} />
                Scan for Printer
              </>
            )}
          </button>

          {devices.map(device => (
            <button
              key={device.id}
              onClick={() => handleConnect(device.name)}
              disabled={connecting}
              className="w-full p-3 bg-white dark:bg-gray-800 border rounded-xl flex items-center justify-between hover:border-orange-500"
            >
              <span className="font-bold">{device.name}</span>
              <span className="text-[10px] text-orange-500 font-black">Connect</span>
            </button>
          ))}
        </>
      ) : (
        <div className="space-y-3">
          <button
            onClick={handleTestPrint}
            disabled={testStatus === 'printing'}
            className="w-full py-3 bg-gray-900 text-white rounded-xl font-black text-xs hover:bg-orange-500 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {testStatus === 'printing' ? (
              <>Printing...</>
            ) : testStatus === 'success' ? (
              <>
                <CheckCircle2 size={16} className="text-green-500" />
                Test Page Sent!
              </>
            ) : (
              <>
                <Printer size={16} />
                Print Test Page
              </>
            )}
          </button>

          <button
            onClick={handleDisconnect}
            className="w-full py-2 text-red-500 border border-red-200 rounded-xl text-[10px] font-black hover:bg-red-500 hover:text-white"
          >
            Disconnect
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
          {error}
        </div>
      )}
    </div>
  );
};

export default PrinterSettings;
