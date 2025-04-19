import { proxyRequest } from '../../src/services/rpcHandler';
import express from 'express';
import http from 'http';

let server: http.Server;
const PORT = 8547;
const NODE_URL = `http://localhost:${PORT}`;

beforeAll(done => {
  const app = express();
  app.use(express.json());
  app.post('/', (req, res) => {
    res.json({ jsonrpc: '2.0', id: req.body.id, result: '0x1234' });
  });
  server = app.listen(PORT, done);
});

afterAll(() => server.close());

describe('Benchmark - proxyRequest()', () => {
  it('should handle 100 sequential proxy calls under target time', async () => {
    const start = performance.now();

    for (let i = 0; i < 100; i++) {
      await proxyRequest(NODE_URL, {
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: i,
      });
    }

    const end = performance.now();
    const duration = end - start;

    console.log(`100 proxy requests took ${duration.toFixed(2)} ms`);
    expect(duration).toBeLessThan(500); // expect ~5ms avg
  });
});
