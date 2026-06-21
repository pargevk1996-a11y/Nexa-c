data "aws_secretsmanager_secret_version" "db_password" {
  secret_id = var.db_password_secret_arn
}

resource "aws_db_subnet_group" "this" {
  name       = "nexa-${var.env}-rds"
  subnet_ids = var.private_subnet_ids

  tags = { Name = "nexa-${var.env}-rds-subnet-group" }
}

resource "aws_security_group" "rds" {
  name        = "nexa-${var.env}-rds"
  description = "RDS PostgreSQL access"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.allowed_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "nexa-${var.env}-rds-sg" }
}

resource "aws_db_parameter_group" "this" {
  name   = "nexa-${var.env}-pg16"
  family = "postgres16"

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  tags = { Environment = var.env }
}

resource "aws_db_instance" "this" {
  identifier        = "nexa-${var.env}"
  engine            = "postgres"
  engine_version    = var.engine_version
  instance_class    = var.instance_class
  allocated_storage = var.allocated_storage
  storage_encrypted = true
  multi_az          = var.multi_az

  db_name  = var.db_name
  username = var.db_username
  password = data.aws_secretsmanager_secret_version.db_password.secret_string

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  parameter_group_name   = aws_db_parameter_group.this.name

  backup_retention_period = 7
  deletion_protection     = var.env == "prod"
  skip_final_snapshot     = var.env != "prod"

  tags = { Environment = var.env }
}
