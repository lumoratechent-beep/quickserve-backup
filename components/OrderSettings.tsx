import React from 'react';
import { BellRing, Printer } from 'lucide-react';

interface Props {
  autoAccept: boolean;
  autoPrint: boolean;
  printerConnected: boolean;
  onToggleAccept: () => void;
  onTogglePrint: () => void;
}

const OrderSettings: React.FC<Props> = ({
  autoAccept,
  autoPrint,
  printerConnected,
  onToggleAccept,
  onTogglePrint
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
        <div className="flex items-start gap-3">
          <BellRing size={18} className="text-orange-500 mt-0.5" />
          <div>
            <h3 className="font-black text-sm">Auto-Accept Orders</h3>
            <p className="text-[10px] text-gray-500">Automatically accept new orders</p>
          </div>
        </div>
        <button
          onClick={onToggleAccept}
          className={`w-12 h-6 rounded-full transition-all relative ${
            autoAccept ? 'bg-green-500' : 'bg-gray-300'
          }`}
        >
          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
            autoAccept ? 'left-7' : 'left-1'
          }`} />
        </button>
      </div>

      <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
        <div className="flex items-start gap-3">
          <Printer size={18} className="text-orange-500 mt-0.5" />
          <div>
            <h3 className="font-black text-sm">Auto-Print Orders</h3>
            <p className="text-[10px] text-gray-500">Print orders when accepted</p>
          </div>
        </div>
        <button
          onClick={onTogglePrint}
          disabled={!printerConnected}
          className={`w-12 h-6 rounded-full transition-all relative ${
            !printerConnected 
              ? 'bg-gray-200 cursor-not-allowed'
              : autoPrint 
                ? 'bg-green-500' 
                : 'bg-gray-300'
          }`}
        >
          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
            !printerConnected 
              ? 'left-1 opacity-50'
              : autoPrint 
                ? 'left-7' 
                : 'left-1'
          }`} />
        </button>
      </div>

      {!printerConnected && autoPrint && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-xl">
          <p className="text-[10px] text-yellow-600">
            ⚠️ Auto-print enabled but no printer connected
          </p>
        </div>
      )}
    </div>
  );
};

export default OrderSettings;
