import { proxyRequest } from '../../src/services/rpcHandler';
import * as loadBalancer from '../../src/services/loadBalancer';
import * as caching from '../../src/services/caching';
import axios from 'axios';

jest.mock('axios');
jest.mock('../../src/services/loadBalancer');
jest.mock('../../src/services/caching');

const mockRequest = {
  jsonrpc: '2.0',
  method: 'eth_blockNumber',
  params: [],
  id: 1,
};

const mockResponse = {
  jsonrpc: '2.0',
  id: 1,
  result: '0x1234',
};

describe('rpcHandler - proxyRequest', () => {
  let cacheMock: { get: jest.Mock; set: jest.Mock; invalidateOnStateChange: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    cacheMock = {
      get: jest.fn().mockReturnValue(null),
      set: jest.fn(),
      invalidateOnStateChange: jest.fn(),
    };

    (caching.getCache as jest.Mock).mockReturnValue(cacheMock);
  });

  it('proxies a valid request and returns the response', async () => {
    (axios.post as jest.Mock).mockResolvedValue({ data: mockResponse });

    const result = await proxyRequest('http://mock-node', mockRequest, { nodeId: 'node-1' });

    expect(result).toEqual(mockResponse);
    expect(loadBalancer.recordSuccessfulRequest).toHaveBeenCalledWith('node-1');
    expect(cacheMock.set).toHaveBeenCalledWith(mockRequest, mockResponse);
  });

  it('returns cached response if available', async () => {
    cacheMock.get.mockReturnValue(mockResponse);

    const result = await proxyRequest('http://mock-node', mockRequest);
    expect(result).toEqual(mockResponse);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('retries on failure and succeeds on second attempt', async () => {
    (axios.post as jest.Mock)
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ data: mockResponse });

    const result = await proxyRequest('http://mock-node', mockRequest, {
      retries: 1,
      retryDelay: 0,
      nodeId: 'node-1',
    });

    expect(result).toEqual(mockResponse);
    expect(loadBalancer.recordSuccessfulRequest).toHaveBeenCalledWith('node-1');
    expect(loadBalancer.recordFailedRequest).not.toHaveBeenCalled();
  });

  it('records failure if all retries fail', async () => {
    (axios.post as jest.Mock).mockRejectedValue(new Error('connection refused'));

    const result = await proxyRequest('http://mock-node', mockRequest, {
      retries: 1,
      retryDelay: 0,
      nodeId: 'node-1',
    });

    expect(result).toHaveProperty('error');
    expect(loadBalancer.recordFailedRequest).toHaveBeenCalledWith('node-1');
  });

  it('handles batch requests', async () => {
    const batch = [
      { ...mockRequest, id: 1 },
      { ...mockRequest, id: 2 },
    ];
    const batchResponse = [
      { ...mockResponse, id: 1 },
      { ...mockResponse, id: 2 },
    ];

    (axios.post as jest.Mock).mockResolvedValue({ data: batchResponse });

    const result = await proxyRequest('http://mock-node', batch);
    expect(result).toEqual(batchResponse);
  });

  it('returns validation error for bad JSON-RPC request', async () => {
    const invalidRequest = {
      ...mockRequest,
      jsonrpc: '1.0',
    };

    const result = await proxyRequest('http://mock-node', invalidRequest);

    if (!Array.isArray(result)) {
      expect(result).toHaveProperty('error');
      expect(result.error?.code).toBe(-32600);
    } else {
      throw new Error('Expected a single RpcResponse, but got an array.');
    }
  });
});
