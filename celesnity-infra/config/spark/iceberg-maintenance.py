"""Iceberg table maintenance: expire snapshots and remove orphan files.

Why this exists
---------------
Iceberg snapshots are immutable. A DELETE writes a new snapshot, but every prior
snapshot still references the old data files, and time travel can read them. So a
GDPR Art. 17 erasure request appears satisfied while the personal data remains
retrievable indefinitely.

expire_snapshots drops snapshots older than the retention window and deletes the
data files only those snapshots referenced. remove_orphan_files then sweeps files
that no snapshot references at all, which is what failed or aborted writes leave
behind.

Together they are what makes a deletion actually take effect. The retention window
is therefore the outer bound on your erasure SLA, alongside Cloud SQL backup
retention and GCS noncurrent version expiry.

Why Spark and not Trino
-----------------------
Trino would be the more natural fit — it already has the catalog configured — but
config/trino/access-control.properties sets access-control.name=read-only, which
denies ALTER TABLE ... EXECUTE expire_snapshots. Rather than punch a write hole in
the Trino ACL for a maintenance task, this talks to the Iceberg JDBC catalog and
object store directly through Spark.

Cloud neutrality
----------------
The warehouse URI scheme (s3:// or gs://) selects an explicit Iceberg FileIO
implementation below, and both bundles ship in the image. Explicit selection is
required because Iceberg otherwise falls back to HadoopFileIO, whose Hadoop
configuration in this image has no gs:// filesystem provider. Credentials come
from the ambient environment: EKS Pod Identity on AWS, Workload Identity on GCP.
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone

from pyspark.sql import SparkSession

CATALOG = os.environ.get("ICEBERG_CATALOG", "celesnity")

FILE_IO_BY_WAREHOUSE_SCHEME = {
    "gs": "org.apache.iceberg.gcp.gcs.GCSFileIO",
    "s3": "org.apache.iceberg.aws.s3.S3FileIO",
}

# How long deleted rows remain recoverable through time travel. This is the number
# that matters for an erasure SLA.
SNAPSHOT_RETENTION_DAYS = int(os.environ.get("ICEBERG_SNAPSHOT_RETENTION_DAYS", "7"))

# Floor on snapshots kept regardless of age, so a table is never left with no
# rollback point. Iceberg refuses to expire below this.
RETAIN_LAST = int(os.environ.get("ICEBERG_RETAIN_LAST", "3"))

# Orphan sweeps must lag well behind "now". A file belonging to an in-flight write
# has no snapshot referencing it yet, so a short window would delete data out from
# under a running job. Iceberg's own guidance is to keep this conservative.
ORPHAN_RETENTION_DAYS = int(os.environ.get("ICEBERG_ORPHAN_RETENTION_DAYS", "3"))

DRY_RUN = os.environ.get("ICEBERG_MAINTENANCE_DRY_RUN", "false").lower() == "true"
COMPACTION_ENABLED = os.environ.get("ICEBERG_COMPACTION_ENABLED", "true").lower() == "true"
COMPACTION_MIN_INPUT_FILES = int(os.environ.get("ICEBERG_COMPACTION_MIN_INPUT_FILES", "20"))
COMPACTION_TARGET_FILE_SIZE_BYTES = int(
    os.environ.get("ICEBERG_COMPACTION_TARGET_FILE_SIZE_BYTES", "268435456")
)


def log(message: str) -> None:
    print(f"[iceberg-maintenance] {message}", flush=True)


def sql_identifier(table: str) -> str:
    """Backtick-quote each part of a `namespace.table` string for embedding in a
    CALL statement's string-literal `table` parameter. Iceberg re-parses that
    value as a SQL identifier, so an unquoted part that isn't valid identifier
    syntax on its own (e.g. a table literally named `2312312`, which parses as
    a number) fails before maintenance ever runs."""
    return ".".join(f"`{part.replace('`', '``')}`" for part in table.split("."))


def unquote_display_identifier(value: str) -> str:
    """Remove quoting added by Spark SHOW output before procedure arguments."""
    if len(value) >= 2 and value.startswith("`") and value.endswith("`"):
        return value[1:-1].replace("``", "`")
    return value


def quote_identifier(value: str) -> str:
    """Quote an identifier used in a Spark SQL statement."""
    return f"`{value.replace('`', '``')}`"


def build_session() -> SparkSession:
    host = os.environ["POSTGRES_HOST"]
    port = os.environ.get("POSTGRES_PORT", "5432")
    database = os.environ["POSTGRES_DB"]
    sslmode = os.environ.get("POSTGRES_SSLMODE", "require")

    # Cloud SQL is created with ssl_mode = ENCRYPTED_ONLY and refuses plaintext.
    # RDS accepts TLS too, so requiring it is correct on both clouds.
    jdbc_url = f"jdbc:postgresql://{host}:{port}/{database}?sslmode={sslmode}"

    warehouse = os.environ["WAREHOUSE_S3_PATH"]
    warehouse_scheme = warehouse.partition(":")[0].lower()
    try:
        file_io = FILE_IO_BY_WAREHOUSE_SCHEME[warehouse_scheme]
    except KeyError as exc:
        supported = ", ".join(f"{scheme}://" for scheme in FILE_IO_BY_WAREHOUSE_SCHEME)
        raise ValueError(
            f"WAREHOUSE_S3_PATH must use a supported scheme ({supported}); got {warehouse!r}"
        ) from exc

    builder = (
        SparkSession.builder.appName("celesnity-iceberg-maintenance")
        .config(
            "spark.sql.extensions",
            "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions",
        )
        .config(f"spark.sql.catalog.{CATALOG}", "org.apache.iceberg.spark.SparkCatalog")
        .config(
            f"spark.sql.catalog.{CATALOG}.catalog-impl",
            "org.apache.iceberg.jdbc.JdbcCatalog",
        )
        .config(f"spark.sql.catalog.{CATALOG}.uri", jdbc_url)
        .config(f"spark.sql.catalog.{CATALOG}.jdbc.user", os.environ["POSTGRES_USER"])
        .config(
            f"spark.sql.catalog.{CATALOG}.jdbc.password",
            os.environ["POSTGRES_PASSWORD"],
        )
        .config(f"spark.sql.catalog.{CATALOG}.warehouse", warehouse)
        # Do not rely on the URI scheme to select FileIO. Without this setting,
        # Iceberg uses HadoopFileIO and a gs:// warehouse fails before GCS
        # authentication with `No FileSystem for scheme \"gs\"`.
        .config(f"spark.sql.catalog.{CATALOG}.io-impl", file_io)
        # Matches the schema version the catalog was bootstrapped with.
        .config(f"spark.sql.catalog.{CATALOG}.jdbc.schema-version", "V1")
    )

    return builder.getOrCreate()


def discover_tables(spark: SparkSession) -> list[str]:
    """Return fully-qualified <namespace>.<table> names across all namespaces."""
    tables: list[str] = []

    namespaces = [
        unquote_display_identifier(row[0])
        for row in spark.sql(f"SHOW NAMESPACES IN {CATALOG}").collect()
    ]
    log(f"found {len(namespaces)} namespace(s): {', '.join(namespaces) or 'none'}")

    for namespace in namespaces:
        try:
            rows = spark.sql(
                f"SHOW TABLES IN {quote_identifier(CATALOG)}.{quote_identifier(namespace)}"
            ).collect()
        except Exception as exc:  # noqa: BLE001 - one bad namespace must not stop the rest
            log(f"WARN could not list tables in {namespace}: {exc}")
            continue

        for row in rows:
            # SHOW TABLES returns (namespace, tableName, isTemporary).
            table_name = unquote_display_identifier(row[1])
            tables.append(f"{namespace}.{table_name}")

    return tables


def maintain(spark: SparkSession, table: str) -> tuple[int, int]:
    """Expire snapshots then sweep orphans. Returns (files_deleted, orphans_deleted)."""
    now = datetime.now(timezone.utc)
    snapshot_cutoff = (now - timedelta(days=SNAPSHOT_RETENTION_DAYS)).strftime(
        "%Y-%m-%d %H:%M:%S.%f"
    )[:-3]
    orphan_cutoff = (now - timedelta(days=ORPHAN_RETENTION_DAYS)).strftime(
        "%Y-%m-%d %H:%M:%S.%f"
    )[:-3]

    fq = f"{CATALOG}.{table}"
    quoted_table = sql_identifier(table)

    # MQTT Bronze is the only streaming lakehouse table. It stays Bronze: this
    # rewrites its physical files in place rather than copying data to a Silver
    # layer. Batch tables keep their existing maintenance behavior.
    if COMPACTION_ENABLED and table.endswith("_bronze.mqtt_events"):
        if DRY_RUN:
            log(
                f"DRY RUN {fq}: would rewrite data files with "
                f"min_input_files={COMPACTION_MIN_INPUT_FILES} "
                f"target_size={COMPACTION_TARGET_FILE_SIZE_BYTES}"
            )
        else:
            rewrite = spark.sql(
                f"CALL {CATALOG}.system.rewrite_data_files("
                f"table => '{quoted_table}', strategy => 'binpack', "
                "options => map("
                f"'min-input-files', '{COMPACTION_MIN_INPUT_FILES}', "
                f"'target-file-size-bytes', '{COMPACTION_TARGET_FILE_SIZE_BYTES}', "
                "'partial-progress.enabled', 'true', "
                "'partial-progress.max-commits', '10'))"
            ).collect()
            summary = rewrite[0].asDict() if rewrite else {}
            log(f"{fq}: rewrite_data_files {summary}")
            manifests = spark.sql(
                f"CALL {CATALOG}.system.rewrite_manifests(table => '{quoted_table}', use_caching => false)"
            ).collect()
            manifest_summary = manifests[0].asDict() if manifests else {}
            log(f"{fq}: rewrite_manifests {manifest_summary}")

    expire_sql = (
        f"CALL {CATALOG}.system.expire_snapshots("
        f"table => '{quoted_table}', "
        f"older_than => TIMESTAMP '{snapshot_cutoff}', "
        f"retain_last => {RETAIN_LAST})"
    )

    orphan_sql = (
        f"CALL {CATALOG}.system.remove_orphan_files("
        f"table => '{quoted_table}', "
        f"older_than => TIMESTAMP '{orphan_cutoff}'"
        f"{', dry_run => true' if DRY_RUN else ''})"
    )

    if DRY_RUN:
        log(f"DRY RUN {fq}: would run expire_snapshots older_than {snapshot_cutoff}")
        orphans = spark.sql(orphan_sql).collect()
        log(f"DRY RUN {fq}: {len(orphans)} orphan file(s) would be removed")
        return (0, len(orphans))

    expired = spark.sql(expire_sql).collect()
    # expire_snapshots returns one row of counts; shape varies by Iceberg version.
    deleted = sum(v for v in (expired[0].asDict().values() if expired else []) if isinstance(v, int))
    log(f"{fq}: expire_snapshots removed {deleted} file(s), cutoff {snapshot_cutoff}")

    orphans = spark.sql(orphan_sql).collect()
    log(f"{fq}: remove_orphan_files removed {len(orphans)} file(s), cutoff {orphan_cutoff}")

    return (deleted, len(orphans))


def main() -> int:
    log(
        f"catalog={CATALOG} snapshot_retention={SNAPSHOT_RETENTION_DAYS}d "
        f"retain_last={RETAIN_LAST} orphan_retention={ORPHAN_RETENTION_DAYS}d "
        f"compaction={COMPACTION_ENABLED} dry_run={DRY_RUN}"
    )

    spark = build_session()
    failures = 0
    totals = [0, 0]

    try:
        tables = discover_tables(spark)
        if not tables:
            log("no tables found; nothing to do")
            return 0

        log(f"maintaining {len(tables)} table(s)")

        for table in tables:
            try:
                deleted, orphans = maintain(spark, table)
                totals[0] += deleted
                totals[1] += orphans
            except Exception as exc:  # noqa: BLE001 - keep going across tables
                failures += 1
                log(f"ERROR {table}: {exc}")

        log(
            f"done: {totals[0]} expired file(s), {totals[1]} orphan(s), "
            f"{failures} table(s) failed"
        )
    finally:
        spark.stop()

    # Non-zero on any failure so the CronJob surfaces it rather than reporting
    # success while personal data was left un-erased.
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
