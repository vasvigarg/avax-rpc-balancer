// Assuming Jest is configured via package.json or jest.config.js
import { selectNode } from '../../src/services/loadBalancer';
import { getNodeConfig, updateNodeHealth, NodeInfo } from '../../src/config/nodeConfig';

// Mock the nodeConfig module
jest.mock('../../src/config/nodeConfig', () => {
    const originalNodes: NodeInfo[] = [
        { id: 'node1', url: 'url1', network: 'avalanche-fuji', healthy: true },
        { id: 'node2', url: 'url2', network: 'avalanche-fuji', healthy: true },
        { id: 'node3', url: 'url3', network: 'avalanche-fuji', healthy: false }, // Unhealthy one
    ];
    const nodeMap = new Map<string, NodeInfo>(originalNodes.map(n => [n.id, { ...n }]));

    return {
        // Use jest.fn() to wrap module functions if you need to track calls
        getNodeConfig: jest.fn(() => Array.from(nodeMap.values())),
        updateNodeHealth: jest.fn((nodeId: string, isHealthy: boolean) => {
            const node = nodeMap.get(nodeId);
            if (node) {
                node.healthy = isHealthy;
                nodeMap.set(nodeId, node);
            }
        }),
        // Export NodeInfo type if needed by the test
        NodeInfo: jest.requireActual('../../src/config/nodeConfig').NodeInfo
    };
});

// Clear mocks before each test
beforeEach(() => {
    // Reset mocks if they have state or call history
    (getNodeConfig as jest.Mock).mockClear();
    (updateNodeHealth as jest.Mock).mockClear();

    // Reset health state manually for this mock implementation if needed
    updateNodeHealth('node1', true);
    updateNodeHealth('node2', true);
    updateNodeHealth('node3', false);
});


describe('Load Balancer Service', () => {
    it('should select a healthy node using round-robin', () => {
        const node1 = selectNode('round-robin');
        expect(node1).toBeDefined();
        expect(node1?.healthy).toBe(true);
        expect(['node1', 'node2']).toContain(node1?.id); // Should not select node3

        const node2 = selectNode('round-robin');
        expect(node2).toBeDefined();
        expect(node2?.healthy).toBe(true);
        expect(['node1', 'node2']).toContain(node2?.id);

        // Expect node1 and node2 selected to be different in round-robin over 2 calls
        expect(node1?.id).not.toEqual(node2?.id);
    });

    it('should return null if no healthy nodes are available', () => {
        // Mark all nodes as unhealthy for this test case
        updateNodeHealth('node1', false);
        updateNodeHealth('node2', false);
        // node3 is already false

        const node = selectNode();
        expect(node).toBeNull();
    });

    // Add tests for 'random' strategy if implemented
});