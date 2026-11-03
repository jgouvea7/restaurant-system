resource "aws_vpc" "main" {
  cidr_block = "10.20.0.0/16"

  tags = {
    Name = "main"
  }
}

resource "aws_subnet" "main" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.20.1.0/24"
  availability_zone = "${var.region}a"

  tags = {
    Name = "main-a"
  }
}

moved {
  from = aws_subnet.app_b
  to   = aws_subnet.secondary
}

resource "aws_subnet" "secondary" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.20.2.0/24"
  availability_zone = "${var.region}b"

  tags = {
    Name = "main-b"
  }
}

resource "aws_security_group" "alb" {
  name   = "alb"
  vpc_id = aws_vpc.main.id

  ingress {
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 8081
    to_port     = 8081
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 8082
    to_port     = 8082
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "alb"
  }
}

resource "aws_security_group" "app" {
  name   = "app"
  vpc_id = aws_vpc.main.id

  ingress {
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "app"
  }
}

resource "aws_db_subnet_group" "main" {
  name       = "db"
  subnet_ids = [aws_subnet.main.id, aws_subnet.secondary.id]

  tags = {
    Name = "db"
  }
}

resource "aws_db_instance" "user" {
  identifier        = "user-db"
  engine            = "postgres"
  engine_version    = "16"
  instance_class    = "db.t3.micro"
  allocated_storage = 20
  db_name           = "users"
  username          = "restaurant"
  password          = "restaurant1234"
  port              = 17001

  db_subnet_group_name = aws_db_subnet_group.main.name
  skip_final_snapshot  = true

  tags = {
    Name = "user-db"
  }
}

resource "aws_db_instance" "restaurant" {
  identifier        = "restaurant-db"
  engine            = "postgres"
  engine_version    = "16"
  instance_class    = "db.t3.micro"
  allocated_storage = 20
  db_name           = "restaurants"
  username          = "restaurant"
  password          = "restaurant1234"
  port              = 17002

  db_subnet_group_name = aws_db_subnet_group.main.name
  skip_final_snapshot  = true

  tags = {
    Name = "restaurant-db"
  }
}

resource "aws_db_instance" "payment" {
  identifier        = "payment-db"
  engine            = "postgres"
  engine_version    = "16"
  instance_class    = "db.t3.micro"
  allocated_storage = 20
  db_name           = "payments"
  username          = "restaurant"
  password          = "restaurant1234"
  port              = 17003

  db_subnet_group_name = aws_db_subnet_group.main.name
  skip_final_snapshot  = true

  tags = {
    Name = "payment-db"
  }
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id    = "cache"
  description             = "cache"
  engine                  = "redis"
  engine_version          = "7.1"
  node_type               = "cache.t4g.micro"
  num_node_groups         = 1
  replicas_per_node_group = 0
  port                    = 16379
  parameter_group_name    = "default.redis7"
  apply_immediately       = true

  tags = {
    Name = "cache"
  }
}

resource "aws_s3_bucket" "uploads" {
  bucket = "uploads"

  tags = {
    Name = "uploads"
  }
}

resource "aws_sns_topic" "events" {
  name = "events"

  tags = {
    Name = "events"
  }
}

resource "aws_sqs_queue" "restaurant_events" {
  name = "restaurant-events"

  tags = {
    Name = "restaurant-events"
  }
}

resource "aws_sqs_queue" "payment_events" {
  name = "payment-events"

  tags = {
    Name = "payment-events"
  }
}

data "aws_iam_policy_document" "restaurant_events_queue" {
  statement {
    sid    = "AllowSNSPublish"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["sns.amazonaws.com"]
    }

    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.restaurant_events.arn]

    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [aws_sns_topic.events.arn]
    }
  }
}

data "aws_iam_policy_document" "payment_events_queue" {
  statement {
    sid    = "AllowSNSPublish"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["sns.amazonaws.com"]
    }

    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.payment_events.arn]

    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [aws_sns_topic.events.arn]
    }
  }
}

resource "aws_sqs_queue_policy" "restaurant_events" {
  queue_url = aws_sqs_queue.restaurant_events.id
  policy    = data.aws_iam_policy_document.restaurant_events_queue.json
}

resource "aws_sqs_queue_policy" "payment_events" {
  queue_url = aws_sqs_queue.payment_events.id
  policy    = data.aws_iam_policy_document.payment_events_queue.json
}

resource "aws_sns_topic_subscription" "restaurant_events" {
  topic_arn            = aws_sns_topic.events.arn
  protocol             = "sqs"
  endpoint             = aws_sqs_queue.restaurant_events.arn
  raw_message_delivery = true

  filter_policy = jsonencode({
    eventType = ["payment.approved", "payment.rejected"]
  })
}

resource "aws_sns_topic_subscription" "payment_events" {
  topic_arn            = aws_sns_topic.events.arn
  protocol             = "sqs"
  endpoint             = aws_sqs_queue.payment_events.arn
  raw_message_delivery = true

  filter_policy = jsonencode({
    eventType = ["order.created"]
  })
}

resource "aws_launch_template" "user" {
  name                   = "user"
  image_id               = "ami-0abc1234567890def"
  instance_type          = "t3.micro"
  vpc_security_group_ids = [aws_security_group.app.id]

  tag_specifications {
    resource_type = "instance"

    tags = {
      Name = "user"
    }
  }
}

