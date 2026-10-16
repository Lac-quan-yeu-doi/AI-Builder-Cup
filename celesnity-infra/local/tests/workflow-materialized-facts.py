"""Prove an execution-scoped Iceberg staging table isolates workflow facts.

This is a local feasibility test, not a product implementation. It writes only
synthetic rows to UUID-named tables in the local Celesnity catalog. Every table
created by this test is dropped in ``finally``.
"""

import os
import uuid

from pyspark.sql import SparkSession, functions as F


def main():
    spark = (
        SparkSession.builder.appName("workflow-materialized-facts-proof")
        .config(
            "spark.sql.extensions",
            "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions",
        )
        .config("spark.sql.catalog.celesnity", "org.apache.iceberg.spark.SparkCatalog")
        .config("spark.sql.catalog.celesnity.catalog-impl", "org.apache.iceberg.jdbc.JdbcCatalog")
        .config("spark.sql.catalog.celesnity.uri", os.environ["POSTGRES_URL"])
        .config("spark.sql.catalog.celesnity.jdbc.user", os.environ["POSTGRES_USER"])
        .config("spark.sql.catalog.celesnity.jdbc.password", os.environ["POSTGRES_PASSWORD"])
        .config("spark.sql.catalog.celesnity.jdbc.schema-version", "V1")
        .config("spark.sql.catalog.celesnity.warehouse", os.environ["WAREHOUSE_PATH"])
        .config("spark.sql.catalog.celesnity.io-impl", "org.apache.iceberg.aws.s3.S3FileIO")
        .config("spark.sql.catalog.celesnity.s3.endpoint", os.environ["AWS_ENDPOINT_URL"])
        .config("spark.sql.catalog.celesnity.s3.path-style-access", "true")
        .config("spark.sql.catalog.celesnity.s3.region", os.environ["AWS_REGION"])
        .config("spark.sql.shuffle.partitions", "2")
        .getOrCreate()
    )
    spark.sparkContext.setLogLevel("ERROR")

    runtime = f"Spark={spark.version} Iceberg={spark._jvm.org.apache.iceberg.IcebergBuild.fullVersion()}"
    print("RUNTIME " + runtime, flush=True)
    assert spark.version == "3.5.7", "Wrong pinned Spark runtime"
    assert "1.11.0" in runtime, "Wrong pinned Iceberg runtime"

    namespace = "celesnity.test_workflow_materialized_facts"
    suffix = uuid.uuid4().hex
    target = f"{namespace}.target_{suffix}"
    stage_tables = [
        f"{namespace}.stage_{suffix}_{name}"
        for name in ("append", "replace", "interleaved", "empty")
    ]
    spark.sql(f"CREATE NAMESPACE IF NOT EXISTS {namespace}")

    def stage(table, values):
        rows = [(value,) for value in values]
        frame = spark.createDataFrame(rows, "amount long")
        frame.writeTo(table).using("iceberg").create()

    def facts(table):
        result = spark.table(table).agg(
            F.count("*").alias("row_count"),
            F.sum(F.when(F.col("amount") > 10000, 1).otherwise(0)).alias("matching_count"),
        ).first()
        return int(result.row_count), int(result.matching_count or 0)

    try:
        seed = spark.createDataFrame([(-1,)], "amount long")
        seed.writeTo(target).using("iceberg").create()

        stage(stage_tables[0], [5000, 12000, 13000])
        append_facts_before = facts(stage_tables[0])
        spark.table(stage_tables[0]).writeTo(target).append()
        append_facts_after = facts(stage_tables[0])
        assert append_facts_before == append_facts_after == (3, 2)
        print("PASS append facts isolated count=3 matching=2", flush=True)

        stage(stage_tables[1], [0, 20000])
        overwrite_facts_before = facts(stage_tables[1])
        spark.table(stage_tables[1]).writeTo(target).using("iceberg").createOrReplace()
        overwrite_facts_after = facts(stage_tables[1])
        prior_append_facts_after_overwrite = facts(stage_tables[0])
        assert overwrite_facts_before == overwrite_facts_after == (2, 1)
        assert prior_append_facts_after_overwrite == (3, 2)
        print("PASS overwrite facts isolated count=2 matching=1", flush=True)

        stage(stage_tables[2], [15000, 30000])
        interleaved_facts_before = facts(stage_tables[2])
        spark.table(stage_tables[2]).writeTo(target).append()
        interleaved_facts_after = facts(stage_tables[2])
        overwrite_facts_after_interleaved_append = facts(stage_tables[1])
        assert interleaved_facts_before == interleaved_facts_after == (2, 2)
        assert overwrite_facts_after_interleaved_append == (2, 1)
        print("PASS interleaved append preserves prior run facts", flush=True)

        stage(stage_tables[3], [])
        empty_facts_before = facts(stage_tables[3])
        spark.table(stage_tables[3]).writeTo(target).using("iceberg").createOrReplace()
        empty_facts_after = facts(stage_tables[3])
        assert empty_facts_before == empty_facts_after == (0, 0)
        print("PASS zero-row overwrite facts count=0 matching=0", flush=True)

        assert spark.table(target).count() == 0
        print("PASS target writes use staged materialization", flush=True)
    finally:
        for table in [target, *stage_tables]:
            spark.sql(f"DROP TABLE IF EXISTS {table} PURGE")
        spark.stop()


if __name__ == "__main__":
    main()
