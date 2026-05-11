variable "project_name" {
  description = "Project slug used to name AWS resources."
  type        = string
  default     = "cardocs"
}

variable "environment" {
  description = "Deployment environment."
  type        = string
  default     = "develop"
}

variable "aws_region" {
  description = "AWS region for deploy resources."
  type        = string
  default     = "us-east-1"
}

variable "vpc_id" {
  description = "Existing VPC id."
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnet ids for the load balancer."
  type        = list(string)
}

variable "private_subnet_ids" {
  description = "Private subnet ids for ECS tasks."
  type        = list(string)
}

variable "task_subnet_ids" {
  description = "Subnet ids for ECS tasks. Defaults to private_subnet_ids when empty."
  type        = list(string)
  default     = []
}

variable "assign_public_ip" {
  description = "Whether ECS tasks should receive public IPs. Keep false when task subnets have NAT or required VPC endpoints."
  type        = bool
  default     = false
}

variable "container_image" {
  description = "Container image URI published by CI."
  type        = string
}

variable "app_port" {
  description = "Container port exposed by the Spring Boot app."
  type        = number
  default     = 8080
}

variable "desired_count" {
  description = "Number of ECS tasks."
  type        = number
  default     = 1
}

variable "carsxe_api_key_secret_arn" {
  description = "Optional Secrets Manager ARN containing the CarsXE API key."
  type        = string
  default     = ""
}

variable "cardocs_api_key_secret_arn" {
  description = "Secrets Manager ARN containing the CarDocs API key required by protected endpoints."
  type        = string
  default     = ""
}

variable "allowed_cidr_blocks" {
  description = "CIDR blocks allowed to reach the public load balancer."
  type        = list(string)
  default     = []
}
