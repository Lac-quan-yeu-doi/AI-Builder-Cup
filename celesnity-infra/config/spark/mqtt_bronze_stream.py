"""Warm Redpanda-to-Iceberg MQTT Bronze stream.

One deployment owns a capacity-bounded set of tenants. Every micro-batch is
split by validated tenant storage key and appended to that tenant's only MQTT
Bronze table. A deployment placement reconciler must guarantee that two Spark
deployments do not concurrently own the same tenant.
"""

from __future__ import annotations

import os
import re

from pyspark.sql import DataFrame, SparkSession
from pyspark.sql.functions import col, coalesce, from_json, get_json_object, lit
from pyspark.sql.types import (
    BooleanType,
    IntegerType,
    StringType,
    StructField,
    StructType,
    TimestampType,
)

CATALOG = os.environ.get("ICEBERG_CATALOG", "celesnity")
RAW_TOPIC = os.environ.get("REDPANDA_RAW_TOPIC", "celesnity.mqtt.raw.shared-0.v1")
TENANT_KEY = re.compile(r"^tnt_[a-z0-9]{12,48}$")
ADAPTER_KEY = re.compile(r"^adp_[a-z0-9]{12,48}$")

ENVELOPE = StructType(
    [
        StructField("tenantId", StringType(), False),
        StructField("adapterId", StringType(), False),
        StructField("deviceId", StringType(), False),
        StructField("eventId", StringType(), False),
        StructField("sourceEventId", StringType(), True),
        StructField("eventTime", TimestampType(), True),
        StructField("receivedAt", TimestampType(), False),
        StructField("mqttTopic", StringType(), False),
        StructField("mqttQos", IntegerType(), False),
        StructField("mqttRetained", BooleanType(), False),
        StructField("mqttDuplicate", BooleanType(), False),
        StructField("schemaVersion", IntegerType(), False),
    ]
)


def build_session() -> SparkSession:
    host = os.environ["POSTGRES_HOST"]
    port = os.environ.get("POSTGRES_PORT", "5432")
    database = os.environ["POSTGRES_DB"]
    sslmode = os.environ.get("POSTGRES_SSLMODE", "require")
    warehouse = os.environ["WAREHOUSE_PATH"].rstrip("/")
    scheme = warehouse.partition(":")[0].lower()
    file_io = {
        "gs": "org.apache.iceberg.gcp.gcs.GCSFileIO",
        "s3": "org.apache.iceberg.aws.s3.S3FileIO",
        "s3a": "org.apache.iceberg.aws.s3.S3FileIO",
    }.get(scheme)
    if file_io is None:
        raise ValueError(f"Unsupported WAREHOUSE_PATH scheme: {warehouse!r}")

    builder = (
        SparkSession.builder.appName(os.environ.get("STREAMING_DEPLOYMENT_ID", "mqtt-shared-0"))
        .config(
            "spark.sql.extensions",
            "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions",
        )
        .config(f"spark.sql.catalog.{CATALOG}", "org.apache.iceberg.spark.SparkCatalog")
        .config(
            f"spark.sql.catalog.{CATALOG}.catalog-impl",
            "org.apache.iceberg.jdbc.JdbcCatalog",
        )
        .config(
            f"spark.sql.catalog.{CATALOG}.uri",
            f"jdbc:postgresql://{host}:{port}/{database}?sslmode={sslmode}",
        )
        .config(f"spark.sql.catalog.{CATALOG}.jdbc.user", os.environ["POSTGRES_USER"])
        .config(f"spark.sql.catalog.{CATALOG}.jdbc.password", os.environ["POSTGRES_PASSWORD"])
        .config(f"spark.sql.catalog.{CATALOG}.warehouse", warehouse)
        .config(f"spark.sql.catalog.{CATALOG}.io-impl", file_io)
        .config(f"spark.sql.catalog.{CATALOG}.jdbc.schema-version", "V1")
    )
    if scheme in {"s3", "s3a"} and os.environ.get("AWS_ENDPOINT_URL"):
        builder = (
            builder.config(
                f"spark.sql.catalog.{CATALOG}.s3.endpoint", os.environ["AWS_ENDPOINT_URL"]
            )
            .config(f"spark.sql.catalog.{CATALOG}.s3.path-style-access", "true")
            .config(f"spark.sql.catalog.{CATALOG}.s3.region", os.environ["AWS_REGION"])
            .config(
                f"spark.sql.catalog.{CATALOG}.s3.access-key-id",
                os.environ["AWS_ACCESS_KEY_ID"],
            )
            .config(
                f"spark.sql.catalog.{CATALOG}.s3.secret-access-key",
                os.environ["AWS_SECRET_ACCESS_KEY"],
            )
        )
    if os.environ.get("SPARK_DRIVER_HOST"):
        builder = builder.config("spark.driver.host", os.environ["SPARK_DRIVER_HOST"])
    return builder.getOrCreate()


