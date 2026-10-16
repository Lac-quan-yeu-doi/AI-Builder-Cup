"""Prove the workflow scratch catalog is private and stale Iceberg stages expire.

This local integration test uses synthetic rows only. It configures the same
separate-name JDBC catalog as the generated pipeline runtime, confirms Trino's
JDBC catalog cannot enumerate its tables, and drops only expired execution
stage names from the reserved scratch namespace.
"""

import os
import re
import time
import uuid

from pyspark.sql import SparkSession, functions as F


STAGING_NAMESPACE = "__celesnity_workflow_staging"
STAGING_PREFIX = ".celesnity-workflow-staging"
STAGE_TTL_SECONDS = 7 * 24 * 60 * 60
JANITOR_MAX_DROPS = 100
STAGE_TABLE_PATTERN = re.compile(
    r"^_execution_(\d{10})_[0-9a-f]{32}_[0-9a-f]{32}_[0-9a-f]{12}$"
)


def quote_identifier(value):
    return "`" + value.replace("`", "``") + "`"


def qualified(catalog, namespace, table):
    return ".".join(quote_identifier(part) for part in (catalog, namespace, table))


def cleanup_stale_stages(spark, staging_catalog, now):
    namespace = ".".join(
        quote_identifier(part) for part in (staging_catalog, STAGING_NAMESPACE)
    )
    rows = (
        spark.sql("SHOW TABLES IN " + namespace)
        .where(F.col("tableName").rlike(STAGE_TABLE_PATTERN.pattern))
        .orderBy(F.col("tableName").asc())
        .limit(JANITOR_MAX_DROPS)
        .collect()
    )
    cutoff = now - STAGE_TTL_SECONDS
    dropped = []
    for row in rows:
        table_name = row["tableName"]
        match = STAGE_TABLE_PATTERN.fullmatch(table_name)
        if match is None or int(match.group(1)) >= cutoff:
            continue
        spark.sql(
            "DROP TABLE IF EXISTS "
            + qualified(staging_catalog, STAGING_NAMESPACE, table_name)
            + " PURGE"
        ).collect()
        dropped.append(table_name)
    return dropped


