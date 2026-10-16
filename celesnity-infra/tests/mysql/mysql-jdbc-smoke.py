import os

from pyspark.sql import SparkSession


spark = SparkSession.builder.appName("celesnity-mysql-jdbc-smoke").getOrCreate()
try:
    rows = (
        spark.read.format("jdbc")
        .option("url", os.environ["CELESNITY_DB_JDBC_URL"])
        .option("driver", os.environ["CELESNITY_DB_DRIVER_CLASS"])
        .option("dbtable", "events")
        .option("user", os.environ["SOURCE_MYSQL_USER"])
        .option("password", os.environ["SOURCE_MYSQL_PASSWORD"])
        .load()
        .select("event_id", "event_name")
        .collect()
    )
    observed = [(row["event_id"], row["event_name"]) for row in rows]
    if observed != [(1, "mysql-spark-smoke")]:
        raise RuntimeError(f"Unexpected MySQL rows: {observed!r}")
    print("MYSQL_SPARK_SMOKE_OK")
finally:
    spark.stop()
