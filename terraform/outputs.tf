output "ecr_repository_url" {
  description = "ECR repository URL for the API image."
  value       = aws_ecr_repository.api.repository_url
}

output "load_balancer_dns_name" {
  description = "Service load balancer DNS name used behind API Gateway."
  value       = aws_lb.api.dns_name
}

output "api_base_url" {
  description = "HTTPS base URL for the API."
  value       = trimsuffix(aws_apigatewayv2_stage.default.invoke_url, "/")
}

output "dynamodb_table_name" {
  description = "DynamoDB table used by the API."
  value       = aws_dynamodb_table.app.name
}

output "uploads_bucket" {
  description = "S3 bucket reserved for future uploads."
  value       = aws_s3_bucket.uploads.bucket
}

output "cognito_user_pool_id" {
  description = "Cognito User Pool ID used by the mobile app authentication flow."
  value       = aws_cognito_user_pool.mobile.id
}

output "cognito_app_client_id" {
  description = "Cognito app client ID used by the backend auth endpoints."
  value       = aws_cognito_user_pool_client.mobile.id
}
