import { NodeInfo, getNodeConfig, getHealthyNodesByNetwork } from '../config/nodeConfig';
import { getHealthChecker } from './healthChecker';
import { getCircuitBreaker, CircuitState } from './circuitBreaker';
import { logger } from '../utils/logger';

const log = logger.withContext({ service: 'load-balancer' });

// Load balancing strategies
export type LoadBalancingStrategy = 'round-robin' | 'random' | 'weighted' | 'health-based' | 'sticky';
let currentIndex = 0;

// Store for sticky sessions
interface StickySession {
  nodeId: string;
  lastUsed: number;
  expiresAt: number;
}

const stickySessions = new Map<string, StickySession>();
const STICKY_SESSION_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Select a node based on the specified strategy
 */
export function selectNode(
  network: 'avalanche-mainnet' | 'avalanche-fuji',
  strategy: LoadBalancingStrategy = 'health-based',
  requiredCapability?: string,
  sessionId?: string
): NodeInfo | null {
    // Get nodes for the specified network
    const networkNodes = getHealthyNodesByNetwork(network);
    
    // Get circuit breaker instance
    const circuitBreaker = getCircuitBreaker();
    
    // Filter by capability and circuit breaker status
    const availableNodes = networkNodes.filter(node => {
        const hasCapability = !requiredCapability || node.capabilities?.includes(requiredCapability);
        const isCircuitClosed = circuitBreaker.isAllowed(node.id);
        return hasCapability && isCircuitClosed;
    });

    if (availableNodes.length === 0) {
        log.error(`No healthy nodes available for network ${network}${requiredCapability ? ` with capability ${requiredCapability}` : ''}`);
        
        // Failover logic: if we have no available nodes due to circuit breakers, but we do have
        // healthy nodes, we could try to use the least bad one in an emergency
        if (networkNodes.length > 0 && requiredCapability === undefined) {
            log.warn('Attempting failover to any healthy node despite circuit breaker status');
            
            // Sort nodes by their failure count, use the one with the least failures
            const sortedNodes = [...networkNodes].sort((a, b) => {
                const statsA = circuitBreaker.getCircuitStats(a.id);
                const statsB = circuitBreaker.getCircuitStats(b.id);
                return statsA.totalFailures - statsB.totalFailures;
            });
            
            log.warn(`Emergency fallback to node ${sortedNodes[0].id}`);
            return sortedNodes[0];
        }
        
        return null;
    }

    // Handle sticky session if sessionId is provided and strategy is sticky
    if (strategy === 'sticky' && sessionId) {
        const existingSession = stickySessions.get(sessionId);
        const now = Date.now();
        
        // Check if we have a valid sticky session
        if (existingSession && 
            existingSession.expiresAt > now &&
            availableNodes.some(node => node.id === existingSession.nodeId)) {
            
            // Update session timestamp
            existingSession.lastUsed = now;
            stickySessions.set(sessionId, existingSession);
            
            // Find and return the sticky node
            const stickyNode = availableNodes.find(node => node.id === existingSession.nodeId);
            if (stickyNode) {
                log.debug(`Using sticky session for ${sessionId} on node ${stickyNode.id}`);
                return stickyNode;
            }
        }
        
        // If no valid sticky session, create a new one using health-based selection
        const selectedNode = selectNodeByStrategy(availableNodes, 'health-based');
        
        if (selectedNode) {
            // Create new sticky session
            stickySessions.set(sessionId, {
                nodeId: selectedNode.id,
                lastUsed: now,
                expiresAt: now + STICKY_SESSION_TTL
            });
            
            log.debug(`Created new sticky session for ${sessionId} on node ${selectedNode.id}`);
            return selectedNode;
        }
    }

    // For non-sticky strategies
    return selectNodeByStrategy(availableNodes, strategy);
}

/**
 * Handle node selection based on the specified strategy
 */