def kafka_options() -> dict[str, str]:
    username = os.environ["REDPANDA_USERNAME"]
    password = os.environ["REDPANDA_PASSWORD"]
    protocol = os.environ.get("REDPANDA_SECURITY_PROTOCOL", "SASL_PLAINTEXT")
    mechanism = os.environ.get("REDPANDA_SASL_MECHANISM", "SCRAM-SHA-256")
    jaas = (
        "org.apache.kafka.common.security.scram.ScramLoginModule required "
        f'username="{username}" password="{password}";'
    )
    options = {
        "kafka.bootstrap.servers": os.environ["REDPANDA_BOOTSTRAP_SERVERS"],
        "subscribe": RAW_TOPIC,
        "startingOffsets": os.environ.get("REDPANDA_STARTING_OFFSETS", "latest"),
        "failOnDataLoss": os.environ.get("REDPANDA_FAIL_ON_DATA_LOSS", "true"),
        "kafka.security.protocol": protocol,
        "kafka.sasl.mechanism": mechanism,
        "kafka.sasl.jaas.config": jaas,
        "maxOffsetsPerTrigger": os.environ.get("STREAMING_MAX_OFFSETS_PER_TRIGGER", "250000"),
    }
    if protocol.endswith("SSL"):
        ca_certificate = os.environ.get("REDPANDA_CA_CERT", "")
        if not ca_certificate:
            raise RuntimeError("REDPANDA_CA_CERT is required when Redpanda TLS is enabled")
        options.update(
            {
                "kafka.ssl.truststore.type": "PEM",
                "kafka.ssl.truststore.certificates": ca_certificate,
            }
        )
    return options


def checkpoint_location() -> str:
    configured = os.environ.get("STREAMING_CHECKPOINT_LOCATION")
    if configured:
        return configured
    scheme = os.environ["WAREHOUSE_PATH"].partition(":")[0]
    bucket = os.environ["ARTIFACTS_BUCKET"]
    deployment = os.environ.get("STREAMING_DEPLOYMENT_ID", "shared-0")
    return f"{scheme}://{bucket}/_platform/checkpoints/mqtt/{deployment}"


def ensure_table(spark: SparkSession, tenant: str) -> str:
    namespace = f"{tenant}_bronze"
    table = f"{CATALOG}.{namespace}.mqtt_events"
    location = f"{os.environ['WAREHOUSE_PATH'].rstrip('/')}/{tenant}/bronze/mqtt_events"
    spark.sql(f"CREATE NAMESPACE IF NOT EXISTS {CATALOG}.{namespace}")
    spark.sql(
        f"""
        CREATE TABLE IF NOT EXISTS {table} (
          tenant_id STRING NOT NULL,
          adapter_id STRING NOT NULL,
          device_id STRING NOT NULL,
          event_id STRING NOT NULL,
          source_event_id STRING,
          event_time TIMESTAMP,
          received_at TIMESTAMP NOT NULL,
          mqtt_topic STRING NOT NULL,
          mqtt_qos INT NOT NULL,
          mqtt_retained BOOLEAN NOT NULL,
          mqtt_duplicate BOOLEAN NOT NULL,
          schema_version INT NOT NULL,
          payload_json STRING,
          redpanda_topic STRING NOT NULL,
          redpanda_partition INT NOT NULL,
          redpanda_offset BIGINT NOT NULL,
          ingested_at TIMESTAMP NOT NULL
        ) USING iceberg
        PARTITIONED BY (days(received_at), bucket(32, adapter_id))
        LOCATION '{location}'
        TBLPROPERTIES (
          'format-version'='2',
          'write.target-file-size-bytes'='268435456'
        )
        """
    )
    return table


