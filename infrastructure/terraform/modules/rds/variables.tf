variable "env" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "allowed_security_group_id" {
  type        = string
  description = "SG that can connect (EKS internal SG)"
}

variable "db_name" {
  type    = string
  default = "securechat"
}

variable "db_username" {
  type    = string
  default = "securechat"
}

variable "db_password_secret_arn" {
  type        = string
  description = "AWS Secrets Manager ARN containing the master password"
}

variable "instance_class" {
  type    = string
  default = "db.t3.medium"
}

variable "allocated_storage" {
  type    = number
  default = 20
}

variable "engine_version" {
  type    = string
  default = "16.3"
}

variable "multi_az" {
  type    = bool
  default = false
}
