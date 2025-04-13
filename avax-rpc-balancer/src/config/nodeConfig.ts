// Node configuration for AVAX RPC Balancer
// Supports multiple networks and nodes with health tracking

export interface NodeInfo {
    id: string;
    url: string;
    network: 'avalanche-mainnet' | 'avalanche-fuji';
    healthy: boolean; // Status updated by health checker
    weight?: number; // Optional: for weighted balancing
    lastCheck?: number; // Timestamp of last health check
    priority?: number; // Optional: priority for selection (lower = higher priority)
    rpcVersion?: string; // JSON-RPC version supported
    capabilities?: string[]; // Optional: specific capabilities of this node
    rateLimits?: { // Optional: rate limiting configuration
        requests: number;
        period: number; // in milliseconds
    };
}

// Default nodes configuration - in production, load from env vars or external config
export const nodes: NodeInfo[] = [
    { 
        id: 'fuji-node1', 
        url: process.env.FUJI_NODE1_URL || 'http://localhost:9650/ext/bc/C/rpc', 
        network: 'avalanche-fuji', 
        healthy: true,
        weight: 10,
        priority: 1,
        rpcVersion: '2.0',
        capabilities: ['eth_call', 'eth_getBalance', 'eth_sendTransaction'],
        rateLimits: {
            requests: 100,
            period: 60000 // 1 minute
        }
    },
    { 
        id: 'fuji-node2', 
        url: process.env.FUJI_NODE2_URL || 'http://localhost:9651/ext/bc/C/rpc', 
        network: 'avalanche-fuji', 
        healthy: true,
        weight: 10,
        priority: 2,
        rpcVersion: '2.0',
        capabilities: ['eth_call', 'eth_getBalance', 'eth_sendTransaction'],
        rateLimits: {
            requests: 100,
            period: 60000
        }
    },
    { 
        id: 'mainnet-node1', 
        url: process.env.MAINNET_NODE1_URL || 'http://localhost:9652/ext/bc/C/rpc', 
        network: 'avalanche-mainnet', 
        healthy: true,
        weight: 20,
        priority: 1,
        rpcVersion: '2.0',
        capabilities: ['eth_call', 'eth_getBalance', 'eth_sendTransaction'],
        rateLimits: {
            requests: 200,
            period: 60000
        }
    },
    { 
        id: 'mainnet-node2', 
        url: process.env.MAINNET_NODE2_URL || 'http://localhost:9653/ext/bc/C/rpc', 
        network: 'avalanche-mainnet', 
        healthy: true,
        weight: 20,
        priority: 2,
        rpcVersion: '2.0',
        capabilities: ['eth_call', 'eth_getBalance', 'eth_sendTransaction'],
        rateLimits: {
            requests: 200,
            period: 60000
        }
    }
];

// In-memory state for health (replace with DB/Cache like Redis/DynamoDB for persistence)
const nodeHealthState = new Map<string, NodeInfo>(nodes.map(n => [n.id, { ...n }]));

/**
 * Get all node configurations
 */
export function getNodeConfig(): NodeInfo[] {
    return Array.from(nodeHealthState.values());
}

/**
 * Get nodes filtered by network
 */
export function getNodesByNetwork(network: 'avalanche-mainnet' | 'avalanche-fuji'): NodeInfo[] {
    return Array.from(nodeHealthState.values()).filter(node => node.network === network);
}

/**
 * Get only healthy nodes
 */
export function getHealthyNodes(): NodeInfo[] {
    return Array.from(nodeHealthState.values()).filter(node => node.healthy);
}

/**
 * Get healthy nodes for a specific network
 */
export function getHealthyNodesByNetwork(network: 'avalanche-mainnet' | 'avalanche-fuji'): NodeInfo[] {
    return Array.from(nodeHealthState.values()).filter(
        node => node.network === network && node.healthy
    );
}

/**
 * Get a specific node by ID
 */
export function getNodeById(id: string): NodeInfo | undefined {
    return nodeHealthState.get(id);
}

/**
 * Update node health status
 */
export function updateNodeHealth(nodeId: string, isHealthy: boolean): void {
    const node = nodeHealthState.get(nodeId);
    if (node) {
        node.healthy = isHealthy;
        node.lastCheck = Date.now();
        nodeHealthState.set(nodeId, node);
        console.log(`Updated health status for ${nodeId}: ${isHealthy ? 'healthy' : 'unhealthy'}`);
    } else {
        console.error(`Failed to update health: Node ${nodeId} not found`);
    }
}

/**
 * Update node weight (for load balancing)
 */
export function updateNodeWeight(nodeId: string, weight: number): void {
    const node = nodeHealthState.get(nodeId);
    if (node) {
        node.weight = weight;
        nodeHealthState.set(nodeId, node);
        console.log(`Updated weight for ${nodeId}: ${weight}`);
    } else {
        console.error(`Failed to update weight: Node ${nodeId} not found`);
    }
}

/**
 * Add a new node dynamically
 */
export function addNode(node: NodeInfo): boolean {
    if (nodeHealthState.has(node.id)) {
        console.error(`Cannot add node: Node with ID ${node.id} already exists`);
        return false;
    }
    
    nodeHealthState.set(node.id, { ...node, lastCheck: Date.now() });
    console.log(`Added new node: ${node.id} (${node.network})`);
    return true;
}

/**
 * Remove a node dynamically
 */
export function removeNode(nodeId: string): boolean {
    if (!nodeHealthState.has(nodeId)) {
        console.error(`Cannot remove node: Node with ID ${nodeId} not found`);
        return false;
    }
    
    nodeHealthState.delete(nodeId);
    console.log(`Removed node: ${nodeId}`);
    return true;
}

/**
 * Reset all nodes to default configuration
 */
export function resetNodeConfig(): void {
    nodeHealthState.clear();
    nodes.forEach(node => {
        nodeHealthState.set(node.id, { ...node });
    });
    console.log(`Reset node configuration to defaults`);
}

/**
 * Check if a node has a specific capability
 */
export function nodeHasCapability(nodeId: string, capability: string): boolean {
    const node = nodeHealthState.get(nodeId);
    return !!node?.capabilities?.includes(capability);
}