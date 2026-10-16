"""Feasibility gate, not a product implementation.

Run with the local compose Spark 3.5.7 / Iceberg 1.11.0 image. Only synthetic
rows in a UUID-named table are written. No current-target scan is used.
The proposed changelog-view protocol MUST pass every case before adoption.
Overwrite here means the compiler's createOrReplace(), not row-level MERGE,
UPDATE, DELETE, or DataFrameWriterV2.overwrite(). Those need separate proofs:
create_changelog_view removes carry-over rows for row-level operations.
Thread barriers exercise overlapping API submissions, not every commit order.
"""
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from pyspark.sql import SparkSession, functions as F


class AmbiguousResult(RuntimeError):
    pass


def main():
    builder = (SparkSession.builder.appName("workflow-output-facts-proof")
        .config("spark.sql.extensions", "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions")
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
        .config("spark.sql.shuffle.partitions", "2"))
    spark = builder.getOrCreate()
    spark.sparkContext.setLogLevel("ERROR")
    iceberg = spark._jvm.org.apache.iceberg.IcebergBuild.fullVersion()
    print("RUNTIME Spark=" + spark.version + " Iceberg=" + iceberg, flush=True)
    assert spark.version == "3.5.7", "Wrong pinned Spark runtime"
    assert "1.11.0" in iceberg, "Wrong pinned Iceberg runtime"
    table = "celesnity.test_workflow_output_facts.proof_" + uuid.uuid4().hex
    spark.sql("CREATE NAMESPACE IF NOT EXISTS celesnity.test_workflow_output_facts")
    failures = []

    def write(execution, values, mode="append", barrier=None):
        frame = spark.createDataFrame([(v,) for v in values], "id long")
        writer = (frame.writeTo(table)
            .option("snapshot-property.celesnity-execution-id", execution)
            .option("snapshot-property.celesnity-target-node-id", "target-a"))
        if barrier:
            barrier.wait(timeout=30)
        if mode == "create":
            writer.using("iceberg").create()
        elif mode == "replace":
            writer.using("iceberg").createOrReplace()
        else:
            writer.append()

    def snapshot(execution, target="target-a"):
        matches = (spark.table(table + ".snapshots")
            .where((F.col("summary")["celesnity-execution-id"] == execution)
                   & (F.col("summary")["celesnity-target-node-id"] == target))
            .select("snapshot_id", "parent_id").limit(2).collect())
        if len(matches) != 1:
            raise AmbiguousResult("Expected exactly one execution/target snapshot; found " + str(len(matches)))
        return matches[0]

    def verify(execution, values):
        snap = snapshot(execution)
        options = "'end-snapshot-id', '" + str(snap.snapshot_id) + "'"
        if snap.parent_id is not None:
            options += ", 'start-snapshot-id', '" + str(snap.parent_id) + "'"
        view = "proof_changes_" + uuid.uuid4().hex
        spark.sql("CALL celesnity.system.create_changelog_view(table => '" + table
            + "', changelog_view => '" + view + "', options => map(" + options
            + "), compute_updates => false, net_changes => false)")
        rows = spark.table(view).where(F.col("_change_type") == "INSERT")
        actual = sorted(r.id for r in rows.select("id").collect())
        assert rows.where(F.col("_commit_snapshot_id") != snap.snapshot_id).count() == 0
        spark.catalog.dropTempView(view)
        if actual != sorted(values):
            # Diagnostic alternative: raw changelog preserves carry-over rows.
            reader = spark.read.format("iceberg").option("end-snapshot-id", str(snap.snapshot_id))
            if snap.parent_id is not None:
                reader = reader.option("start-snapshot-id", str(snap.parent_id))
            raw = reader.load(table + ".changes").where(F.col("_change_type") == "INSERT")
            raw_actual = sorted(r.id for r in raw.select("id").collect())
            print("FAIL " + execution + " view_count=" + str(len(actual))
                  + " expected=" + str(len(values)) + " raw_exact=" + str(raw_actual == sorted(values)), flush=True)
            failures.append(execution)
        else:
            print("PASS " + execution + " count=" + str(len(actual)), flush=True)

    try:
        write("create-a", [1, 2, 3, 4], "create")
        verify("create-a", [1, 2, 3, 4])
        write("append-b", [5, 6])
        verify("create-a", [1, 2, 3, 4])
        verify("append-b", [5, 6])
        write("overwrite-c", [10, 11, 12], "replace")
        write("interleaved-d", [13])
        verify("overwrite-c", [10, 11, 12])
        verify("interleaved-d", [13])
        write("overwrite-identical", [10, 11, 12, 13], "replace")
        verify("overwrite-identical", [10, 11, 12, 13])
        write("overwrite-zero", [], "replace")
        verify("overwrite-zero", [])
        barrier = Barrier(2)
        with ThreadPoolExecutor(max_workers=2) as pool:
            jobs = [pool.submit(write, "concurrent-e", [21, 22], "append", barrier),
                    pool.submit(write, "concurrent-f", [31, 32, 33], "append", barrier)]
            for job in jobs:
                job.result(timeout=180)
        verify("concurrent-e", [21, 22])
        verify("concurrent-f", [31, 32, 33])
        barrier = Barrier(2)
        with ThreadPoolExecutor(max_workers=2) as pool:
            jobs = [pool.submit(write, "concurrent-replace", [51, 52], "replace", barrier),
                    pool.submit(write, "concurrent-append", [61, 62, 63], "append", barrier)]
            for job in jobs:
                job.result(timeout=180)
        verify("concurrent-replace", [51, 52])
        verify("concurrent-append", [61, 62, 63])
        for execution, target in [("missing", "target-a"), ("concurrent-e", "wrong-target")]:
            try:
                snapshot(execution, target)
            except AmbiguousResult:
                print("PASS missing-or-wrong-target rejected", flush=True)
            else:
                raise AssertionError("Missing snapshot accepted")
        write("duplicate", [41])
        write("duplicate", [42])
        try:
            snapshot("duplicate")
        except AmbiguousResult:
            print("PASS duplicate-tag rejected", flush=True)
        else:
            raise AssertionError("Duplicate snapshots accepted")
        assert not failures, "PROTOCOL BLOCKED: " + ", ".join(failures)
        print("PASS proposed committed-snapshot protocol", flush=True)
    finally:
        # Exact generated fixture only; never drop a pre-existing/user table.
        spark.sql("DROP TABLE IF EXISTS " + table + " PURGE")
        spark.stop()


if __name__ == "__main__":
    main()
