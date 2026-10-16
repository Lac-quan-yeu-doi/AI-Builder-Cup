FROM spark:3.5.7-scala2.12-java17-python3-ubuntu

ARG ICEBERG_VERSION=1.11.0
ARG POSTGRES_JDBC_VERSION=42.7.13
ARG MYSQL_JDBC_VERSION=26.7.0
ARG SPARK_KAFKA_VERSION=3.5.7
ARG KAFKA_CLIENT_VERSION=3.4.1
ARG COMMONS_POOL_VERSION=2.11.1
ARG GCS_CONNECTOR_VERSION=2.2.23

USER root

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && curl --fail --location --retry 3 \
      "https://repo1.maven.org/maven2/org/apache/iceberg/iceberg-spark-runtime-3.5_2.12/${ICEBERG_VERSION}/iceberg-spark-runtime-3.5_2.12-${ICEBERG_VERSION}.jar" \
      --output "/opt/spark/jars/iceberg-spark-runtime-3.5_2.12-${ICEBERG_VERSION}.jar" \
    `# Both cloud bundles ship in one image so a single build serves AWS, GCP,` \
    `# and MinIO locally. Each Spark catalog explicitly selects the matching` \
    `# S3FileIO or GCSFileIO; URI schemes alone otherwise fall back to HadoopFileIO.` \
    && curl --fail --location --retry 3 \
      "https://repo1.maven.org/maven2/org/apache/iceberg/iceberg-aws-bundle/${ICEBERG_VERSION}/iceberg-aws-bundle-${ICEBERG_VERSION}.jar" \
      --output "/opt/spark/jars/iceberg-aws-bundle-${ICEBERG_VERSION}.jar" \
    && curl --fail --location --retry 3 \
      "https://repo1.maven.org/maven2/org/apache/iceberg/iceberg-gcp-bundle/${ICEBERG_VERSION}/iceberg-gcp-bundle-${ICEBERG_VERSION}.jar" \
      --output "/opt/spark/jars/iceberg-gcp-bundle-${ICEBERG_VERSION}.jar" \
    && curl --fail --location --retry 3 \
      "https://repo1.maven.org/maven2/org/postgresql/postgresql/${POSTGRES_JDBC_VERSION}/postgresql-${POSTGRES_JDBC_VERSION}.jar" \
      --output "/opt/spark/jars/postgresql-${POSTGRES_JDBC_VERSION}.jar" \
    && curl --fail --location --retry 3 \
      "https://repo1.maven.org/maven2/com/mysql/mysql-connector-j/${MYSQL_JDBC_VERSION}/mysql-connector-j-${MYSQL_JDBC_VERSION}.jar" \
      --output "/opt/spark/jars/mysql-connector-j-${MYSQL_JDBC_VERSION}.jar" \
    `# Structured Streaming's Kafka source. These are pinned to the Spark 3.5.7` \
    `# POM rather than resolved at runtime, so a restarted stream never depends` \
    `# on Maven Central being reachable.` \
    && curl --fail --location --retry 3 \
      "https://repo1.maven.org/maven2/org/apache/spark/spark-sql-kafka-0-10_2.12/${SPARK_KAFKA_VERSION}/spark-sql-kafka-0-10_2.12-${SPARK_KAFKA_VERSION}.jar" \
      --output "/opt/spark/jars/spark-sql-kafka-0-10_2.12-${SPARK_KAFKA_VERSION}.jar" \
    && curl --fail --location --retry 3 \
      "https://repo1.maven.org/maven2/org/apache/spark/spark-token-provider-kafka-0-10_2.12/${SPARK_KAFKA_VERSION}/spark-token-provider-kafka-0-10_2.12-${SPARK_KAFKA_VERSION}.jar" \
      --output "/opt/spark/jars/spark-token-provider-kafka-0-10_2.12-${SPARK_KAFKA_VERSION}.jar" \
    && curl --fail --location --retry 3 \
      "https://repo1.maven.org/maven2/org/apache/kafka/kafka-clients/${KAFKA_CLIENT_VERSION}/kafka-clients-${KAFKA_CLIENT_VERSION}.jar" \
      --output "/opt/spark/jars/kafka-clients-${KAFKA_CLIENT_VERSION}.jar" \
    && curl --fail --location --retry 3 \
      "https://repo1.maven.org/maven2/org/apache/commons/commons-pool2/${COMMONS_POOL_VERSION}/commons-pool2-${COMMONS_POOL_VERSION}.jar" \
      --output "/opt/spark/jars/commons-pool2-${COMMONS_POOL_VERSION}.jar" \
    `# Hadoop's gs:// filesystem is required for Structured Streaming` \
    `# checkpoints. Iceberg GCSFileIO covers table files but not Hadoop paths.` \
    && curl --fail --location --retry 3 \
      "https://repo1.maven.org/maven2/com/google/cloud/bigdataoss/gcs-connector/hadoop3-${GCS_CONNECTOR_VERSION}/gcs-connector-hadoop3-${GCS_CONNECTOR_VERSION}-shaded.jar" \
      --output "/opt/spark/jars/gcs-connector-hadoop3-${GCS_CONNECTOR_VERSION}-shaded.jar" \
    && mkdir -p /opt/spark/ivy/cache /opt/spark/ivy/jars /opt/spark/work \
    && chown -R spark:spark /opt/spark/ivy /opt/spark/work

# Baked in rather than bind-mounted so the same image runs unchanged under
# Compose and under Kubernetes. compose.yaml still mounts these paths, which
# overrides the baked copies for local iteration without a rebuild.
COPY --chown=spark:spark start-master.sh start-worker.sh /opt/celesnity/
RUN chmod 0755 /opt/celesnity/start-master.sh /opt/celesnity/start-worker.sh

ENV CELESNITY_ICEBERG_VERSION=${ICEBERG_VERSION} \
    CELESNITY_POSTGRES_JDBC_VERSION=${POSTGRES_JDBC_VERSION} \
    CELESNITY_MYSQL_JDBC_VERSION=${MYSQL_JDBC_VERSION} \
    CELESNITY_SPARK_KAFKA_VERSION=${SPARK_KAFKA_VERSION} \
    CELESNITY_GCS_CONNECTOR_VERSION=${GCS_CONNECTOR_VERSION} \
    SPARK_JARS_IVY=/opt/spark/ivy

USER spark
