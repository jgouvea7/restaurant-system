output "user_url" {
  value = "http://localhost:8080"
}

output "restaurant_url" {
  value = "http://localhost:8081"
}

output "user_asg_name" {
  value = aws_autoscaling_group.user.name
}

output "restaurant_asg_name" {
  value = aws_autoscaling_group.restaurant.name
}

output "user_db_endpoint" {
  value = aws_db_instance.user.endpoint
}

output "restaurant_db_endpoint" {
  value = aws_db_instance.restaurant.endpoint
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
