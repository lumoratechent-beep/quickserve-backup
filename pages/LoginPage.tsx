
import React, { useState } from 'react';
import { User } from '../src/types';
import { User as UserIcon, Lock, ChevronLeft, AlertCircle, ArrowRight } from 'lucide-react';

interface Props {
  onLogin: (user: User) => void;
  onBack: () => void;
  onRegister?: () => void;
}

const LoginPage: React.FC<Props> = ({ onLogin, onBack, onRegister }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingRestaurantId, setPendingRestaurantId] = useState<string | null>(null);
  const [isResuming, setIsResuming] = useState(false);

  const handleResumeCheckout = async () => {
    if (!pendingRestaurantId) return;
    setIsResuming(true);
    setError('');
    try {
      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId: pendingRestaurantId, source: 'resume' }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Failed to resume checkout. Please try again.');
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setError('Connection error. Please try again later.');
    } finally {
      setIsResuming(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setPendingRestaurantId(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.code === 'ACCOUNT_INACTIVE' && data.restaurantId) {
          setPendingRestaurantId(data.restaurantId);
        }
        setError(data.error || 'Invalid username or password. Please try again.');
        return;
      }

      onLogin(data);
    } catch (err) {
      setError('Connection error. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors flex flex-col items-center justify-center px-4 py-12">
      <button 
        onClick={onBack}
        className="fixed top-8 left-8 flex items-center gap-2 text-gray-500 dark:text-gray-400 hover:text-orange-500 dark:hover:text-orange-400 font-semibold transition-colors"
      >
        <ChevronLeft size={20} />
        Back to Home
      </button>

      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-10">
          <img
            src="/LOGO/icon-192x192.png"
            alt="QuickServe logo"
            className="w-24 h-24 rounded-2xl object-contain mb-4"
            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="16" fill="%23fed7aa"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-size="32" font-weight="900" fill="%23f97316">QS</text></svg>')}`; }}
          />
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">Staff Portal</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2">Manage your restaurant operations</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl shadow-gray-200 dark:shadow-none border border-gray-100 dark:border-gray-700 p-8 md:p-10">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="flex flex-col gap-3 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-sm font-medium border border-red-100 dark:border-red-900/40">
                <div className="flex items-start gap-3">
                  <AlertCircle size={18} className="shrink-0 mt-0.5" />
                  <p>{error}</p>
                </div>
                {pendingRestaurantId && (
                  <button
                    type="button"
                    onClick={handleResumeCheckout}
                    disabled={isResuming}
                    className="w-full py-3 bg-orange-500 text-white rounded-xl font-bold text-sm shadow-md hover:bg-orange-600 hover:scale-[1.01] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isResuming ? 'Redirecting to payment...' : (
                      <>
                        Complete Registration
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 ml-1">Username</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 dark:text-gray-500">
                  <UserIcon size={18} />
                </div>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  className="w-full pl-11 pr-4 py-4 bg-gray-50 dark:bg-gray-700 border-none rounded-2xl focus:ring-2 focus:ring-orange-500 dark:text-white font-medium transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 ml-1">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 dark:text-gray-500">
                  <Lock size={18} />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-11 pr-4 py-4 bg-gray-50 dark:bg-gray-700 border-none rounded-2xl focus:ring-2 focus:ring-orange-500 dark:text-white font-medium transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 bg-orange-500 text-white rounded-2xl font-black text-lg shadow-xl shadow-orange-100 dark:shadow-none hover:bg-orange-600 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? 'Signing In...' : 'Sign In'}
            </button>

            {onRegister && (
              <p className="text-center text-gray-500 dark:text-gray-400 text-sm font-medium">
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={onRegister}
                  className="text-orange-500 font-black hover:text-orange-600 transition-colors"
                >
                  Register Now
                </button>
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
