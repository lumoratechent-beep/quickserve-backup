import React, { useState, useEffect } from 'react';
import { Bluetooth, BluetoothConnected, Printer, AlertCircle, CheckCircle2, X, Wifi, Usb } from 'lucide-react';
import { supabase } from '../lib/supabase';
import EscPosEncoder from 'esc-pos-encoder';

interface Props {
  restaurant: any;
}

interface PrinterDevice {
  id: string;
  name: string;
  connected: boolean;
}

const PrinterSettingsComponent: React.FC<Props> = ({ restaurant }) => {
  const [isBluetoothSupported, setIsBluetoothSupported] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<PrinterDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<PrinterDevice | null>(null);
  const [printerStatus, setPrinterStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [errorMessage, setErrorMessage] = useState('');
  const [testPrintStatus, setTestPrintStatus] = useState<'idle' | 'printing' | 'success' | 'error'>('idle');
  
  // Check if Web Bluetooth is supported
  useEffect(() => {
    if (!navigator.bluetooth) {
      setIsBluetoothSupported(false);
      setErrorMessage('Web Bluetooth is not supported in this browser. Please use Chrome, Edge, or Opera.');
    }
  }, []);

  // Load saved printer from localStorage
  useEffect(() => {
    const savedPrinter = localStorage.getItem(`printer_${restaurant.id}`);
    if (savedPrinter) {
      try {
        const printer = JSON.parse(savedPrinter);
        setConnectedDevice(printer);
        setPrinterStatus('connected');
      } catch (e) {
        console.error('Failed to load saved printer');
      }
    }
  }, [restaurant.id]);

  const scanForPrinters = async () => {
    if (!navigator.bluetooth) {
      setErrorMessage('Bluetooth not supported');
      return;
    }

    setIsScanning(true);
    setDevices([]);
    setErrorMessage('');

    try {
      // Request Bluetooth device with filters for thermal printers
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb'] // Common printer service
      });

      if (device) {
        const newDevice: PrinterDevice = {
          id: device.id,
          name: device.name || 'Unknown Printer',
          connected: false
        };
        setDevices([newDevice]);
      }
    } catch (error: any) {
      if (error.message !== 'User cancelled the requestDevice dialog.') {
        setErrorMessage('Failed to scan for printers: ' + error.message);
      }
    } finally {
      setIsScanning(false);
    }
  };

  const connectToPrinter = async (device: PrinterDevice) => {
    setPrinterStatus('connecting');
    setErrorMessage('');

    try {
      // Request the device again to get GATT server access
      const bluetoothDevice = await navigator.bluetooth.requestDevice({
        filters: [{ name: device.name }],
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
      });

      // Connect to GATT server
      const server = await bluetoothDevice.gatt?.connect();
      
      if (server) {
        setConnectedDevice(device);
        setPrinterStatus('connected');
        
        // Save to localStorage
        localStorage.setItem(`printer_${restaurant.id}`, JSON.stringify(device));
        
        // You might want to save to database as well
        await supabase
          .from('restaurants')
          .update({ 
            printer_settings: { 
              connected: true, 
              deviceId: device.id,
              deviceName: device.name 
            } 
          })
          .eq('id', restaurant.id);
      }
    } catch (error: any) {
      setPrinterStatus('error');
      setErrorMessage('Failed to connect: ' + error.message);
    }
  };

  const disconnectPrinter = () => {
    setConnectedDevice(null);
    setPrinterStatus('disconnected');
    localStorage.removeItem(`printer_${restaurant.id}`);
    
    // Update database
    supabase
      .from('restaurants')
      .update({ printer_settings: { connected: false } })
      .eq('id', restaurant.id);
  };

  const printTestPage = async () => {
  if (!connectedDevice) return;
  
  setTestPrintStatus('printing');
  setErrorMessage('');
  
  try {
    // Reconnect to printer
    const bluetoothDevice = await (navigator as any).bluetooth.requestDevice({
      filters: [{ name: connectedDevice.name }],
      optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
    });
    
    const server = await bluetoothDevice.gatt?.connect();
    if (!server) throw new Error('Could not connect to printer');
    
    // Get the primary service
    const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
    
    // Get all characteristics
    const characteristics = await service.getCharacteristics();
    if (characteristics.length === 0) throw new Error('No characteristics found');
    
    console.log('Found characteristics:', characteristics);
    
    // Create ESC/POS test data
    const testData = new Uint8Array([
      0x1B, 0x40, // Initialize printer
      0x1B, 0x61, 0x31, // Center align
      0x1B, 0x21, 0x30, // Double size
      0x51, 0x75, 0x69, 0x63, 0x6B, 0x53, 0x65, 0x72, 0x76, 0x65, // "QuickServe"
      0x0A, // New line
      0x1B, 0x21, 0x00, // Normal text
      0x54, 0x65, 0x73, 0x74, 0x20, 0x50, 0x61, 0x67, 0x65, // "Test Page"
      0x0A, 0x0A,
      0x1D, 0x56, 0x41, 0x03 // Cut paper
    ]);
    
    // Try each characteristic until one works
    let printed = false;
    for (const char of characteristics) {
      if (char.properties.write || char.properties.writeWithoutResponse) {
        try {
          await char.writeValue(testData);
          printed = true;
          console.log('Successfully wrote to characteristic:', char.uuid);
          break;
        } catch (e) {
          console.log('Failed to write to characteristic:', char.uuid);
        }
      }
    }
    
    if (!printed) throw new Error('Could not find writable characteristic');
    
    // Disconnect after printing
    setTimeout(() => {
      server.disconnect();
    }, 1000);
    
    setTestPrintStatus('success');
    setTimeout(() => setTestPrintStatus('idle'), 3000);
    
  } catch (error: any) {
    console.error('Print error:', error);
    setTestPrintStatus('error');
    setErrorMessage('Print failed: ' + error.message);
  }
};

  if (!isBluetoothSupported) {
    return (
      <div className="text-center py-12">
        <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
        <h3 className="text-lg font-black dark:text-white mb-2">Bluetooth Not Supported</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">{errorMessage}</p>
        <p className="text-xs text-gray-400 mt-4">Please use Chrome, Edge, or Opera browser</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Status Card */}
      <div className={`p-6 rounded-2xl border-2 transition-all ${
        printerStatus === 'connected' 
          ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/20' 
          : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
      }`}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              printerStatus === 'connected' 
                ? 'bg-green-500 text-white' 
                : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
            }`}>
              <Printer size={24} />
            </div>
            <div>
              <h3 className="font-black dark:text-white">CX58D Thermal Printer</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {printerStatus === 'connected' 
                  ? `Connected to ${connectedDevice?.name}` 
                  : 'No printer connected'}
              </p>
            </div>
          </div>
          <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
            printerStatus === 'connected' 
              ? 'bg-green-100 text-green-600' 
              : printerStatus === 'connecting'
              ? 'bg-orange-100 text-orange-600'
              : 'bg-gray-100 text-gray-500'
          }`}>
            {printerStatus === 'connected' ? 'Connected' : 
             printerStatus === 'connecting' ? 'Connecting...' : 
             'Disconnected'}
          </div>
        </div>
      </div>

      {/* Connection Controls */}
      {printerStatus !== 'connected' ? (
        <div className="space-y-4">
          <button
            onClick={scanForPrinters}
            disabled={isScanning}
            className="w-full py-4 bg-orange-500 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-orange-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isScanning ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Bluetooth size={18} />
                Scan for Bluetooth Printers
              </>
            )}
          </button>

          {devices.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Found Printers</h4>
              {devices.map(device => (
                <button
                  key={device.id}
                  onClick={() => connectToPrinter(device)}
                  className="w-full p-4 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl flex items-center justify-between hover:border-orange-500 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <Printer size={20} className="text-gray-400 group-hover:text-orange-500" />
                    <span className="font-bold dark:text-white">{device.name}</span>
                  </div>
                  <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Connect</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Connected Device Info */}
          <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-900/20">
            <div className="flex items-center gap-2 mb-2">
              <BluetoothConnected size={16} className="text-blue-500" />
              <span className="text-xs font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">Connected Device</span>
            </div>
            <p className="font-bold dark:text-white mb-1">{connectedDevice?.name}</p>
            <p className="text-[10px] text-gray-500">ID: {connectedDevice?.id}</p>
          </div>

          {/* Test Print Button */}
          <button
            onClick={printTestPage}
            disabled={testPrintStatus === 'printing'}
            className="w-full py-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-orange-500 hover:text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {testPrintStatus === 'printing' ? (
              <>
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Printing...
              </>
            ) : testPrintStatus === 'success' ? (
              <>
                <CheckCircle2 size={18} className="text-green-500" />
                Test Page Sent!
              </>
            ) : (
              <>
                <Printer size={18} />
                Print Test Page
              </>
            )}
          </button>

          {/* Disconnect Button */}
          <button
            onClick={disconnectPrinter}
            className="w-full py-3 bg-red-50 dark:bg-red-900/10 text-red-500 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all border border-red-200 dark:border-red-900/20"
          >
            Disconnect Printer
          </button>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="p-4 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-200 dark:border-red-900/20">
          <div className="flex items-start gap-2">
            <X size={16} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-600 dark:text-red-400">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Printer Setup Instructions</h4>
        <ul className="space-y-2 text-[10px] text-gray-500 dark:text-gray-400">
          <li className="flex items-start gap-2">
            <div className="w-1 h-1 bg-orange-500 rounded-full mt-1.5" />
            <span>Turn on your CX58D printer and enable Bluetooth pairing mode</span>
          </li>
          <li className="flex items-start gap-2">
            <div className="w-1 h-1 bg-orange-500 rounded-full mt-1.5" />
            <span>Click "Scan for Bluetooth Printers" and select your printer when it appears</span>
          </li>
          <li className="flex items-start gap-2">
            <div className="w-1 h-1 bg-orange-500 rounded-full mt-1.5" />
            <span>Use "Print Test Page" to verify the connection</span>
          </li>
          <li className="flex items-start gap-2">
            <div className="w-1 h-1 bg-orange-500 rounded-full mt-1.5" />
            <span>The printer will automatically reconnect when you return to this page</span>
          </li>
        </ul>
      </div>

      {/* Browser Compatibility Note */}
      <p className="text-[8px] text-gray-400 text-center">
        * Works best in Chrome, Edge, or Opera browsers. Requires Bluetooth permission.
      </p>
    </div>
  );
};

export default PrinterSettingsComponent;
