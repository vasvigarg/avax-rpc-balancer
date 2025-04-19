import { selectNode } from '../../src/services/loadBalancer';
import * as nodeConfig from '../../src/config/nodeConfig';
import { NodeInfo } from '../../src/config/nodeConfig';

jest.mock('../../src/config/nodeConfig');

describe('LoadBalancer - selectNode', () => {
  const mockNodes: NodeInfo[] = [
    {
      id: '1',
      url: 'http://node1.com',
      healthy: true,
      network: 'avalanche-mainnet',
      lastCheck: Date.now(),
    },
    {
      id: '2',
      url: 'http://node2.com',
      healthy: true,
      network: 'avalanche-mainnet',
      lastCheck: Date.now(),
    },
    {
      id: '3',
      url: 'http://node3.com',
      healthy: false,
      network: 'avalanche-mainnet',
      lastCheck: Date.now(),
    },
  ];

  beforeEach(() => {
    jest.resetAllMocks();
    (nodeConfig.getNodesByNetwork as jest.Mock).mockReturnValue(mockNodes);
  });

  it('returns a healthy node', () => {
    const selected = selectNode('avalanche-mainnet');
    expect(selected).not.toBeNull();
    expect(selected?.healthy).toBe(true);
  });

  it('returns null if all nodes are unhealthy', () => {
    const allUnhealthy = mockNodes.map(n => ({ ...n, healthy: false }));
    (nodeConfig.getNodesByNetwork as jest.Mock).mockReturnValue(allUnhealthy);

    const selected = selectNode('avalanche-mainnet');
    expect(selected).toBeNull();
  });

  it('round-robins between healthy nodes', () => {
    const first = selectNode('avalanche-mainnet');
    const second = selectNode('avalanche-mainnet');
    expect(first?.id).not.toEqual(second?.id);
  });
});
