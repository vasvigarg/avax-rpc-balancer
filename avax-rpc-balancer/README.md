# Blockchain Load Balancer (avax-rpc-balancer)

Intelligent HTTPS Load Balancer for routing RPC traffic to blockchain nodes (e.g., Avalanche). Built with TypeScript, AWS Lambda, API Gateway, Nginx (for local dev), and Terraform.

## Features

* Load balancing (Round Robin, Random - extendable)
* Node health checking (basic RPC checks - extendable)
* Automatic failover from unhealthy nodes
* Deployed via AWS Lambda and API Gateway (HTTP API)
* Infrastructure managed by Terraform
* Local development environment using Docker Compose

## Project Structure
avax-rpc-balancer/
├── .github/                        # GitHub workflows and templates
│   ├── workflows/                  # CI/CD pipeline definitions
│   │   ├── test.yml                # Run tests on PRs
│   │   └── deploy.yml              # Deploy to AWS
│   └── ISSUE_TEMPLATE/             # Issue and PR templates
├── src/                            # TypeScript source code
│   ├── lambda/                     # AWS Lambda functions
│   │   ├── router/                 # Request routing logic
│   │   │   ├── index.ts            # Entry point
│   │   │   ├── routes.ts           # Route definitions
│   │   │   └── handler.ts          # Request handler
│   │   └── health/                 # Health check service
│   │       └── index.ts            # Node health monitoring
│   ├── config/                     # Configuration management
│   │   ├── nodeConfig.ts           # Node endpoint configuration
│   │   └── networkConfig.ts        # Network configuration
│   ├── services/                   # Core services
│   │   ├── loadBalancer.ts         # Load balancing algorithms
│   │   ├── rpcHandler.ts           # RPC request processing
│   │   ├── metrics.ts              # Performance metrics collection
│   │   └── caching.ts              # Response caching
│   └── utils/                      # Utility functions
│       ├── logger.ts               # Logging utilities
│       └── validators.ts           # Request validation
├── nginx/                          # Nginx configuration
│   ├── conf.d/                     # Config directory
│   │   └── default.conf            # Default server config
│   └── Dockerfile                  # Nginx Docker image
├── infrastructure/                 # IaC (Infrastructure as Code)
│   ├── terraform/                  # Terraform scripts for AWS
│   │   ├── main.tf                 # Main Terraform configuration
│   │   ├── variables.tf            # Variable definitions
│   │   └── outputs.tf              # Output definitions
│   └── docker-compose.yml          # Local development environment
├── tests/                          # Test files
│   ├── unit/                       # Unit tests
│   ├── integration/                # Integration tests
│   └── load/                       # Load/performance tests
├── scripts/                        # Utility scripts
│   ├── setup.sh                    # Environment setup
│   └── deploy.sh                   # Deployment script
├── docs/                           # Documentation
│   ├── api.md                      # API documentation
│   ├── architecture.md             # Architecture overview
│   └── configuration.md            # Configuration guide
├── .gitignore                      # Git ignore file
├── tsconfig.json                   # TypeScript configuration
├── package.json                    # Node.js dependencies
├── README.md                       # Project overview
└── LICENSE                         # License information

## Prerequisites

* Node.js (v18+) & npm/yarn
* Docker & Docker Compose
* AWS CLI (configured credentials)
* Terraform CLI (Optional, for deployment)
* Git

## Development Setup

1.  **Clone:** `git clone <repo-url>`
2.  **Install:** `cd avax-rpc-balancer && npm install` (or `yarn install`)
3.  **Configure Env:** Copy `env.example` to `.env` and fill in values (e.g., `AWS_REGION`, `NODE_URLS_TESTNET`).
4.  **Run Locally:** `npm run local:up`
5.  **Test Endpoint:** `curl http://localhost:8080/nginx_health` (or test your proxied service endpoint)

*(See `docs/setup-dev.md` for more details)*

## Testing

* **Lint/Format:** `npm run lint`, `npm run format`
* **Unit Tests:** `npm test`

## Deployment (AWS via Terraform)

1.  **Build Code:** `npm run build` (Compiles TS to JS in `dist/`)
2.  **Navigate to Infra:** `cd infrastructure/terraform`
3.  **Initialize:** `terraform init`
4.  **Plan:** `terraform plan` (Review changes)
5.  **Apply:** `terraform apply` (Deploy to AWS)

*(See `docs/deployment.md` for more details)*

## Architecture

*(See `docs/architecture.md`)*

## License

*(Specify your license, e.g., MIT - see `LICENSE` file)*