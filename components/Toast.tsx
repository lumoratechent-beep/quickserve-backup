import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  duration: number;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export const useToast = () => useContext(ToastContext);

let globalToastFn: ((message: string, type?: ToastType, duration?: number) => void) | null = null;

/**
 * Standalone toast function that works without React context.
 * Use this in files where wrapping with ToastProvider is impractical.
 */
export const toast = (message: string, type: ToastType = 'info', duration: number = 3000) => {
  if (globalToastFn) {
    globalToastFn(message, type, duration);
  } else {
    // Fallback if provider not mounted yet
    console.warn('[Toast] Provider not mounted, message:', message);
  }
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  let nextId = 0;

  const addToast = useCallback((message: string, type: ToastType = 'info', duration: number = 3000) => {
    const id = ++nextId + Date.now();
    setToasts(prev => [...prev, { id, message, type, duration }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Register global function
  useEffect(() => {
    globalToastFn = addToast;
    return () => { globalToastFn = null; };
  }, [addToast]);

  const contextValue = { toast: addToast };

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none">
        {toasts.map(t => (
          <ToastMessage key={t.id} item={t} onDismiss={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

const ToastMessage: React.FC<{ item: ToastItem; onDismiss: (id: number) => void }> = ({ item, onDismiss }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => setIsVisible(true));

    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => onDismiss(item.id), 300);
    }, item.duration);

    return () => clearTimeout(timer);
  }, [item.id, item.duration, onDismiss]);

  const bgColor = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    warning: 'bg-yellow-500',
    info: 'bg-blue-500',
  }[item.type];

  const Icon = {
    success: CheckCircle2,
    error: AlertCircle,
    warning: AlertCircle,
    info: Info,
  }[item.type];

  return (
    <div
      className={`pointer-events-auto flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl text-white font-semibold text-sm max-w-md transition-all duration-300 ${bgColor} ${
        isVisible && !isExiting ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'
      }`}
    >
      <Icon size={18} className="flex-shrink-0" />
      <span className="flex-1">{item.message}</span>
      <button
        onClick={() => {
          setIsExiting(true);
          setTimeout(() => onDismiss(item.id), 300);
        }}
        className="p-0.5 hover:bg-white/20 rounded transition-colors flex-shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  );
};

export default ToastProvider;
