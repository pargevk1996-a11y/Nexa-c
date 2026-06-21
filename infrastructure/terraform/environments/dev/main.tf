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
    bucket         = "nexa-terraform-state-dev"
    key            = "dev/terraform.tfstate"
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

  env                  = "dev"
  vpc_cidr             = "10.1.0.0/16"
  azs                  = ["${var.aws_region}a", "${var.aws_region}b"]
  public_subnet_cidrs  = ["10.1.1.0/24", "10.1.2.0/24"]
  private_subnet_cidrs = ["10.1.10.0/24", "10.1.11.0/24"]
}

module "eks" {
  source = "../../modules/eks"

  env                 = "dev"
  vpc_id              = module.vpc.vpc_id
  private_subnet_ids  = module.vpc.private_subnet_ids
  public_subnet_ids   = module.vpc.public_subnet_ids
  k8s_version         = "1.30"
  node_instance_types = ["t3.medium"]
  node_min_size       = 1
  node_max_size       = 5
  node_desired_size   = 2
}

module "rds" {
  source = "../../modules/rds"

  env                       = "dev"
  vpc_id                    = module.vpc.vpc_id
  private_subnet_ids        = module.vpc.private_subnet_ids
  allowed_security_group_id = module.vpc.internal_sg_id
  db_password_secret_arn    = var.db_password_secret_arn
  instance_class            = "db.t3.micro"
  allocated_storage         = 20
  multi_az                  = false
}

module "redis" {
  source = "../../modules/redis"

  env                       = "dev"
  vpc_id                    = module.vpc.vpc_id
  private_subnet_ids        = module.vpc.private_subnet_ids
  allowed_security_group_id = module.vpc.internal_sg_id
  node_type                 = "cache.t3.micro"
  num_cache_nodes           = 1
}

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
  name                 = "nexa-dev/${each.key}"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = { Environment = "dev" }
}
