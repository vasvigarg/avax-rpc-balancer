import express from 'express';
import http from 'http';
import { proxyRequest } from '../../src/services/rpcHandler';
//import * as nodeConfig from '../../src/config/nodeConfig';

let server: http.Server;
const PORT = 8546;
const NODE_URL = `http://localhost:${PORT}`;

const mockNode = {
  id: 'mock-node-1',
  url: NODE_URL,
  network: 'avalanche-mainnet',
  healthy: true,
  lastChecked: Date.now(),
};

beforeAll(done => {
  const app = express();
  app.use(express.json());

  app.post('/', (req, res) => {
    const { id, method } = req.body;
    if (method === 'eth_blockNumber') {
      return res.json({
        jsonrpc: '2.0',
        id,
        result: '0x123456',
      });
    }
    return res.status(400).json({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: 'Method not found' },
    });
  });

  server = app.listen(PORT, () => {
    console.log(`Mock node listening on ${NODE_URL}`);
    done();
  });
});

afterAll(done => {
  server.close(done);
});

describe('Integration - proxyRequest with live mock node', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    jest.mock('../../src/config/nodeConfig', () => ({
      getNodeById: () => mockNode,
      getNodeConfig: () => [mockNode],
      updateNodeHealth: jest.fn(),
    }));
  });

  it('should return expected block number from mock node', async () => {
    const result = await proxyRequest(NODE_URL, {
      jsonrpc: '2.0',
      method: 'eth_blockNumber',
      params: [],
      id: 1,
    });

    expect(result).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: '0x123456',
    });
  });

  it('should return error for unknown method', async () => {
    const result = await proxyRequest(NODE_URL, {
      jsonrpc: '2.0',
      method: 'foo_unknownMethod',
      params: [],
      id: 2,
    });

    expect(result).toHaveProperty('error');
    if (!Array.isArray(result)) {
      expect(result.error?.code).toBe(-32601);
    } else {
      throw new Error('Expected a single RpcResponse, but got an array.');
    }
  });
});
