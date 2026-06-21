terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  backend "s3" {
    bucket         = "nexa-terraform-state-prod"
    key            = "prod/terraform.tfstate"
    region         = "eu-west-1"
    dynamodb_table = "nexa-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
}

module "vpc" {
  source = "../../modules/vpc"

  env                  = "prod"
  vpc_cidr             = "10.0.0.0/16"
  azs                  = ["${var.aws_region}a", "${var.aws_region}b", "${var.aws_region}c"]
  public_subnet_cidrs  = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  private_subnet_cidrs = ["10.0.10.0/24", "10.0.11.0/24", "10.0.12.0/24"]
}

module "eks" {
  source = "../../modules/eks"

  env                 = "prod"
  vpc_id              = module.vpc.vpc_id
  private_subnet_ids  = module.vpc.private_subnet_ids
  public_subnet_ids   = module.vpc.public_subnet_ids
  k8s_version         = "1.30"
  node_instance_types = ["t3.large"]
  node_min_size       = 3
  node_max_size       = 20
  node_desired_size   = 5
}

module "rds" {
  source = "../../modules/rds"

  env                       = "prod"
  vpc_id                    = module.vpc.vpc_id
  private_subnet_ids        = module.vpc.private_subnet_ids
  allowed_security_group_id = module.vpc.internal_sg_id
  db_password_secret_arn    = var.db_password_secret_arn
  instance_class            = "db.t3.large"
  allocated_storage         = 100
  multi_az                  = true
}

module "redis" {
  source = "../../modules/redis"

  env                       = "prod"
  vpc_id                    = module.vpc.vpc_id
  private_subnet_ids        = module.vpc.private_subnet_ids
  allowed_security_group_id = module.vpc.internal_sg_id
  node_type                 = "cache.t3.small"
  num_cache_nodes           = 1
}

# ECR repositories for each service
locals {
  services = [
    "api-gateway", "auth-service", "chat-service", "user-service",
    "contact-service", "media-service", "notification-service",
    "ws-gateway", "presence-service", "call-service", "story-service",
    "emoji-service", "ai-service",
  ]
}

resource "aws_ecr_repository" "services" {
  for_each             = toset(local.services)
  name                 = "nexa/${each.key}"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = { Environment = "prod" }
}

resource "aws_ecr_lifecycle_policy" "services" {
  for_each   = aws_ecr_repository.services
  repository = each.value.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}
