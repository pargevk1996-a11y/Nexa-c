variable "aws_region" {
  type    = string
  default = "eu-west-1"
}

variable "db_password_secret_arn" {
  type        = string
  description = "ARN of Secrets Manager secret with the RDS master password"
}
