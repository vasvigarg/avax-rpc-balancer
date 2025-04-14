## Health Checking System

The RPC Balancer includes a comprehensive health checking system that monitors the availability and performance of backend nodes.

### Configuration

Health check configuration can be set through environment variables:

| Environment Variable | Description | Default Value |
|---------------------|-------------|--------------|
| `HEALTH_CHECK_INTERVAL` | Frequency of health checks in milliseconds | 10000 (10s) |
| `HEALTH_CHECK_TIMEOUT` | Timeout for health check requests in milliseconds | 2000 (2s) |
| `HEALTH_RECOVERY_INTERVAL` | Frequency of recovery attempts for unhealthy nodes | 60000 (1m) |
| `HEALTH_CHECK_ENDPOINT` | Endpoint path to check for node health | `/` |
| `HEALTH_FAILURE_THRESHOLD` | Consecutive failures before marking node unhealthy | 3 |
| `HEALTH_SUCCESS_THRESHOLD` | Consecutive successes before marking node healthy | 2 |

### Health Scoring

Nodes are assigned a health score from 0-100 based on:

- **Success Rate (50%)**: Percentage of successful health checks
- **Response Time (50%)**: How the node's response time compares to the average

### API Endpoints

The following endpoints are available for monitoring node health:

- `GET /health` - Returns the complete health status of all nodes
- `POST /admin/nodes/{nodeId}/enable` - Manually enable a specific node
- `POST /admin/nodes/{nodeId}/disable` - Manually disable a specific node

### Load Balancing Integration

The load balancer can use the `health-based` strategy to route requests to the healthiest nodes first. This is the default strategy and provides optimal reliability and performance.