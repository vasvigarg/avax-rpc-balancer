import { NodeInfo, getNodeConfig, getHealthyNodesByNetwork } from '../config/nodeConfig';
import { getHealthChecker } from './healthChecker';
import { logger } from '../utils/logger';

const log = logger.withContext({ service: 'load-balancer' });

// Load balancing strategies
export type LoadBalancingStrategy = 'round-robin' | 'random' | 'weighted' | 'health-based';
let currentIndex = 0;

/**
 * Select a node based on the specified strategy
 */
export function selectNode(
  network: 'avalanche-mainnet' | 'avalanche-fuji',
  strategy: LoadBalancingStrategy = 'health-based',
  requiredCapability?: string
): NodeInfo | null {
    // Get nodes for the specified network
    const networkNodes = getHealthyNodesByNetwork(network);
    
    // Filter by capability if specified
    const availableNodes = requiredCapability 
        ? networkNodes.filter(node => node.capabilities?.includes(requiredCapability))
        : networkNodes;

    if (availableNodes.length === 0) {
        log.error(`No healthy nodes available for network ${network}${requiredCapability ? ` with capability ${requiredCapability}` : ''}`);
        return null;
    }

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