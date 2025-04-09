import { ScheduledEvent } from 'aws-lambda';
import axios from 'axios';
import { nodes, updateNodeHealth } from '../../config/nodeConfig';

const HEALTH_CHECK_TIMEOUT = 3000; // 3 seconds

async function checkNode(nodeUrl: string): Promise<boolean> {
    try {
        // Example: Use a simple, non-state-changing RPC call like eth_chainId
        const response = await axios.post(
            nodeUrl,
            { jsonrpc: '2.0', method: 'eth_chainId', params: [], id: `health_${Date.now()}` },
            { timeout: HEALTH_CHECK_TIMEOUT, headers: { 'Content-Type': 'application/json' } }
        );
        // Check if the response format is valid JSON-RPC and doesn't contain an error
        return response.status === 200 && response.data && response.data.jsonrpc === '2.0' && response.data.result !== undefined;
        // Add Avalanche-specific checks here (e.g., block height comparison)
    } catch (error) {
        console.warn(`Health check failed for ${nodeUrl}:`, error);
        return false;
    }
}

export const monitorNodeHealth = async (event: ScheduledEvent): Promise<void> => {
    console.log(`Running scheduled health checks at ${event.time}`);

    const checks = nodes.map(async (node) => {
        const isHealthy = await checkNode(node.url);
        updateNodeHealth(node.id, isHealthy); // Update in-memory state (replace with DB update)
    });

    await Promise.all(checks);

    console.log('Health checks completed.');
    // Optionally: Persist the results to DynamoDB or trigger alerts
};