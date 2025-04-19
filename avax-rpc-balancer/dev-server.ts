import express from 'express';
import { proxyRequest } from './src/services/rpcHandler';
import { getBestNodeAdapter, initializeNodesForNetwork } from './src/services/nodeService';
import { NetworkType } from './src/services/blockchainNetworkManager';
import { getHealthChecker } from './src/services/healthChecker';

const app = express();
const PORT = 8547;

app.use(express.json());

// Initialize nodes before starting the server
async function initializeServer() {
  console.log('Initializing nodes for Avalanche Fuji network...');

  // Initialize nodes for Avalanche Fuji testnet
  const initialized = await initializeNodesForNetwork('avalanche-fuji' as NetworkType);

  if (!initialized) {
    console.error('Failed to initialize nodes for Avalanche Fuji network');
    process.exit(1);
  }

  // ✅ Force mark node as healthy (useful in dev/testing scenarios)
  const healthChecker = getHealthChecker();
  const forced = healthChecker.forceUpdateHealth('fuji-1', true);
  if (forced) {
    console.log('✅ Node fuji-1 was manually marked healthy');
  } else {
    console.warn('⚠️  Could not force-update health for node fuji-1 (not found?)');
  }

  console.log('Nodes initialized successfully!');

  // Start the server after initialization
  app.listen(PORT, () => {
    console.log(`RPC Balancer dev server listening at http://localhost:${PORT}`);
  });
}

// Optional GET route for basic health check
app.get('/', (_req, res) => {
  res.send('AVAX RPC Balancer is running');
});

// JSON-RPC proxy POST handler
app.post('/', async (req, res) => {
  try {
    const adapter = getBestNodeAdapter('avalanche-fuji' as NetworkType);

    if (!adapter) {
      return res
        .status(503)
        .json({ error: 'No healthy node available for Avalanche Fuji testnet' });
    }

    const response = await proxyRequest(adapter.url, req.body, {
      nodeId: adapter.nodeId,
      skipCache: true,
    });

    return res.json(response);
  } catch (err: any) {
    console.error('Proxy error:', err);
    return res.status(500).json({
      error: 'Proxy request failed',
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

// Start everything
initializeServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
