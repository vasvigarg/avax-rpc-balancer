// Example node configuration - load dynamically or from env vars in reality
// Add health status property to be updated by the health checker

export interface NodeInfo {
    id: string;
    url: string;
    network: 'avalanche-mainnet' | 'avalanche-fuji';
    healthy: boolean; // Status updated by health checker
    weight?: number; // Optional: for weighted balancing
    lastCheck?: number; // Timestamp of last health check
}

// Load from environment variables or a config service in a real app
export const nodes: NodeInfo[] = [
    { id: 'node1', url: process.env.NODE1_URL || 'http://localhost:9650/ext/bc/C/rpc', network: 'avalanche-fuji', healthy: true },
    { id: 'node2', url: process.env.NODE2_URL || 'http://localhost:9651/ext/bc/C/rpc', network: 'avalanche-fuji', healthy: true },
    // Add more nodes
];

// In-memory state for health (replace with DB/Cache like DynamoDB for persistence)
const nodeHealthState = new Map<string, NodeInfo>(nodes.map(n => [n.id, { ...n }]));

export function getNodeConfig(): NodeInfo[] {
    // Return current state
    return Array.from(nodeHealthState.values());
}

export function updateNodeHealth(nodeId: string, isHealthy: boolean): void {
    const node = nodeHealthState.get(nodeId);
    if (node) {
        node.healthy = isHealthy;
        node.lastCheck = Date.now();
        nodeHealthState.set(nodeId, node);
        console.log(`Updated health for ${nodeId}: ${isHealthy}`);
    }
}