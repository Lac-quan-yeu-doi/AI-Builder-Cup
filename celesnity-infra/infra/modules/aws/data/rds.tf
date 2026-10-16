########################################
# RDS PostgreSQL
#
# Backs the Iceberg JDBC catalog (iceberg_tables and
# iceberg_namespace_properties) plus the celesnity_app schema, replacing the
# postgres service from the local Compose stack.
#
# The schema itself is created by the platform module's bootstrap Job: RDS has no
# equivalent of docker-entrypoint-initdb.d.
########################################

# A DB subnet group requires subnets in at least two AZs even for a Single-AZ
# instance. The instance is pinned to one AZ by database_availability_zone.
resource "aws_db_subnet_group" "this" {
  name       = "${var.name}-postgres"
  subnet_ids = var.private_subnet_ids

  tags = { Name = "${var.name}-postgres" }
}

resource "aws_security_group" "database" {
  name        = "${var.name}-postgres"
  description = "PostgreSQL access from the EKS cluster only"
  vpc_id      = var.vpc_id

  tags = { Name = "${var.name}-postgres" }
}

# Sourced from the EKS-managed cluster security group, which every node carries.
# There is no path from the internet: the instance is not publicly accessible and
# sits in a private subnet.
resource "aws_vpc_security_group_ingress_rule" "database_from_cluster" {
  security_group_id            = aws_security_group.database.id
  description                  = "PostgreSQL from EKS nodes and pods"
  referenced_security_group_id = var.cluster_security_group_id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}

resource "aws_db_instance" "this" {
  identifier = "${var.name}-postgres"

  engine         = "postgres"
  engine_version = var.db_engine_version
  instance_class = var.db_instance_class

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = 0 # Storage autoscaling off: growth should be a decision.
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.db_username

  # RDS creates and rotates the master password in Secrets Manager, so no
  # password is ever written to a variable or tfvars file.
  manage_master_user_password = true

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.database.id]
  availability_zone      = var.db_multi_az ? null : var.database_availability_zone
  multi_az               = var.db_multi_az
  publicly_accessible    = false

  backup_retention_period = var.db_backup_retention_days
  copy_tags_to_snapshot   = true

  auto_minor_version_upgrade = true
  apply_immediately          = true

  # Performance Insights and Enhanced Monitoring are both billable and off.
  performance_insights_enabled = false
  monitoring_interval          = 0

  deletion_protection       = var.db_deletion_protection
  skip_final_snapshot       = var.db_skip_final_snapshot
  final_snapshot_identifier = var.db_skip_final_snapshot ? null : "${var.name}-postgres-final"

  tags = { Name = "${var.name}-postgres" }
}