def write_batch(batch: DataFrame, batch_id: int) -> None:
    del batch_id
    spark = batch.sparkSession
    valid = batch.filter(col("is_valid")).selectExpr(
        "tenantId AS tenant_id",
        "adapterId AS adapter_id",
        "deviceId AS device_id",
        "eventId AS event_id",
        "sourceEventId AS source_event_id",
        "eventTime AS event_time",
        "receivedAt AS received_at",
        "mqttTopic AS mqtt_topic",
        "mqttQos AS mqtt_qos",
        "mqttRetained AS mqtt_retained",
        "mqttDuplicate AS mqtt_duplicate",
        "schemaVersion AS schema_version",
        "payload_json",
        "redpanda_topic",
        "redpanda_partition",
        "redpanda_offset",
        "ingested_at",
    )
    invalid = batch.filter(~col("is_valid")).selectExpr("CAST(raw_value AS STRING) AS value")
    if not invalid.isEmpty():
        options = kafka_options()
        for key in ("subscribe", "startingOffsets", "failOnDataLoss", "maxOffsetsPerTrigger"):
            options.pop(key, None)
        (
            invalid.write.format("kafka")
            .options(**options)
            .option("topic", os.environ.get("REDPANDA_DLQ_TOPIC", "celesnity.mqtt.dlq.v1"))
            .save()
        )

    tenants = [row.tenant_id for row in valid.select("tenant_id").distinct().collect()]
    for tenant in tenants:
        if not TENANT_KEY.fullmatch(tenant):
            raise ValueError(f"Invalid tenant storage key in Redpanda record: {tenant!r}")
        table = ensure_table(spark, tenant)
        valid.filter(col("tenant_id") == tenant).writeTo(table).append()


def main() -> None:
    spark = build_session()
    spark.sparkContext.setLogLevel(os.environ.get("SPARK_LOG_LEVEL", "WARN"))
    raw = spark.readStream.format("kafka").options(**kafka_options()).load()
    parsed = raw.select(
        col("value").alias("raw_value"),
        from_json(col("value").cast("string"), ENVELOPE).alias("event"),
        get_json_object(col("value").cast("string"), "$.payload").alias("payload_json"),
        col("topic").alias("redpanda_topic"),
        col("partition").alias("redpanda_partition"),
        col("offset").alias("redpanda_offset"),
        col("timestamp").alias("ingested_at"),
    ).select(
        "raw_value",
        "event.*",
        "payload_json",
        "redpanda_topic",
        "redpanda_partition",
        "redpanda_offset",
        "ingested_at",
    )

    enriched = parsed.withColumn(
        "is_valid",
        coalesce(
            col("tenantId").rlike(TENANT_KEY.pattern)
            & col("adapterId").rlike(ADAPTER_KEY.pattern)
            & col("eventId").isNotNull()
            & col("receivedAt").isNotNull(),
            lit(False),
        ),
    )

    query = (
        enriched.writeStream.foreachBatch(write_batch)
        .option("checkpointLocation", checkpoint_location())
        .trigger(processingTime=os.environ.get("STREAMING_TRIGGER_INTERVAL", "30 seconds"))
        .queryName(os.environ.get("STREAMING_DEPLOYMENT_ID", "mqtt-shared-0"))
        .start()
    )
    query.awaitTermination()


if __name__ == "__main__":
    main()
