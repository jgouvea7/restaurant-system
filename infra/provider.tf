terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region     = var.region
  access_key = "test"
  secret_key = "test"

  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
  s3_use_path_style           = true

  endpoints {
    ec2         = var.endpoint
    rds         = var.endpoint
    elasticache = var.endpoint
    s3          = var.endpoint
    sns         = var.endpoint
    sqs         = var.endpoint
    sts         = var.endpoint
    elbv2       = var.endpoint
    autoscaling = var.endpoint
  }
}
