/**
 * Connectivity Monitor - Validates actual server connectivity
 *
 * This module implements a hybrid connectivity detection system that combines:
 * 1. Browser's native navigator.onLine (fast, event-based)
 * 2. Server API polling (reliable, validates actual connectivity)
 *
 * The monitor detects when the device truly goes offline/online and triggers
 * callbacks for state changes.
 */

type ConnectivityCallback = (isOnline: boolean) => void;

interface ConnectivityMonitorState {
  isOnline: boolean;
  lastCheckTime: number;
  failureCount: number;
  pollInterval: NodeJS.Timeout | null;
}

let monitorInstance: ConnectivityMonitor | null = null;

class ConnectivityMonitor {
  private state: ConnectivityMonitorState;
  private subscribers: ConnectivityCallback[] = [];
  private pollIntervalMs: number;
  private maxFailures: number = 3; // Number of failures before going offline
  private minPollInterval: number = 30000; // 30 seconds
  private maxPollInterval: number = 300000; // 5 minutes

  constructor(pollIntervalMs: number = 30000) {
    this.pollIntervalMs = Math.max(pollIntervalMs, this.minPollInterval);
    this.state = {
      isOnline: navigator.onLine,
      lastCheckTime: Date.now(),
      failureCount: 0,
      pollInterval: null,
    };
  }

  /**
   * Start monitoring connectivity
   */
  public start(): void {
    console.log('[ConnectivityMonitor] Starting connectivity monitor');

    // Set up browser online/offline event listeners
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);

    // Perform initial connectivity check
    this.checkConnectivity();

    // Start polling
    this.schedulePoll();
  }

  /**
   * Subscribe to connectivity changes
   */
  public subscribe(callback: ConnectivityCallback): () => void {
    this.subscribers.push(callback);

    // Return unsubscribe function
    return () => {
      this.subscribers = this.subscribers.filter(c => c !== callback);
    };
  }

  /**
   * Get current online status
   */
  public getIsOnline(): boolean {
    return this.state.isOnline;
  }

  /**
   * Manually trigger a connectivity check
   */
  public async forceCheck(): Promise<boolean> {
    return this.checkConnectivity();
  }

  /**
   * Check connectivity by pinging the server
   */
  private async checkConnectivity(): Promise<boolean> {
    const wasOnline = this.state.isOnline;

    // First check: is navigator.onLine true?
    const navOnLine = navigator.onLine;

    // Validate with the server even if navigator.onLine is false. Browser/PWA
    // startup can briefly report a stale offline value while requests work.
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // Shorter 3 second timeout for ping only

      const response = await fetch('/api/health', {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-cache',
        // Prevent service worker from spending time on this - we need fast failure
        headers: { 'X-Connectivity-Check': 'true' }
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        // Server is reachable
        this.setOnlineStatus(true);
        return true;
      } else {
        // Server returned error
        this.recordFailure();
        return this.state.isOnline;
      }
    } catch (error) {
      // Network error or timeout - fail fast
      console.warn('[ConnectivityMonitor] API ping failed:', error);
      if (!navOnLine) {
        this.setOnlineStatus(false);
        return false;
      }
      this.recordFailure();
      return this.state.isOnline;
    }
  }

  /**
   * Record a connectivity failure and update status if needed
   */
  private recordFailure(): void {
    this.state.failureCount++;
    console.log(`[ConnectivityMonitor] Connectivity check failed (${this.state.failureCount}/${this.maxFailures})`);

    // After maxFailures in a row, consider device offline
    if (this.state.failureCount >= this.maxFailures && this.state.isOnline) {
      console.warn('[ConnectivityMonitor] Multiple failures detected, marking as offline');
      this.setOnlineStatus(false);
    }
  }

  /**
   * Set online status and notify subscribers if changed
   */
  private setOnlineStatus(isOnline: boolean): void {
    if (this.state.isOnline === isOnline) {
      return; // No change
    }

    console.log(`[ConnectivityMonitor] Status changed: ${this.state.isOnline} -> ${isOnline}`);
    this.state.isOnline = isOnline;
    this.state.lastCheckTime = Date.now();

    // Reset failure count on successful recovery
    if (isOnline) {
      this.state.failureCount = 0;
    }

    // Notify all subscribers
    this.subscribers.forEach(callback => {
      try {
        callback(isOnline);
      } catch (err) {
        console.error('[ConnectivityMonitor] Error calling subscriber:', err);
      }
    });
  }

  /**
   * Browser online event handler
   */
  private handleOnline = (): void => {
    console.log('[ConnectivityMonitor] Browser online event fired');
    this.state.failureCount = 0;
    this.forceCheck(); // Validate by pinging server
  };

  /**
   * Browser offline event handler
   */
  private handleOffline = (): void => {
    console.log('[ConnectivityMonitor] Browser offline event fired');
    this.setOnlineStatus(false);
  };

  /**
   * Schedule the next connectivity poll
   */
  private schedulePoll(): void {
    if (this.state.pollInterval) {
      clearInterval(this.state.pollInterval);
    }

    // Use longer interval when offline to save battery
    const interval = this.state.isOnline ? this.minPollInterval : this.maxPollInterval;

    this.state.pollInterval = setInterval(() => {
      this.checkConnectivity();
    }, interval);
  }

  /**
   * Stop monitoring and cleanup
   */
  public destroy(): void {
    console.log('[ConnectivityMonitor] Stopping connectivity monitor');

    if (this.state.pollInterval) {
      clearInterval(this.state.pollInterval);
      this.state.pollInterval = null;
    }

    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);

    this.subscribers = [];
  }
}

/**
 * Get or create the connectivity monitor singleton
 */
export const getConnectivityMonitor = (pollIntervalMs?: number): ConnectivityMonitor => {
  if (!monitorInstance) {
    monitorInstance = new ConnectivityMonitor(pollIntervalMs);
    monitorInstance.start();
  }
  return monitorInstance;
};

/**
 * Destroy the monitor instance (for cleanup/testing)
 */
export const destroyConnectivityMonitor = (): void => {
  if (monitorInstance) {
    monitorInstance.destroy();
    monitorInstance = null;
  }
};
