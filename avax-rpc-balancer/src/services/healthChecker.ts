import { NodeInfo, updateNodeHealth, getNodeById, getNodeConfig } from '../config/nodeConfig';
import { logger } from '../utils/logger';
import fetch from 'node-fetch';
import { URL } from 'url';

// Health check configuration
export interface HealthCheckConfig {
    interval: number;          // How often to check node health (milliseconds)
    timeout: number;           // Request timeout (milliseconds)
    recoveryInterval: number;  // How often to retry failed nodes (milliseconds)
    healthEndpoint: string;    // Endpoint to check (appended to node URL)
    failureThreshold: number;  // Number of consecutive failures before marking unhealthy
    successThreshold: number;  // Number of consecutive successes needed to mark recovered
}

// Default configuration
export const defaultHealthCheckConfig: HealthCheckConfig = {
    interval: 10000,           // Check every 10 seconds
    timeout: 2000,             // 2 second timeout
    recoveryInterval: 60000,   // Try recovery every minute
    healthEndpoint: '/',       // Default health endpoint
    failureThreshold: 3,       // 3 consecutive failures to mark unhealthy
    successThreshold: 2        // 2 consecutive successes to mark recovered
};

// Health metrics for nodes
interface NodeHealthMetrics {
    responseTime: number[];        // Last N response times
    avgResponseTime: number;       // Moving average response time
    lastResponseTime: number;      // Last response time
    successCount: number;          // Total successful health checks
    failureCount: number;          // Total failed health checks
    consecutiveFailures: number;   // Current consecutive failures
    consecutiveSuccesses: number;  // Current consecutive successes
    lastChecked: number;           // Timestamp of last check
    lastStatusChange: number;      // When health status last changed
    score: number;                 // Overall health score (0-100)
}

// Singleton instance
let healthCheckerInstance: HealthChecker | null = null;

/**
 * Health checker service for monitoring node availability and performance
 */
export class HealthChecker {
    private config: HealthCheckConfig;
    private metrics: Map<string, NodeHealthMetrics>;
    private checkIntervalId: NodeJS.Timeout | null = null;
    private recoveryIntervalId: NodeJS.Timeout | null = null;
    private log = logger.withContext({ service: 'health-checker' });

    constructor(config: Partial<HealthCheckConfig> = {}) {
        // Merge provided config with defaults
        this.config = { ...defaultHealthCheckConfig, ...config };
        this.metrics = new Map<string, NodeHealthMetrics>();
        this.initializeMetrics();
    }

    /**
     * Initialize health metrics for all nodes
     */
    private initializeMetrics(): void {
        const nodes = getNodeConfig();
        nodes.forEach(node => {
            if (!this.metrics.has(node.id)) {
                this.metrics.set(node.id, {
                    responseTime: [],
                    avgResponseTime: 0,
                    lastResponseTime: 0,
                    successCount: 0,
                    failureCount: 0,
                    consecutiveFailures: 0,
                    consecutiveSuccesses: 0,
                    lastChecked: 0,
                    lastStatusChange: Date.now(),
                    score: node.healthy ? 100 : 0
                });
            }
        });
    }

    /**
     * Start the health checking service
     */
    public start(): void {
        this.log.info(`Starting health checker with interval ${this.config.interval}ms`);
        
        // Stop existing intervals if running
        this.stop();
        
        // Start regular health checks
        this.checkIntervalId = setInterval(() => {
            this.checkAllNodes();
        }, this.config.interval);
        
        // Start recovery checks for unhealthy nodes
        this.recoveryIntervalId = setInterval(() => {
            this.attemptRecovery();
        }, this.config.recoveryInterval);
        
        // Run an immediate check
        this.checkAllNodes();
    }

    /**
     * Stop the health checking service
     */
    public stop(): void {
        if (this.checkIntervalId) {
            clearInterval(this.checkIntervalId);
            this.checkIntervalId = null;
        }

        if (this.recoveryIntervalId) {
            clearInterval(this.recoveryIntervalId);
            this.recoveryIntervalId = null;
        }
        
        this.log.info('Health checker stopped');
    }

    /**
     * Check health of all configured nodes
     */
    private checkAllNodes(): void {
        const nodes = getNodeConfig();
        nodes.forEach(node => {
            this.checkNodeHealth(node);
        });
    }

    /**
     * Check health for a specific node
     */
    private async checkNodeHealth(node: NodeInfo): Promise<void> {
        const startTime = Date.now();
        const nodeMetrics = this.getOrCreateMetrics(node.id);
        
        try {
            // Build health check URL
            const url = new URL(this.config.healthEndpoint, node.url);
            
            // Use simple RPC health check method
            const body = JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "web3_clientVersion",
                params: []
            });
            
