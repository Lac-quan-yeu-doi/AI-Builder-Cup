package io.celesnity.debezium;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.apache.kafka.connect.data.Schema;
import org.apache.kafka.connect.data.SchemaBuilder;
import org.apache.kafka.connect.data.Struct;
import org.apache.kafka.connect.source.SourceRecord;
import org.junit.jupiter.api.Test;

final class MetadataOnlyTransformTest {
  @Test
  void mapsPostgresCreateUpdateDeleteToMetadataOnlyRecords() {
    MetadataOnlyTransform transform = configured();
    for (String operation : List.of("c", "u", "d")) {
      SourceRecord result = transform.apply(record("postgres", operation, 100L));
      assertNotNull(result);
      Map<?, ?> value = valueMap(result);
      assertEquals(operation.equals("c") ? "INSERT" : operation.equals("u") ? "UPDATE" : "DELETE",
          value.get("operation"));
      assertMetadataOnly(value);
    }
  }

  @Test
  void mapsDebeziumConnectStructValues() {
    MetadataOnlyTransform transform = configured();
    SourceRecord result = transform.apply(structRecord());

    assertNotNull(result);
    Map<?, ?> value = valueMap(result);
    assertEquals("INSERT", value.get("operation"));
    assertEquals("public", value.get("schema"));
    assertEquals("orders", value.get("table"));
    assertMetadataOnly(value);
  }

  @Test
  void mapsMysqlMetadataAndUsesAStableMetadataKey() {
    MetadataOnlyTransform transform = configured();
    SourceRecord first = transform.apply(record("mysql", "u", 42L));
    SourceRecord second = transform.apply(record("mysql", "u", 42L));

    assertNotNull(first);
    assertEquals(first.key(), second.key());
    assertEquals("analytics", valueMap(first).get("schema"));
    assertEquals("orders", valueMap(first).get("table"));
    assertMetadataOnly(valueMap(first));
  }

  @Test
  void mapsMysqlDatabaseToTheMetadataNamespaceWhenSchemaIsAbsent() {
    MetadataOnlyTransform transform = configured();
    SourceRecord result = transform.apply(recordWithoutSchema());

    assertNotNull(result);
    assertEquals("sales", valueMap(result).get("schema"));
    assertEquals("orders", valueMap(result).get("table"));
    assertMetadataOnly(valueMap(result));
  }

  @Test
  void doesNotEmitSnapshotReadsOrTombstones() {
    MetadataOnlyTransform transform = configured();
    assertNull(transform.apply(record("postgres", "r", 100L)));
    assertNull(transform.apply(new SourceRecord(Map.of(), Map.of(), "cdc", 0, null, null, null, null)));
  }

  @Test
  void differentSourcePositionsProduceDifferentFingerprints() {
    MetadataOnlyTransform transform = configured();
    SourceRecord first = transform.apply(record("postgres", "u", 100L));
    SourceRecord second = transform.apply(record("postgres", "u", 101L));
    assertNotEquals(valueMap(first).get("positionFingerprint"), valueMap(second).get("positionFingerprint"));
  }

  private static MetadataOnlyTransform configured() {
    MetadataOnlyTransform transform = new MetadataOnlyTransform();
    transform.configure(Map.of(
        MetadataOnlyTransform.CONNECTOR_ID_CONFIG, "connector-1",
        MetadataOnlyTransform.ORGANIZATION_ID_CONFIG, "org-1",
        MetadataOnlyTransform.DATABASE_SERVICE_ID_CONFIG, "source-1"));
    return transform;
  }

  private static SourceRecord record(String databaseType, String operation, long position) {
    Map<String, Object> source = new HashMap<>();
    source.put("db", databaseType.equals("mysql") ? "sales" : "sales_db");
    source.put("schema", databaseType.equals("mysql") ? "analytics" : "public");
    source.put("table", "orders");
    if (databaseType.equals("mysql")) {
      source.put("file", "mysql-bin.000003");
      source.put("pos", position);
      source.put("row", 0);
    } else {
      source.put("lsn", position);
      source.put("txId", 17);
    }
    Map<String, Object> envelope = new HashMap<>();
    envelope.put("op", operation);
    envelope.put("ts_ms", 1_758_160_800_000L);
    envelope.put("source", source);
    envelope.put("before", Map.of("id", "canary-before"));
    envelope.put("after", Map.of("id", "canary-after"));
    return new SourceRecord(
        Map.of("server", "fixture"),
        Map.of("position", position),
        "celesnity.cdc.fixture",
        0,
        null,
        Map.of("id", "primary-key-canary"),
        null,
        envelope);
  }

  private static SourceRecord recordWithoutSchema() {
    Map<String, Object> source = new HashMap<>();
    source.put("db", "sales");
    source.put("table", "orders");
    source.put("file", "mysql-bin.000003");
    source.put("pos", 42L);
    source.put("row", 0);
    Map<String, Object> envelope = new HashMap<>();
    envelope.put("op", "u");
    envelope.put("ts_ms", 1_758_160_800_000L);
    envelope.put("source", source);
    envelope.put("before", Map.of("id", "canary-before"));
    envelope.put("after", Map.of("id", "canary-after"));
    return new SourceRecord(
        Map.of("server", "fixture"),
        Map.of("position", 42L),
        "celesnity.cdc.fixture",
        0,
        null,
        Map.of("id", "primary-key-canary"),
        null,
        envelope);
  }

  private static SourceRecord structRecord() {
    Schema sourceSchema = SchemaBuilder.struct()
        .name("io.debezium.connector.postgresql.Source")
        .field("db", Schema.STRING_SCHEMA)
        .field("schema", Schema.STRING_SCHEMA)
        .field("table", Schema.STRING_SCHEMA)
        .field("lsn", Schema.INT64_SCHEMA)
        .field("txId", Schema.INT64_SCHEMA)
        .build();
    Struct source = new Struct(sourceSchema)
        .put("db", "sales_db")
        .put("schema", "public")
        .put("table", "orders")
        .put("lsn", 100L)
        .put("txId", 17L);
    Schema envelopeSchema = SchemaBuilder.struct()
        .name("io.debezium.connector.postgresql.Envelope")
        .field("op", Schema.STRING_SCHEMA)
        .field("ts_ms", Schema.INT64_SCHEMA)
        .field("source", sourceSchema)
        .build();
    Struct envelope = new Struct(envelopeSchema)
        .put("op", "c")
        .put("ts_ms", 1_758_160_800_000L)
        .put("source", source);
    return new SourceRecord(
        Map.of("server", "fixture"),
        Map.of("position", 100L),
        "celesnity.cdc.fixture",
        0,
        null,
        null,
        null,
        envelope);
  }

  private static Map<?, ?> valueMap(SourceRecord record) {
    return (Map<?, ?>) record.value();
  }

  private static void assertMetadataOnly(Map<?, ?> value) {
    for (String forbidden : List.of("before", "after", "key", "payload", "row", "data", "values")) {
      assertFalse(value.containsKey(forbidden), "forbidden field: " + forbidden);
    }
    assertFalse(value.toString().contains("canary"));
    assertNotNull(value.get("positionFingerprint"));
    assertNotNull(value.get("organizationId"));
    assertNotNull(value.get("databaseServiceId"));
  }
}
