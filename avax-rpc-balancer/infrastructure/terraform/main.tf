terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# --- IAM Role for Lambda ---
resource "aws_iam_role" "lambda_exec_role" {
  name = "${var.project_name}-lambda-exec-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })

  # Attach basic execution role + permissions needed (e.g., VPC access, DynamoDB access)
  managed_policy_arns = [
    "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
    # Add other policies if needed, e.g.: "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
  ]

  # Add inline policy for specific permissions if necessary
  # inline_policy { ... }
}

# --- Packaging Lambda Code (Assumes code built to dist/lambda/*) ---
data "archive_file" "router_lambda_zip" {
  type        = "zip"
  source_dir  = "../../dist/lambda/router" # Path relative to terraform dir
  output_path = "../../dist/router_lambda.zip"
}

data "archive_file" "health_lambda_zip" {
  type        = "zip"
  source_dir  = "../../dist/lambda/health" # Path relative to terraform dir
  output_path = "../../dist/health_lambda.zip"
}

# --- Router Lambda Function ---
resource "aws_lambda_function" "router_lambda" {
  function_name = "${var.project_name}-router"
  role          = aws_iam_role.lambda_exec_role.arn
  handler       = "handler.handleRpcRequest" # Check your exported handler name
  runtime       = var.lambda_runtime
  memory_size   = var.lambda_memory_size_router
  timeout       = var.lambda_timeout_router

  filename         = data.archive_file.router_lambda_zip.output_path
  source_code_hash = data.archive_file.router_lambda_zip.output_base64sha256

  environment {
    variables = {
      NODE_URLS = var.node_urls_env_var // Pass node URLs (use better method in prod)
      LOG_LEVEL = "INFO"
      // Add other env vars
    }
  }

  # Add VPC config if Lambda needs to access resources in a VPC
  # vpc_config { ... }
}

# --- Health Check Lambda Function ---
resource "aws_lambda_function" "health_lambda" {
  function_name = "${var.project_name}-health"
  role          = aws_iam_role.lambda_exec_role.arn
  handler       = "index.monitorNodeHealth" # Check your exported handler name
  runtime       = var.lambda_runtime
  memory_size   = var.lambda_memory_size_health
  timeout       = var.lambda_timeout_health

  filename         = data.archive_file.health_lambda_zip.output_path
  source_code_hash = data.archive_file.health_lambda_zip.output_base64sha256

  environment {
    variables = {
      NODE_URLS = var.node_urls_env_var
      LOG_LEVEL = "INFO"
      // Add other env vars
    }
  }
}

# --- API Gateway (HTTP API - Simpler/Cheaper) ---
resource "aws_apigatewayv2_api" "http_api" {
  name          = "${var.project_name}-http-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "lambda_router_integration" {
  api_id           = aws_apigatewayv2_api.http_api.id
  integration_type = "AWS_PROXY"
  # integration_uri     = aws_lambda_function.router_lambda.arn # Incorrect for v2
  integration_uri    = aws_lambda_function.router_lambda.invoke_arn
  payload_format_version = "2.0" # Matches Lambda event type used
}

resource "aws_apigatewayv2_route" "post_route" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "POST /" # Assuming requests come to the root path
  target    = "integrations/${aws_apigatewayv2_integration.lambda_router_integration.id}"
}

resource "aws_apigatewayv2_stage" "default_stage" {
  api_id = aws_apigatewayv2_api.http_api.id
  name   = "$default" # Default stage
  auto_deploy = true

  # Optional: Configure logging, throttling, etc.
  # access_log_settings { ... }
  # default_route_settings { ... }
}

# --- Permission for API Gateway to invoke Lambda ---
resource "aws_lambda_permission" "api_gw_permission" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.router_lambda.function_name
  principal     = "apigateway.amazonaws.com"

  # Restrict source ARN to the specific API Gateway instance/route
  source_arn = "${aws_apigatewayv2_api.http_api.execution_arn}/*/${aws_apigatewayv2_route.post_route.route_key}"
}

# --- EventBridge Rule for Scheduled Health Checks ---
resource "aws_cloudwatch_event_rule" "health_check_schedule" {
  name                = "${var.project_name}-health-check-schedule"
  description         = "Triggers health check Lambda periodically"
  schedule_expression = var.health_check_schedule
}

resource "aws_cloudwatch_event_target" "lambda_health_target" {
  rule      = aws_cloudwatch_event_rule.health_check_schedule.name
  arn       = aws_lambda_function.health_lambda.arn
  # You can add input transformer if needed
}

resource "aws_lambda_permission" "eventbridge_permission" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.health_lambda.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.health_check_schedule.arn
}