            // Perform the health check
            const response = await fetch(url.toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body,
                timeout: this.config.timeout
            });
            
            const responseTime = Date.now() - startTime;
            
            if (response.ok) {
                this.recordSuccess(node.id, responseTime);
                this.log.debug(`Node ${node.id} health check passed in ${responseTime}ms`);
            } else {
                this.recordFailure(node.id, responseTime);
                this.log.warn(`Node ${node.id} health check failed with status ${response.status}`);
            }
        } catch (error) {
            const responseTime = Date.now() - startTime;
            this.recordFailure(node.id, responseTime);
            this.log.error(`Node ${node.id} health check error: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            nodeMetrics.lastChecked = Date.now();
        }
    }

    /**
     * Record a successful health check
     */
    private recordSuccess(nodeId: string, responseTime: number): void {
        const node = getNodeById(nodeId);
        if (!node) return;
        
        const metrics = this.getOrCreateMetrics(nodeId);
        
        // Update metrics
        metrics.lastResponseTime = responseTime;
        metrics.responseTime.push(responseTime);
        if (metrics.responseTime.length > 10) {
            metrics.responseTime.shift(); // Keep only last 10 values
        }
        
        metrics.avgResponseTime = this.calculateAverage(metrics.responseTime);
        metrics.successCount++;
        metrics.consecutiveSuccesses++;
        metrics.consecutiveFailures = 0;
        
        // Update node health status if needed
        if (!node.healthy && metrics.consecutiveSuccesses >= this.config.successThreshold) {
            updateNodeHealth(nodeId, true);
            metrics.lastStatusChange = Date.now();
            this.log.info(`Node ${nodeId} marked as healthy after ${metrics.consecutiveSuccesses} consecutive successes`);
        }
        
        // Calculate node score
        this.calculateNodeScore(nodeId);
    }

    /**
     * Record a failed health check
     */
    private recordFailure(nodeId: string, responseTime: number): void {
        const node = getNodeById(nodeId);
        if (!node) return;
        
        const metrics = this.getOrCreateMetrics(nodeId);
        
        // Update metrics
        metrics.failureCount++;
        metrics.consecutiveFailures++;
        metrics.consecutiveSuccesses = 0;
        
        // Update node health status if needed
        if (node.healthy && metrics.consecutiveFailures >= this.config.failureThreshold) {
            updateNodeHealth(nodeId, false);
            metrics.lastStatusChange = Date.now();
            this.log.warn(`Node ${nodeId} marked as unhealthy after ${metrics.consecutiveFailures} consecutive failures`);
        }
        
        // Calculate node score
        this.calculateNodeScore(nodeId);
    }

    /**
     * Calculate node health score (0-100)
     */
    private calculateNodeScore(nodeId: string): number {
        const node = getNodeById(nodeId);
        if (!node) return 0;
        
        const metrics = this.getOrCreateMetrics(nodeId);
        
        // If node is marked unhealthy, score is very low but not zero
        // to allow recovery priority based on other factors
        if (!node.healthy) {
            metrics.score = Math.min(10, metrics.score);
            return metrics.score;
        }
        
        // Calculate success rate (50% of score)
        const totalChecks = metrics.successCount + metrics.failureCount;
        const successRate = totalChecks > 0 ? metrics.successCount / totalChecks : 1; 
        const successScore = successRate * 50;
        
        // Calculate response time score (50% of score)
        // Using average response times across all nodes
        const avgResponseTime = this.getAverageResponseTimeAcrossNodes();
        let responseTimeScore = 50;
        
        if (avgResponseTime > 0 && metrics.avgResponseTime > 0) {
            // Response time relative to average (lower is better)
            const ratio = metrics.avgResponseTime / avgResponseTime;
            
            if (ratio <= 0.5) {
                // Much faster than average
                responseTimeScore = 50;
            } else if (ratio >= 2) {
                // Much slower than average
                responseTimeScore = 10;
            } else {
                // Linear scale between 10-50 based on ratio
                responseTimeScore = 50 - ((ratio - 0.5) * (40 / 1.5));
            }
        }
        
        // Total score (0-100)
        const totalScore = Math.max(0, Math.min(100, successScore + responseTimeScore));
        metrics.score = Math.round(totalScore);
        
        return metrics.score;
    }

    /**
     * Attempt to recover unhealthy nodes
     */
    private attemptRecovery(): void {
        const nodes = getNodeConfig().filter(node => !node.healthy);
        
        if (nodes.length > 0) {
            this.log.info(`Attempting recovery for ${nodes.length} unhealthy nodes`);
            
            nodes.forEach(node => {
                this.checkNodeHealth(node);
            });
        }
    }

    /**
     * Get health metrics for a node
     */
    private getOrCreateMetrics(nodeId: string): NodeHealthMetrics {
        if (!this.metrics.has(nodeId)) {
            this.metrics.set(nodeId, {
                responseTime: [],
                avgResponseTime: 0,
                lastResponseTime: 0,
                successCount: 0,
                failureCount: 0,
                consecutiveFailures: 0,
                consecutiveSuccesses: 0,
                lastChecked: 0,
                lastStatusChange: Date.now(),
                score: 50 // Default starting score
            });
        }
        
        return this.metrics.get(nodeId)!;
    }

    /**
     * Calculate average of an array of numbers
     */
    private calculateAverage(values: number[]): number {
        if (values.length === 0) return 0;
        return values.reduce((sum, val) => sum + val, 0) / values.length;
    }

    /**
     * Calculate average response time across all healthy nodes
     */
    private getAverageResponseTimeAcrossNodes(): number {
        let sum = 0;
        let count = 0;
        
        this.metrics.forEach(metrics => {
            if (metrics.avgResponseTime > 0) {
                sum += metrics.avgResponseTime;
                count++;
            }
        });
        
        return count > 0 ? sum / count : 0;
    }

    /**
     * Get health report for all nodes
     */
    public getHealthReport(): any {
        const report: any = {
            totalNodes: 0,
            healthyNodes: 0,
            unhealthyNodes: 0,
            avgResponseTime: 0,
            nodes: {}
        };

        const nodes = getNodeConfig();
        report.totalNodes = nodes.length;
        
        nodes.forEach(node => {
            const metrics = this.getOrCreateMetrics(node.id);
            
            // Count healthy/unhealthy nodes
            if (node.healthy) {
                report.healthyNodes++;
            } else {
                report.unhealthyNodes++;
            }
            
            // Node specific details
            report.nodes[node.id] = {
                id: node.id,
                url: node.url,
                network: node.network,
                healthy: node.healthy,
                responseTime: metrics.lastResponseTime,
                avgResponseTime: metrics.avgResponseTime,
                successRate: this.getSuccessRate(node.id),
                score: metrics.score,
                lastChecked: new Date(metrics.lastChecked).toISOString(),
                lastStatusChange: new Date(metrics.lastStatusChange).toISOString()
            };
        });
        
        // Calculate global average response time
        report.avgResponseTime = this.getAverageResponseTimeAcrossNodes();
        
        return report;
    }

    /**
     * Get success rate for a node (0-100%)
     */
    public getSuccessRate(nodeId: string): number {
        const metrics = this.metrics.get(nodeId);
        if (!metrics) return 0;
        
        const total = metrics.successCount + metrics.failureCount;
        return total > 0 ? (metrics.successCount / total) * 100 : 100;
    }

    /**
     * Get node health score
     */
    public getNodeScore(nodeId: string): number {
        const metrics = this.metrics.get(nodeId);
        return metrics ? metrics.score : 0;
    }

    /**
     * Get all nodes sorted by health score (highest first)
     */
    public getNodesByScore(): NodeInfo[] {
        const nodes = getNodeConfig();
        
        return [...nodes].sort((a, b) => {
            const scoreA = this.getNodeScore(a.id);
            const scoreB = this.getNodeScore(b.id);
            return scoreB - scoreA; // Descending order
        });
    }

    /**
     * Force update a node's health status
     */
    public forceUpdateHealth(nodeId: string, isHealthy: boolean): boolean {
        const node = getNodeById(nodeId);
        if (!node) return false;
        
        updateNodeHealth(nodeId, isHealthy);
        
        const metrics = this.getOrCreateMetrics(nodeId);
        metrics.lastStatusChange = Date.now();
        
        if (isHealthy) {
            metrics.consecutiveFailures = 0;
            metrics.consecutiveSuccesses = this.config.successThreshold;
        } else {
            metrics.consecutiveSuccesses = 0;
            metrics.consecutiveFailures = this.config.failureThreshold;
        }
        
        this.calculateNodeScore(nodeId);
        
        this.log.info(`Manually ${isHealthy ? 'enabled' : 'disabled'} node ${nodeId}`);
        return true;
    }
}

/**
 * Get or create the health checker singleton
 */
export function getHealthChecker(config?: Partial<HealthCheckConfig>): HealthChecker {
    if (!healthCheckerInstance) {
        healthCheckerInstance = new HealthChecker(config);
    }
    return healthCheckerInstance;
}

/**
 * Initialize health checker with config and auto-start
 */
export function initHealthChecker(config?: Partial<HealthCheckConfig>): HealthChecker {
    const healthChecker = getHealthChecker(config);
    healthChecker.start();
    return healthChecker;
}