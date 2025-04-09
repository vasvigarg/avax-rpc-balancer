import { NodeInfo, getNodeConfig } from '../config/nodeConfig';

// Basic Round Robin (replace with more sophisticated strategies)
let currentIndex = 0;

export function selectNode(strategy: 'round-robin' | 'random' = 'round-robin'): NodeInfo | null {
    const availableNodes = getNodeConfig().filter(node => node.healthy);

    if (availableNodes.length === 0) {
        console.error('No healthy nodes available!');
        return null; // No healthy nodes
    }

    switch (strategy) {
        case 'random':
            const randomIndex = Math.floor(Math.random() * availableNodes.length);
            return availableNodes[randomIndex];
        case 'round-robin':
        default:
            currentIndex = (currentIndex + 1) % availableNodes.length;
            return availableNodes[currentIndex];
        // Add weighted strategy here if needed
    }
}