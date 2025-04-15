import { logger } from '../utils/logger';
import {
  recordCacheHit,
  recordCacheMiss,
  recordCacheEviction,
  recordCacheOperationDuration,
} from './metrics';

// Import interfaces from types/rpc.ts
interface RpcRequest {
  jsonrpc: string;
  method: string;
  params: any[];
  id: number | string;
}

interface RpcResponse {
  jsonrpc: string;
  id: number | string;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

// Cache interface
interface CacheEntry {
  data: RpcResponse | RpcResponse[];
  expiry: number; // Unix timestamp for expiry
}

interface CacheConfig {
  enabled: boolean;
  defaultTTL: number; // Default time-to-live in milliseconds
  methodTTLs: Record<string, number>; // Method-specific TTLs
  maxEntries: number; // Maximum number of entries in the cache
  persistentCacheEnabled: boolean; // Whether to use persistent cache
  persistentCachePath?: string; // Path for persistent cache storage
}

interface CacheMetrics {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  methodHits: Record<string, number>;
  methodMisses: Record<string, number>;
  hitRate?: number;
}

const log = logger.withContext({ service: 'caching' });

class RpcCache {
  private cache: Map<string, CacheEntry>;
  private metrics: CacheMetrics;
  private config: CacheConfig;
  private persistentCacheTimer?: NodeJS.Timeout;

  constructor(config?: Partial<CacheConfig>) {
    this.config = {
      enabled: true,
      defaultTTL: 30000, // 30 seconds default
      methodTTLs: {
        // Set method-specific TTLs (in milliseconds)
        eth_blockNumber: 5000, // 5 seconds
        eth_getBalance: 15000, // 15 seconds
        eth_call: 10000, // 10 seconds
        eth_getTransactionCount: 15000, // 15 seconds
        eth_getBlockByNumber: 60000, // 1 minute
        eth_getBlockByHash: 60000, // 1 minute
        eth_getLogs: 30000, // 30 seconds
        eth_gasPrice: 10000, // 10 seconds
        avax_getAtomicTx: 60000, // 1 minute
        avax_getAtomicTxStatus: 15000, // 15 seconds
        avax_getPendingTxs: 5000, // 5 seconds
        ...config?.methodTTLs,
      },
      maxEntries: 10000,
      persistentCacheEnabled: false,
      ...config,
    };

    this.cache = new Map<string, CacheEntry>();
    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0,
      methodHits: {},
      methodMisses: {},
    };

    // Set up periodic cleanup of expired entries
    setInterval(() => this.cleanupExpiredEntries(), 60000); // Clean up every minute

    // If persistent cache is enabled, set up periodic saving
    if (this.config.persistentCacheEnabled && this.config.persistentCachePath) {
      this.loadFromDisk();
      this.persistentCacheTimer = setInterval(() => this.saveToDisk(), 300000); // Save every 5 minutes
    }

    log.info('RPC Cache initialized', { config: this.config });
  }

  /**
   * Generate a cache key from the RPC request
   */
  private generateCacheKey(request: RpcRequest | RpcRequest[]): string {
    if (Array.isArray(request)) {
      // For batch requests, we create a compound key
      return request.map(req => `${req.method}:${JSON.stringify(req.params)}`).join('|');
    }

    return `${request.method}:${JSON.stringify(request.params)}`;
  }

  /**
   * Get the TTL for a specific method
   */
  private getTTL(method: string): number {
    return this.config.methodTTLs[method] || this.config.defaultTTL;
  }

  /**
   * Check if a method's result can be cached
   */
  private isCacheable(method: string): boolean {
    // Non-cacheable methods: state-changing operations and very time-sensitive data
    const nonCacheableMethods = [
      'eth_sendTransaction',
      'eth_sendRawTransaction',
      'personal_sign',
      'eth_sign',
      'eth_signTransaction',
      'eth_submitWork',
      'eth_submitHashrate',
      'admin_',
      'personal_',
      'miner_',
      'debug_',
      'avax_issueTx',
      'avax_signTx',
    ];

    // Check if method starts with any non-cacheable prefix
    return !nonCacheableMethods.some(prefix => method.startsWith(prefix));
  }

  /**
   * Get entry from cache if it exists and is not expired
   */
  public get(request: RpcRequest | RpcRequest[]): RpcResponse | RpcResponse[] | null {
    if (!this.config.enabled) return null;

    const isBatch = Array.isArray(request);
    const methods = isBatch ? request.map(req => req.method) : [(request as RpcRequest).method];

    // Skip cache for non-cacheable methods
    if (methods.some(method => !this.isCacheable(method))) {
      return null;
    }

    const cacheKey = this.generateCacheKey(request);
    const entry = this.cache.get(cacheKey);

    if (!entry) {
      this.recordCacheMiss(methods);
      return null;
    }

    const now = Date.now();
    if (entry.expiry < now) {
      // Entry has expired
      this.cache.delete(cacheKey);
      this.metrics.evictions++;
      this.metrics.size = this.cache.size;
      this.recordCacheMiss(methods);
      return null;
    }

    // Cache hit
    this.recordCacheHit(methods);
    return entry.data;
  }

