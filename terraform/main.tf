locals {
  name            = "${var.project_name}-${var.environment}"
  task_subnet_ids = length(var.task_subnet_ids) > 0 ? var.task_subnet_ids : var.private_subnet_ids
  secret_arns     = compact([var.carsxe_api_key_secret_arn, var.cardocs_api_key_secret_arn])
  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_ecr_repository" "api" {
  name                 = local.name
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = local.tags
}

resource "aws_dynamodb_table" "app" {
  name         = local.name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = local.tags
}

resource "aws_s3_bucket" "uploads" {
  bucket = "${local.name}-uploads"
  tags   = local.tags
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket                  = aws_s3_bucket.uploads.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_cognito_user_pool" "mobile" {
  name = "${local.name}-mobile"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  username_configuration {
    case_sensitive = false
  }

  password_policy {
    minimum_length                   = 6
    require_lowercase                = false
    require_numbers                  = false
    require_symbols                  = false
    require_uppercase                = false
    temporary_password_validity_days = 7
  }

  schema {
    attribute_data_type = "String"
    mutable             = true
    name                = "email"
    required            = true
  }

  schema {
    attribute_data_type = "String"
    mutable             = true
    name                = "name"
    required            = false
  }

  lifecycle {
    ignore_changes = [schema]
  }

  tags = local.tags
}

resource "aws_cognito_user_pool_client" "mobile" {
  name         = "${local.name}-ios"
  user_pool_id = aws_cognito_user_pool.mobile.id

  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_ADMIN_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]

  prevent_user_existence_errors = "ENABLED"
  refresh_token_validity        = 30
  access_token_validity         = 24
  id_token_validity             = 24

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${local.name}"
  retention_in_days = 14
  tags              = local.tags
}

resource "aws_security_group" "alb" {
  name        = "${local.name}-alb"
  description = "Allow public HTTP traffic to CarDocs API"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    security_groups = [aws_security_group.api_gateway_vpc_link.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.tags
}

resource "aws_security_group" "api_gateway_vpc_link" {
  name        = "${local.name}-api-gateway-vpc-link"
  description = "Allow API Gateway VPC Link egress to the CarDocs API load balancer"
  vpc_id      = var.vpc_id

  egress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.tags
}

resource "aws_security_group" "api" {
  name        = "${local.name}-api"
  description = "Allow ALB traffic to CarDocs API tasks"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = var.app_port
    to_port         = var.app_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.tags
}

resource "aws_lb" "api" {
  name               = local.name
  internal           = true
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.private_subnet_ids
  tags               = local.tags
}

resource "aws_lb_target_group" "api" {
  name        = local.name
  port        = var.app_port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = var.vpc_id

  health_check {
    path                = "/v1/health"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = local.tags
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

resource "aws_apigatewayv2_vpc_link" "api" {
  name               = local.name
  security_group_ids = [aws_security_group.api_gateway_vpc_link.id]
  subnet_ids         = var.private_subnet_ids
  tags               = local.tags
}

resource "aws_apigatewayv2_api" "api" {
  name          = local.name
  protocol_type = "HTTP"
  tags          = local.tags
}

resource "aws_apigatewayv2_integration" "api" {
  api_id             = aws_apigatewayv2_api.api.id
  connection_id      = aws_apigatewayv2_vpc_link.api.id
  connection_type    = "VPC_LINK"
  integration_method = "ANY"
  integration_type   = "HTTP_PROXY"
  integration_uri    = aws_lb_listener.http.arn
}

resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true
  tags        = local.tags
}

data "aws_iam_policy_document" "ecs_task_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${local.name}-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role.json
  tags               = local.tags
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secrets" {
  count = length(local.secret_arns) == 0 ? 0 : 1
  name  = "${local.name}-execution-secrets"
  role  = aws_iam_role.execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = local.secret_arns
      }
    ]
  })
}

resource "aws_iam_role" "task" {
  name               = "${local.name}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role.json
  tags               = local.tags
}

resource "aws_iam_role_policy" "task_data_access" {
  name = "${local.name}-data-access"
  role = aws_iam_role.task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:DeleteItem",
          "dynamodb:PutItem",
          "dynamodb:Query",
          "dynamodb:TransactWriteItems",
          "dynamodb:UpdateItem"
        ]
        Resource = aws_dynamodb_table.app.arn
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "${aws_s3_bucket.uploads.arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "cognito-idp:AdminInitiateAuth",
          "cognito-idp:ConfirmSignUp",
          "cognito-idp:ResendConfirmationCode",
          "cognito-idp:SignUp"
        ]
        Resource = aws_cognito_user_pool.mobile.arn
      },
      {
        Effect = "Allow"
        Action = [
          "cognito-idp:GetUser",
          "cognito-idp:GlobalSignOut"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_ecs_cluster" "api" {
  name = local.name
  tags = local.tags
}

resource "aws_ecs_task_definition" "api" {
  family                   = local.name
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name      = "api"
      image     = var.container_image
      essential = true
      portMappings = [
        {
          containerPort = var.app_port
          hostPort      = var.app_port
          protocol      = "tcp"
        }
      ]
      environment = [
        {
          name  = "AWS_REGION"
          value = var.aws_region
        },
        {
          name  = "CARDOCS_DYNAMODB_TABLE"
          value = aws_dynamodb_table.app.name
        },
        {
          name  = "CARDOCS_UPLOADS_BUCKET"
          value = aws_s3_bucket.uploads.bucket
        },
        {
          name  = "CARDOCS_COGNITO_REGION"
          value = var.aws_region
        },
        {
          name  = "CARDOCS_COGNITO_USER_POOL_ID"
          value = aws_cognito_user_pool.mobile.id
        },
        {
          name  = "CARDOCS_COGNITO_APP_CLIENT_ID"
          value = aws_cognito_user_pool_client.mobile.id
        }
      ]
      secrets = concat(
        var.carsxe_api_key_secret_arn == "" ? [] : [
          {
            name      = "CARSXE_API_KEY"
            valueFrom = var.carsxe_api_key_secret_arn
          }
        ],
        var.cardocs_api_key_secret_arn == "" ? [] : [
          {
            name      = "CARDOCS_API_KEY"
            valueFrom = var.cardocs_api_key_secret_arn
          }
        ]
      )
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.api.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "api"
        }
      }
    }
  ])

  tags = local.tags
}

resource "aws_ecs_service" "api" {
  name            = local.name
  cluster         = aws_ecs_cluster.api.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = local.task_subnet_ids
    security_groups  = [aws_security_group.api.id]
    assign_public_ip = var.assign_public_ip
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = var.app_port
  }

  depends_on = [
    aws_lb_listener.http
  ]

  tags = local.tags
}
