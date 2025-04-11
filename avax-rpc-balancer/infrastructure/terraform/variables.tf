variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "us-east-1" // Or your preferred region
}

variable "project_name" {
  description = "Base name for resources"
  type        = string
  default     = "avax-rpc-balancer"
}

variable "lambda_runtime" {
  description = "Lambda function runtime"
  type        = string
  default     = "nodejs18.x" // Match your Node.js version
}

variable "lambda_memory_size_router" {
  description = "Memory size for the router Lambda"
  type        = number
  default     = 256
}

variable "lambda_timeout_router" {
  description = "Timeout for the router Lambda in seconds"
  type        = number
  default     = 15 // API Gateway has a max timeout of 29s
}

variable "lambda_memory_size_health" {
  description = "Memory size for the health check Lambda"
  type        = number
  default     = 128
}

variable "lambda_timeout_health" {
  description = "Timeout for the health check Lambda in seconds"
  type        = number
  default     = 60 // Allow time for multiple node checks
}

variable "health_check_schedule" {
  description = "Schedule expression for health checks (e.g., rate(1 minute))"
  type        = string
  default     = "rate(1 minute)"
}

variable "node_urls_env_var" {
  description = "Comma-separated node URLs to pass as env var to Lambdas (use SSM/Secrets Manager in prod)"
  type        = string
  sensitive   = true // Mark as sensitive if URLs contain secrets
  default     = ""     // Example: "http://node1...,http://node2..."
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "dev"
}

# Add other variables