  /**
   * Store RPC response in cache
   */
  public set(request: RpcRequest | RpcRequest[], response: RpcResponse | RpcResponse[]): void {
    if (!this.config.enabled) return;

    const isBatch = Array.isArray(request);
    const methods = isBatch ? request.map(req => req.method) : [(request as RpcRequest).method];

    // Skip cache for non-cacheable methods
    if (methods.some(method => !this.isCacheable(method))) {
      return;
    }

    // Skip caching errors
    if (this.hasError(response)) {
      return;
    }

    // For batch requests, calculate the lowest TTL from all methods
    let ttl = Math.min(...methods.map(method => this.getTTL(method)));
    const cacheKey = this.generateCacheKey(request);

    // Check if we need to evict entries due to max size limit
    if (this.cache.size >= this.config.maxEntries) {
      this.evictOldestEntry();
    }

    // Store in cache with expiry timestamp
    this.cache.set(cacheKey, {
      data: response,
      expiry: Date.now() + ttl,
    });

    this.metrics.size = this.cache.size;
    log.debug('Cached response', {
      methods: methods.join(','),
      ttl,
      cacheSize: this.cache.size,
    });
  }

  /**
   * Invalidate cache entries based on a pattern or method name
   */
  public invalidate(pattern: string | RegExp): number {
    let count = 0;

    for (const key of this.cache.keys()) {
      if (
        (typeof pattern === 'string' && key.includes(pattern)) ||
        (pattern instanceof RegExp && pattern.test(key))
      ) {
        this.cache.delete(key);
        count++;
      }
    }

    this.metrics.size = this.cache.size;
    log.info(`Invalidated ${count} cache entries`, { pattern: pattern.toString() });
    return count;
  }

  /**
   * Invalidate cache for state-changing operations
   */
  public invalidateOnStateChange(method: string): void {
    const stateChangingMethods: Record<string, string[]> = {
      eth_sendTransaction: ['eth_getBalance', 'eth_getTransactionCount', 'eth_call'],
      eth_sendRawTransaction: ['eth_getBalance', 'eth_getTransactionCount', 'eth_call'],
      avax_issueTx: ['avax_getPendingTxs', 'avax_getAtomicTxStatus'],
      personal_sendTransaction: ['eth_getBalance', 'eth_getTransactionCount'],
    };

    const methodsToInvalidate = stateChangingMethods[method];
    if (methodsToInvalidate) {
      let count = 0;
      methodsToInvalidate.forEach(m => {
        count += this.invalidate(m);
      });

      log.info(`State change detected (${method}), invalidated ${count} cache entries`);
    }
  }

  /**
   * Check if response contains any errors
   */
  private hasError(response: RpcResponse | RpcResponse[]): boolean {
    if (Array.isArray(response)) {
      return response.some(r => r.error !== undefined);
    }
    return response.error !== undefined;
  }

  /**
   * Record a cache hit in metrics
   */
  private recordCacheHit(methods: string[]): void {
    this.metrics.hits++;
    methods.forEach(method => {
      this.metrics.methodHits[method] = (this.metrics.methodHits[method] || 0) + 1;
      // Also update Prometheus metrics
      recordCacheHit(method);
    });
  }

  /**
   * Record a cache miss in metrics
   */
  private recordCacheMiss(methods: string[]): void {
    this.metrics.misses++;
    methods.forEach(method => {
      this.metrics.methodMisses[method] = (this.metrics.methodMisses[method] || 0) + 1;
      // Also update Prometheus metrics
      recordCacheMiss(method);
    });
  }