resource "aws_lb_target_group" "user" {
  name        = "user"
  port        = 3000
  protocol    = "HTTP"
  target_type = "instance"
  vpc_id      = aws_vpc.main.id

  health_check {
    enabled             = true
    path                = "/"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }

  tags = {
    Name = "user"
  }
}

resource "aws_lb" "user" {
  name               = "user"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = [aws_subnet.main.id, aws_subnet.secondary.id]

  tags = {
    Name = "user"
  }
}

resource "aws_lb_listener" "user" {
  load_balancer_arn = aws_lb.user.arn
  port              = 8080
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.user.arn
  }
}

resource "aws_autoscaling_group" "user" {
  name                      = "user"
  min_size                  = 1
  max_size                  = 5
  desired_capacity          = 3
  vpc_zone_identifier       = [aws_subnet.main.id, aws_subnet.secondary.id]
  target_group_arns         = [aws_lb_target_group.user.arn]
  health_check_type         = "ELB"
  wait_for_capacity_timeout = "0"

  launch_template {
    id      = aws_launch_template.user.id
    version = tostring(aws_launch_template.user.latest_version)
  }

  tag {
    key                 = "Name"
    value               = "user"
    propagate_at_launch = true
  }

  depends_on = [
    aws_db_instance.user,
    aws_elasticache_replication_group.redis,
    aws_s3_bucket.uploads,
    aws_sns_topic.events,
    aws_lb_listener.user,
  ]
}

resource "aws_launch_template" "restaurant" {
  name                   = "restaurant"
  image_id               = "ami-0fedcba9876543210"
  instance_type          = "t3.micro"
  vpc_security_group_ids = [aws_security_group.app.id]

  tag_specifications {
    resource_type = "instance"

    tags = {
      Name = "restaurant"
    }
  }
}

resource "aws_lb_target_group" "restaurant" {
  name        = "restaurant"
  port        = 3000
  protocol    = "HTTP"
  target_type = "instance"
  vpc_id      = aws_vpc.main.id

  health_check {
    enabled             = true
    path                = "/"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }

  tags = {
    Name = "restaurant"
  }
}

resource "aws_lb" "restaurant" {
  name               = "restaurant"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = [aws_subnet.main.id, aws_subnet.secondary.id]

  tags = {
    Name = "restaurant"
  }
}

resource "aws_lb_listener" "restaurant" {
  load_balancer_arn = aws_lb.restaurant.arn
  port              = 8081
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.restaurant.arn
  }
}

resource "aws_autoscaling_group" "restaurant" {
  name                      = "restaurant"
  min_size                  = 1
  max_size                  = 5
  desired_capacity          = 3
  vpc_zone_identifier       = [aws_subnet.main.id, aws_subnet.secondary.id]
  target_group_arns         = [aws_lb_target_group.restaurant.arn]
  health_check_type         = "ELB"
  wait_for_capacity_timeout = "0"

  launch_template {
    id      = aws_launch_template.restaurant.id
    version = tostring(aws_launch_template.restaurant.latest_version)
  }

  tag {
    key                 = "Name"
    value               = "restaurant"
    propagate_at_launch = true
  }

  depends_on = [
    aws_db_instance.restaurant,
    aws_elasticache_replication_group.redis,
    aws_s3_bucket.uploads,
    aws_sns_topic.events,
    aws_sqs_queue.restaurant_events,
    aws_lb_listener.restaurant,
  ]
}

resource "aws_launch_template" "payment" {
  name                   = "payment"
  image_id               = "ami-0a1b2c3d4e5f67890"
  instance_type          = "t3.micro"
  vpc_security_group_ids = [aws_security_group.app.id]

  tag_specifications {
    resource_type = "instance"

    tags = {
      Name = "payment"
    }
  }
}

resource "aws_lb_target_group" "payment" {
  name        = "payment"
  port        = 3000
  protocol    = "HTTP"
  target_type = "instance"
  vpc_id      = aws_vpc.main.id

  health_check {
    enabled             = true
    path                = "/"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }

  tags = {
    Name = "payment"
  }
}

resource "aws_lb" "payment" {
  name               = "payment"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = [aws_subnet.main.id, aws_subnet.secondary.id]

  tags = {
    Name = "payment"
  }
}

resource "aws_lb_listener" "payment" {
  load_balancer_arn = aws_lb.payment.arn
  port              = 8082
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.payment.arn
  }
}

resource "aws_autoscaling_group" "payment" {
  name                      = "payment"
  min_size                  = 1
  max_size                  = 5
  desired_capacity          = 3
  vpc_zone_identifier       = [aws_subnet.main.id, aws_subnet.secondary.id]
  target_group_arns         = [aws_lb_target_group.payment.arn]
  health_check_type         = "ELB"
  wait_for_capacity_timeout = "0"

  launch_template {
    id      = aws_launch_template.payment.id
    version = tostring(aws_launch_template.payment.latest_version)
  }

  tag {
    key                 = "Name"
    value               = "payment"
    propagate_at_launch = true
  }

  depends_on = [
    aws_db_instance.payment,
    aws_s3_bucket.uploads,
    aws_sns_topic.events,
    aws_sqs_queue.payment_events,
    aws_lb_listener.payment,
  ]
}
