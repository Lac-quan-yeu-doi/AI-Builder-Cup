FROM maven:3.9.11-eclipse-temurin-17 AS transform-build

WORKDIR /work
COPY debezium-metadata-transform/pom.xml debezium-metadata-transform/pom.xml
COPY debezium-metadata-transform/src debezium-metadata-transform/src
RUN mvn -B -f debezium-metadata-transform/pom.xml package

FROM quay.io/debezium/connect:3.6

COPY --from=transform-build \
  /work/debezium-metadata-transform/target/celesnity-debezium-metadata-transform-0.1.0.jar \
  /kafka/connect/celesnity-metadata-transform/
