resource "aws_elasticache_subnet_group" "this" {
  name       = "nexa-${var.env}-redis"
  subnet_ids = var.private_subnet_ids

  tags = { Name = "nexa-${var.env}-redis-subnet-group" }
}

resource "aws_security_group" "redis" {
  name        = "nexa-${var.env}-redis"
  description = "ElastiCache Redis access"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [var.allowed_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "nexa-${var.env}-redis-sg" }
}

resource "aws_elasticache_cluster" "this" {
  cluster_id           = "nexa-${var.env}"
  engine               = "redis"
  engine_version       = var.engine_version
  node_type            = var.node_type
  num_cache_nodes      = var.num_cache_nodes
  parameter_group_name = "default.redis7"
  port                 = 6379

  subnet_group_name  = aws_elasticache_subnet_group.this.name
  security_group_ids = [aws_security_group.redis.id]

  tags = { Environment = var.env }
}
