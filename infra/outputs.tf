output "app_url" {
  value = "http://localhost:8080"
}

output "asg_name" {
  value = aws_autoscaling_group.user.name
}

output "db_endpoint" {
  value = aws_db_instance.user.endpoint
}

output "redis_endpoint" {
  value = "${aws_elasticache_replication_group.redis.primary_endpoint_address}:${aws_elasticache_replication_group.redis.port}"
}

output "bucket" {
  value = aws_s3_bucket.uploads.bucket
}

output "sns_topic_arn" {
  value = aws_sns_topic.events.arn
}

output "sqs_queue_url" {
  value = aws_sqs_queue.events.url
}

output "sqs_queue_arn" {
  value = aws_sqs_queue.events.arn
}
