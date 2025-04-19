import { performance } from 'perf_hooks';
import { selectNode } from '../../src/services/loadBalancer';
import * as nodeConfig from '../../src/config/nodeConfig';

const mockNodes = Array.from({ length: 1000 }, (_, i) => ({
  id: `node-${i}`,
  url: `http://node-${i}.com`,
  network: 'avalanche-mainnet',
  healthy: true,
  lastChecked: Date.now(),
}));

(nodeConfig.getNodesByNetwork as jest.Mock) = jest.fn(() => mockNodes);

describe('Benchmark - selectNode()', () => {
  it('should select a node within acceptable time', () => {
    const start = performance.now();

    for (let i = 0; i < 10000; i++) {
      selectNode('avalanche-mainnet');
    }

    const end = performance.now();
    const duration = end - start;

    console.log(`10,000 node selections took ${duration.toFixed(2)} ms`);

    expect(duration).toBeLessThan(100); // you can adjust the expectation
  });
});