function selectNodeByStrategy(
    availableNodes: NodeInfo[],
    strategy: LoadBalancingStrategy
): NodeInfo | null {
    if (availableNodes.length === 0) return null;
    
    // Get health checker instance
    const healthChecker = getHealthChecker();

    switch (strategy) {
        case 'random':
            const randomIndex = Math.floor(Math.random() * availableNodes.length);
            return availableNodes[randomIndex];
            
        case 'weighted':
            // Weighted random selection based on node weight
            const totalWeight = availableNodes.reduce((sum, node) => sum + (node.weight || 1), 0);
            let random = Math.random() * totalWeight;
            
            for (const node of availableNodes) {
                random -= (node.weight || 1);
                if (random <= 0) {
                    return node;
                }
            }
            return availableNodes[0]; // Fallback to first node
            
        case 'health-based':
            // Sort by health score (highest first)
            const scoredNodes = [...availableNodes].sort((a, b) => {
                return healthChecker.getNodeScore(b.id) - healthChecker.getNodeScore(a.id);
            });
            
            // Logging the selection
            if (scoredNodes.length > 0) {
                log.debug(`Selected node ${scoredNodes[0].id} with health score ${healthChecker.getNodeScore(scoredNodes[0].id)}`);
            }
            
            return scoredNodes[0];
            
        case 'round-robin':
        default:
            // This is potentially problematic if this is called from multiple concurrent processes
            currentIndex = (currentIndex + 1) % availableNodes.length;
            return availableNodes[currentIndex];
    }
}

/**
 * Get a list of nodes sorted by their health score
 */
export function getNodesSortedByHealth(network?: 'avalanche-mainnet' | 'avalanche-fuji'): NodeInfo[] {
    const healthChecker = getHealthChecker();
    const nodes = network ? getHealthyNodesByNetwork(network) : getNodeConfig();
    
    return [...nodes].sort((a, b) => {
        return healthChecker.getNodeScore(b.id) - healthChecker.getNodeScore(a.id);
    });
}

/**
 * Cleanup expired sticky sessions
 * Should be called periodically (e.g., every minute)
 */
export function cleanupStickySessions(): void {
    const now = Date.now();
    let expiredCount = 0;
    
    for (const [sessionId, session] of stickySessions.entries()) {
        if (session.expiresAt <= now) {
            stickySessions.delete(sessionId);
            expiredCount++;
        }
    }
    
    if (expiredCount > 0) {
        log.debug(`Cleaned up ${expiredCount} expired sticky sessions`);
    }
}

/**
 * Reset a sticky session for a client
 */
export function resetStickySession(sessionId: string): boolean {
    return stickySessions.delete(sessionId);
}

/**
 * Get the current sticky session count
 */
export function getStickySessionCount(): number {
    return stickySessions.size;
}

/**
 * Record a successful request to update circuit breaker
 */
export function recordSuccessfulRequest(nodeId: string): void {
    const circuitBreaker = getCircuitBreaker();
    circuitBreaker.recordSuccess(nodeId);
}

/**
 * Record a failed request to update circuit breaker
 */
export function recordFailedRequest(nodeId: string): void {
    const circuitBreaker = getCircuitBreaker();
    circuitBreaker.recordFailure(nodeId);
}

/**
 * Get circuit breaker status for all nodes
 */
export function getCircuitStatus(): Record<string, {state: CircuitState, stats: any}> {
    const circuitBreaker = getCircuitBreaker();
    const allCircuits = circuitBreaker.getAllCircuits();
    
    const result: Record<string, {state: CircuitState, stats: any}> = {};
    for (const [nodeId, stats] of allCircuits.entries()) {
        result[nodeId] = {
            state: stats.state,
            stats: {
                failures: stats.failures,
                successes: stats.successes,
                totalFailures: stats.totalFailures,
                totalSuccesses: stats.totalSuccesses,
                lastFailure: stats.lastFailure,
                lastSuccess: stats.lastSuccess,
                openedAt: stats.openedAt
            }
        };
    }
    
    return result;
}

/**
 * Initialize circuit breakers for all nodes
 */
export function initializeCircuitBreakers(): void {
    const circuitBreaker = getCircuitBreaker();
    const nodes = getNodeConfig();
    
    for (const node of nodes) {
        circuitBreaker.initCircuit(node.id);
    }
    
    log.info(`Initialized circuit breakers for ${nodes.length} nodes`);
}

// Initialize circuit breakers on module load
initializeCircuitBreakers();

// Setup session cleanup interval
setInterval(cleanupStickySessions, 60000); // Run every minute