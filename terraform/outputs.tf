output "ecr_repository_url" {
  description = "ECR repository URL for the API image."
  value       = aws_ecr_repository.api.repository_url
}

output "load_balancer_dns_name" {
  description = "Public DNS name for the API load balancer."
  value       = aws_lb.api.dns_name
}

output "dynamodb_table_name" {
  description = "DynamoDB table used by the API."
  value       = aws_dynamodb_table.app.name
}

output "uploads_bucket" {
  description = "S3 bucket reserved for future uploads."
  value       = aws_s3_bucket.uploads.bucket
}

