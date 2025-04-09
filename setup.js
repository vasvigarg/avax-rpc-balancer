const fs = require("fs");
const path = require("path");

const structure = {
  ".github": {
    workflows: {
      "test.yml": "",
      "deploy.yml": "",
    },
    ISSUE_TEMPLATE: {},
  },
  src: {
    lambda: {
      router: {
        "index.ts": "",
        "routes.ts": "",
        "handler.ts": "",
      },
      health: {
        "index.ts": "",
      },
    },
    config: {
      "nodeConfig.ts": "",
      "networkConfig.ts": "",
    },
    services: {
      "loadBalancer.ts": "",
      "rpcHandler.ts": "",
      "metrics.ts": "",
      "caching.ts": "",
    },
    utils: {
      "logger.ts": "",
      "validators.ts": "",
    },
  },
  nginx: {
    "conf.d": {
      "default.conf": "",
    },
    Dockerfile: "",
  },
  infrastructure: {
    terraform: {
      "main.tf": "",
      "variables.tf": "",
      "outputs.tf": "",
    },
    "docker-compose.yml": "",
  },
  tests: {
    unit: {},
    integration: {},
    load: {},
  },
  scripts: {
    "setup.sh": "",
    "deploy.sh": "",
  },
  docs: {
    "api.md": "",
    "architecture.md": "",
    "configuration.md": "",
  },
  ".gitignore": "",
  "tsconfig.json": "",
  "package.json": "",
  "README.md": "",
  LICENSE: "",
};

function createStructure(basePath, obj) {
  for (const [name, content] of Object.entries(obj)) {
    const fullPath = path.join(basePath, name);
    if (typeof content === "object") {
      fs.mkdirSync(fullPath, { recursive: true });
      createStructure(fullPath, content);
    } else {
      fs.writeFileSync(fullPath, content);
    }
  }
}

// Create project root
const projectRoot = path.join(__dirname, "avax-rpc-balancer");
fs.mkdirSync(projectRoot, { recursive: true });
createStructure(projectRoot, structure);

console.log("✅ Project structure created at:", projectRoot);
