import { Registry, Counter, Gauge } from 'prom-client';
import { getCacheStats } from './caching';

// Create a metrics registry
const registry = new Registry();

// Cache hit/miss counters
const cacheHits = new Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['method'],
  registers: [registry],
});

const cacheMisses = new Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['method'],
  registers: [registry],
});

// Cache size metrics
const cacheSize = new Gauge({
  name: 'cache_entries_count',
  help: 'Current number of entries in the cache',
  registers: [registry],
});

const cacheMaxSize = new Gauge({
  name: 'cache_max_entries',
  help: 'Maximum number of entries allowed in the cache',
  registers: [registry],
});

// Cache eviction metrics
const cacheEvictions = new Counter({
  name: 'cache_evictions_total',
  help: 'Total number of cache evictions',
  registers: [registry],
});

// Cache latency metrics
const cacheOperationDuration = new Counter({
  name: 'cache_operation_duration_seconds_total',
  help: 'Total time spent on cache operations in seconds',
  labelNames: ['operation', 'method'],
  registers: [registry],
});

// Export metrics functions
export function recordCacheHit(method: string): void {
  cacheHits.inc({ method });
}

export function recordCacheMiss(method: string): void {
  cacheMisses.inc({ method });
}

export function recordCacheEviction(): void {
  cacheEvictions.inc();
}

export function recordCacheOperationDuration(
  operation: 'get' | 'set',
  method: string,
  durationMs: number,
): void {
  cacheOperationDuration.inc({ operation, method }, durationMs / 1000);
}

// Update cache size metrics
export function updateCacheSizeMetrics(): void {
  const stats = getCacheStats();
  cacheSize.set(stats.currentEntries);
  cacheMaxSize.set(stats.maxEntries);
}

// Initialize metrics collection
export function initializeMetrics(): void {
  // Update cache size metrics periodically (every 30 seconds)
  setInterval(updateCacheSizeMetrics, 30000);

  // Set initial values
  updateCacheSizeMetrics();
}

// Expose prometheus metrics endpoint
export function getMetricsEndpoint() {
  return async (_req: any, res: any) => {
    res.set('Content-Type', registry.contentType);
    res.end(await registry.metrics());
  };
}

// This function should be called during application startup
export function setupCacheMetrics() {
  initializeMetrics();

  // You can add this to your Express or other HTTP server
  // app.get('/metrics', getMetricsEndpoint());
}
