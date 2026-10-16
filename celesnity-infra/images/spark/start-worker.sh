#!/usr/bin/env bash
# Spark standalone worker.
# --host is deliberately left unset so each replica announces its own container
# IP address. That keeps the service scalable: `--scale spark-worker=N` works
# without per-replica configuration.
set -Eeuo pipefail

master_url="spark://${SPARK_MASTER_HOST:-spark-master}:${SPARK_MASTER_INTERNAL_PORT:-7077}"

exec "${SPARK_HOME}/bin/spark-class" org.apache.spark.deploy.worker.Worker \
  --cores "${SPARK_WORKER_CORES:-2}" \
  --memory "${SPARK_WORKER_MEMORY:-1g}" \
  --work-dir /opt/spark/work \
  --webui-port 8081 \
  "${master_url}"
