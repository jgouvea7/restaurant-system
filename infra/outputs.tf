output "user_url" {
  value = "http://localhost:8080"
}

output "restaurant_url" {
  value = "http://localhost:8081"
}

output "payment_url" {
  value = "http://localhost:8082"
}

output "user_asg_name" {
  value = aws_autoscaling_group.user.name
}

output "restaurant_asg_name" {
  value = aws_autoscaling_group.restaurant.name
}

output "payment_asg_name" {
  value = aws_autoscaling_group.payment.name
}

output "user_db_endpoint" {
  value = aws_db_instance.user.endpoint
}

output "restaurant_db_endpoint" {
  value = aws_db_instance.restaurant.endpoint
}

output "payment_db_endpoint" {
  value = aws_db_instance.payment.endpoint
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

output "restaurant_sqs_queue_url" {
  value = aws_sqs_queue.restaurant_events.url
}

output "restaurant_sqs_queue_arn" {
  value = aws_sqs_queue.restaurant_events.arn
}

output "payment_sqs_queue_url" {
  value = aws_sqs_queue.payment_events.url
}

output "payment_sqs_queue_arn" {
  value = aws_sqs_queue.payment_events.arn
}