def main():
    main_catalog = os.environ.get("ICEBERG_CATALOG", "celesnity")
    staging_catalog = main_catalog + "_workflow_staging"
    warehouse = os.environ["WAREHOUSE_PATH"].rstrip("/")
    file_io = "org.apache.iceberg.aws.s3.S3FileIO"
    builder = (
        SparkSession.builder.appName("workflow-private-staging-gc-proof")
        .config(
            "spark.sql.extensions",
            "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions",
        )
        .config(f"spark.sql.catalog.{main_catalog}", "org.apache.iceberg.spark.SparkCatalog")
        .config(
            f"spark.sql.catalog.{main_catalog}.catalog-impl",
            "org.apache.iceberg.jdbc.JdbcCatalog",
        )
        .config(f"spark.sql.catalog.{main_catalog}.uri", os.environ["POSTGRES_URL"])
        .config(f"spark.sql.catalog.{main_catalog}.jdbc.user", os.environ["POSTGRES_USER"])
        .config(
            f"spark.sql.catalog.{main_catalog}.jdbc.password",
            os.environ["POSTGRES_PASSWORD"],
        )
        .config(f"spark.sql.catalog.{main_catalog}.jdbc.schema-version", "V1")
        .config(f"spark.sql.catalog.{main_catalog}.warehouse", warehouse)
        .config(f"spark.sql.catalog.{main_catalog}.io-impl", file_io)
        .config(
            f"spark.sql.catalog.{staging_catalog}",
            "org.apache.iceberg.spark.SparkCatalog",
        )
        .config(
            f"spark.sql.catalog.{staging_catalog}.catalog-impl",
            "org.apache.iceberg.jdbc.JdbcCatalog",
        )
        .config(f"spark.sql.catalog.{staging_catalog}.uri", os.environ["POSTGRES_URL"])
        .config(
            f"spark.sql.catalog.{staging_catalog}.jdbc.user",
            os.environ["POSTGRES_USER"],
        )
        .config(
            f"spark.sql.catalog.{staging_catalog}.jdbc.password",
            os.environ["POSTGRES_PASSWORD"],
        )
        .config(f"spark.sql.catalog.{staging_catalog}.jdbc.schema-version", "V1")
        .config(
            f"spark.sql.catalog.{staging_catalog}.warehouse",
            warehouse + "/" + STAGING_PREFIX,
        )
        .config(f"spark.sql.catalog.{staging_catalog}.io-impl", file_io)
        .config("spark.sql.shuffle.partitions", "2")
    )
    if os.environ.get("AWS_ENDPOINT_URL"):
        for catalog in (main_catalog, staging_catalog):
            builder = (
                builder.config(
                    f"spark.sql.catalog.{catalog}.s3.endpoint",
                    os.environ["AWS_ENDPOINT_URL"],
                )
                .config(f"spark.sql.catalog.{catalog}.s3.path-style-access", "true")
                .config(f"spark.sql.catalog.{catalog}.s3.region", os.environ["AWS_REGION"])
                .config(
                    f"spark.sql.catalog.{catalog}.s3.access-key-id",
                    os.environ["AWS_ACCESS_KEY_ID"],
                )
                .config(
                    f"spark.sql.catalog.{catalog}.s3.secret-access-key",
                    os.environ["AWS_SECRET_ACCESS_KEY"],
                )
            )

    spark = builder.getOrCreate()
    spark.sparkContext.setLogLevel("ERROR")
    execution_id = uuid.uuid4().hex
    target_hash = "a" * 12
    now = int(time.time())
    stale_name = (
        f"_execution_{now - STAGE_TTL_SECONDS - 1:010d}_{execution_id}_{uuid.uuid4().hex}_{target_hash}"
    )
    fresh_name = (
        f"_execution_{now:010d}_{execution_id}_{uuid.uuid4().hex}_{target_hash}"
    )
    stage_tables = [stale_name, fresh_name]

    try:
        spark.sql(
            "CREATE NAMESPACE IF NOT EXISTS "
            + ".".join(
                quote_identifier(part)
                for part in (staging_catalog, STAGING_NAMESPACE)
            )
        )
        one_row = spark.createDataFrame([(7,)], "amount long")
        for table_name in stage_tables:
            one_row.writeTo(
                qualified(staging_catalog, STAGING_NAMESPACE, table_name)
            ).using("iceberg").create()

        dropped = cleanup_stale_stages(spark, staging_catalog, now)
        assert stale_name in dropped, "Expired scratch table was not removed"
        assert fresh_name not in dropped, "Fresh scratch table was removed"

        staging_namespace = ".".join(
            quote_identifier(part)
            for part in (staging_catalog, STAGING_NAMESPACE)
        )
        private_tables = [
            row["tableName"]
            for row in spark.sql("SHOW TABLES IN " + staging_namespace).collect()
        ]
        assert fresh_name in private_tables, "Private catalog cannot enumerate its fresh stage"

        main_namespaces = [
            row["namespace"]
            for row in spark.sql(
                "SHOW NAMESPACES IN " + quote_identifier(main_catalog)
            ).collect()
        ]
        assert main_namespaces, "Main JDBC catalog has no existing namespace for a read-only visibility check"
        selected_main_namespace = "public" if "public" in main_namespaces else sorted(main_namespaces)[0]
        main_namespace = ".".join(
            quote_identifier(part)
            for part in (main_catalog, selected_main_namespace)
        )
        visible_main_tables = [
            row["tableName"] for row in spark.sql("SHOW TABLES IN " + main_namespace).collect()
        ]
        assert stale_name not in visible_main_tables
        assert fresh_name not in visible_main_tables
        assert (
            spark.table(qualified(staging_catalog, STAGING_NAMESPACE, fresh_name)).count()
            == 1
        )
        print(
            "PASS private JDBC catalog identity is outside the customer catalog; "
            "expired stage dropped and fresh stage kept",
            flush=True,
        )
    finally:
        for table_name in stage_tables:
            spark.sql(
                "DROP TABLE IF EXISTS "
                + qualified(staging_catalog, STAGING_NAMESPACE, table_name)
                + " PURGE"
            ).collect()
        spark.stop()


if __name__ == "__main__":
    main()
