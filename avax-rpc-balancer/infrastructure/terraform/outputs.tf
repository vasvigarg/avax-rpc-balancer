output "api_endpoint" {
  description = "The invocation endpoint URL for the API Gateway stage"
  value       = aws_apigatewayv2_stage.default_stage.invoke_url
}

output "router_lambda_arn" {
  description = "ARN of the router Lambda function"
  value       = aws_lambda_function.router_lambda.arn
}

output "health_lambda_arn" {
  description = "ARN of the health check Lambda function"
  value       = aws_lambda_function.health_lambda.arn
}