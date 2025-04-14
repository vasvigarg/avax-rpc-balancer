#!/bin/bash

# Script to check or manage node health status
# Usage: ./health-check.sh [action] [nodeId]
# Actions: status, enable, disable

set -e

# Get API Gateway URL from environment or configuration
API_URL=${API_URL:-"http://localhost:3000"}

function usage() {
    echo "Usage: $0 [action] [nodeId]"
    echo "Actions:"
    echo "  status       - Get health status for all nodes"
    echo "  enable       - Enable a specific node"
    echo "  disable      - Disable a specific node"
    echo "Examples:"
    echo "  $0 status"
    echo "  $0 enable fuji-node1"
    echo "  $0 disable mainnet-node2"
    exit 1
}

# Check actions that require a node ID
if [[ "$1" == "enable" || "$1" == "disable" ]]; then
    if [ -z "$2" ]; then
        echo "Error: Node ID is required for $1 action"
        usage
    fi
    
    echo "Sending $1 request for node $2..."
    curl -s -X POST "${API_URL}/admin/nodes/$2/$1" | jq .
    exit 0
fi

# Status action
if [[ "$1" == "status" || -z "$1" ]]; then
    echo "Fetching health status..."
    curl -s "${API_URL}/health" | jq .
    exit 0
fi

# Unknown action
echo "Unknown action: $1"
usage