  /**
   * Evict the oldest entry from the cache
   */
  private evictOldestEntry(): void {
    // Find the entry with the earliest expiry
    let oldestKey: string | null = null;
    let oldestExpiry = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiry < oldestExpiry) {
        oldestExpiry = entry.expiry;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.metrics.evictions++;
      recordCacheEviction();
    }
  }

  /**
   * Clean up expired entries
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    let expiredCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiry < now) {
        this.cache.delete(key);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      this.metrics.evictions += expiredCount;
      this.metrics.size = this.cache.size;
      log.debug(`Cleaned up ${expiredCount} expired cache entries`);

      // Update Prometheus metrics
      recordCacheEviction();
    }
  }

  /**
   * Get cache metrics
   */
  public getMetrics(): CacheMetrics {
    const hitRate =
      this.metrics.hits + this.metrics.misses > 0
        ? this.metrics.hits / (this.metrics.hits + this.metrics.misses)
        : 0;

    return {
      ...this.metrics,
      hitRate: parseFloat(hitRate.toFixed(4)),
    };
  }

  /**
   * Clear the entire cache
   */
  public clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.metrics.size = 0;
    log.info(`Cleared cache (${size} entries removed)`);

    // Update Prometheus metrics
    recordCacheEviction();
  }

  /**
   * Save cache to disk (for persistent cache)
   */
  private saveToDisk(): void {
    if (!this.config.persistentCacheEnabled || !this.config.persistentCachePath) {
      return;
    }

    try {
      // Only save non-expired entries that are worth persisting
      const now = Date.now();
      const persistentData: Record<string, { data: any; expiry: number }> = {};

      for (const [key, entry] of this.cache.entries()) {
        // Only save entries that will not expire soon (at least 5 minutes remaining)
        if (entry.expiry > now + 300000) {
          persistentData[key] = entry;
        }
      }

      const fs = require('fs');
      fs.writeFileSync(this.config.persistentCachePath, JSON.stringify(persistentData), 'utf8');

      log.info(`Saved cache to disk (${Object.keys(persistentData).length} entries)`);
    } catch (error) {
      log.error('Failed to save cache to disk', { error });
    }
  }

  /**
   * Load cache from disk (for persistent cache)
   */
  private loadFromDisk(): void {
    if (!this.config.persistentCacheEnabled || !this.config.persistentCachePath) {
      return;
    }

    try {
      const fs = require('fs');
      if (!fs.existsSync(this.config.persistentCachePath)) {
        log.info('No persistent cache file found');
        return;
      }

      const data = JSON.parse(fs.readFileSync(this.config.persistentCachePath, 'utf8'));
      const now = Date.now();
      let loadedCount = 0;

      // Only load non-expired entries
      for (const [key, entry] of Object.entries(data)) {
        if ((entry as CacheEntry).expiry > now) {
          this.cache.set(key, entry as CacheEntry);
          loadedCount++;
        }
      }

      this.metrics.size = this.cache.size;
      log.info(`Loaded ${loadedCount} entries from persistent cache`);
    } catch (error) {
      log.error('Failed to load cache from disk', { error });
    }
  }

  /**
   * Stop the cache service (cleanup timers)
   */
  public stop(): void {
    if (this.persistentCacheTimer) {
      clearInterval(this.persistentCacheTimer);
      // Save cache before stopping
      if (this.config.persistentCacheEnabled) {
        this.saveToDisk();
      }
    }
  }
}

// Create a singleton instance for the application
let cacheInstance: RpcCache | null = null;

/**
 * Initialize the cache with config
 */
export function initializeCache(config?: Partial<CacheConfig>): RpcCache {
  cacheInstance = new RpcCache(config);
  return cacheInstance;
}

/**
 * Get the cache instance (initializes with defaults if not already created)
 */
export function getCache(): RpcCache {
  if (!cacheInstance) {
    cacheInstance = new RpcCache();
  }
  return cacheInstance;
}

/**
 * Get cache statistics for metrics reporting
 */
export function getCacheStats() {
  const cache = getCache();
  const metrics = cache.getMetrics();

  return {
    currentEntries: metrics.size,
    maxEntries: cache.getMetrics().size,
    hitRate: metrics.hitRate || 0,
    hits: metrics.hits,
    misses: metrics.misses,
    evictions: metrics.evictions,
    methodHits: metrics.methodHits,
    methodMisses: metrics.methodMisses,
  };
}

// Add a wrapper function to record operation durations
export function withTimingMetrics<T>(operation: 'get' | 'set', method: string, fn: () => T): T {
  const startTime = performance.now();
  const result = fn();
  const duration = performance.now() - startTime;

  recordCacheOperationDuration(operation, method, duration);
  return result;
}

// Export a single access point for the cache
export const cache = {
  get: (request: RpcRequest | RpcRequest[]): RpcResponse | RpcResponse[] | null => {
    const methods = Array.isArray(request) ? request.map(r => r.method) : [request.method];
    const method = Array.isArray(request) ? 'batch' : methods[0];

    return withTimingMetrics('get', method, () => getCache().get(request));
  },

  set: (request: RpcRequest | RpcRequest[], response: RpcResponse | RpcResponse[]): void => {
    const methods = Array.isArray(request) ? request.map(r => r.method) : [request.method];
    const method = Array.isArray(request) ? 'batch' : methods[0];

    withTimingMetrics('set', method, () => getCache().set(request, response));
  },

  invalidate: (pattern: string | RegExp): number => getCache().invalidate(pattern),
  invalidateOnStateChange: (method: string): void => getCache().invalidateOnStateChange(method),
  clear: (): void => getCache().clear(),
  getMetrics: (): CacheMetrics => getCache().getMetrics(),
  stop: (): void => getCache().stop(),
};
