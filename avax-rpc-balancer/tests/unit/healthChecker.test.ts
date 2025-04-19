import { HealthChecker } from '../../src/services/healthChecker';
import * as nodeConfig from '../../src/config/nodeConfig';
import fetch from 'node-fetch';

jest.mock('node-fetch');
jest.mock('../../src/config/nodeConfig');

const mockNode = {
  id: 'node-1',
  url: 'http://mocknode.com',
  network: 'avalanche-mainnet',
  healthy: true,
  lastChecked: Date.now(),
};

describe('HealthChecker', () => {
  let healthChecker: HealthChecker;

  beforeEach(() => {
    jest.clearAllMocks();

    (nodeConfig.getNodeConfig as jest.Mock).mockReturnValue([mockNode]);
    (nodeConfig.getNodeById as jest.Mock).mockImplementation((id: string) =>
      id === mockNode.id ? mockNode : null,
    );
    (nodeConfig.updateNodeHealth as jest.Mock).mockImplementation(() => true);

    healthChecker = new HealthChecker({
      interval: 500,
      timeout: 100,
      healthEndpoint: '/',
      failureThreshold: 2,
      successThreshold: 1,
    });
  });

  it('should mark node as healthy when health check succeeds', async () => {
    (fetch as unknown as jest.Mock).mockResolvedValue({ ok: true });

    await (healthChecker as any).checkNodeHealth(mockNode); // Accessing private method for test

    const report = healthChecker.getHealthReport();
    expect(report.healthyNodes).toBe(1);
    expect(report.unhealthyNodes).toBe(0);
    expect(report.nodes[mockNode.id].score).toBeGreaterThanOrEqual(50);
  });

  it('should mark node as unhealthy after failed checks', async () => {
    (fetch as unknown as jest.Mock).mockResolvedValue({ ok: false });

    await (healthChecker as any).checkNodeHealth(mockNode);
    await (healthChecker as any).checkNodeHealth(mockNode); // 2 failures

    const report = healthChecker.getHealthReport();
    expect(report.healthyNodes).toBe(0);
    expect(report.unhealthyNodes).toBe(1);
  });

  it('should return sorted nodes by score', () => {
    // Manually update score for control
    (healthChecker as any).getOrCreateMetrics(mockNode.id).score = 95;

    const nodes = healthChecker.getNodesByScore();
    expect(nodes[0].id).toBe(mockNode.id);
  });

  it('should force update health', () => {
    const result = healthChecker.forceUpdateHealth(mockNode.id, false);
    expect(result).toBe(true);

    const report = healthChecker.getHealthReport();
    expect(report.unhealthyNodes).toBe(1);
  });
});
