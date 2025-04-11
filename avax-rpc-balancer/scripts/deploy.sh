#!/bin/bash
# scripts/deploy.sh

# Parse arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --env=*) ENV="${1#*=}" ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

# Default to dev if not specified
ENV=${ENV:-dev}
echo "Deploying to ${ENV} environment"

# Use environment-specific function name
FUNCTION_NAME="avax-rpc-balancer-router-${ENV}"

# Build with environment flag
NODE_ENV=${ENV} npm run build

# Package and deploy
mkdir -p dist/lambda-deploy
cp -r dist/src/lambda/* dist/lambda-deploy/
cp package.json dist/lambda-deploy/
cp src/config/environments/${ENV}.json dist/lambda-deploy/config.json
cd dist/lambda-deploy
npm ci --production

# Deploy with AWS CLI
aws lambda update-function-code \
  --function-name ${FUNCTION_NAME} \
  --zip-file fileb://<(cd . && zip -r - .)