package io.celesnity.debezium;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.StringJoiner;

import org.apache.kafka.common.config.ConfigDef;
import org.apache.kafka.connect.data.Struct;
import org.apache.kafka.connect.source.SourceRecord;
import org.apache.kafka.connect.transforms.Transformation;

/**
 * Converts a Debezium envelope into a small, schemaless metadata record.
 *
 * <p>The transform deliberately never reads before/after/key fields. It only
 * inspects the operation, commit timestamp, and connector-owned source
 * metadata needed to route a workflow. The original key, value, and headers
 * are not passed through.</p>
 */
public final class MetadataOnlyTransform implements Transformation<SourceRecord> {
  public static final String CONNECTOR_ID_CONFIG = "celesnity.connector.id";
  public static final String ORGANIZATION_ID_CONFIG = "celesnity.organization.id";
  public static final String DATABASE_SERVICE_ID_CONFIG = "celesnity.database.service.id";

  private static final List<String> POSITION_FIELDS = List.of(
      "lsn", "txId", "xmin", "file", "pos", "row", "server_id", "gtid", "snapshot");

  private String connectorId;
  private String organizationId;
  private String databaseServiceId;

  @Override
  public void configure(Map<String, ?> configs) {
    connectorId = required(configs, CONNECTOR_ID_CONFIG);
    organizationId = required(configs, ORGANIZATION_ID_CONFIG);
    databaseServiceId = required(configs, DATABASE_SERVICE_ID_CONFIG);
  }

  @Override
  public SourceRecord apply(SourceRecord record) {
    if (record == null || record.value() == null) {
      return null;
    }

    String operation = operation(value(record.value(), "op"));
    if (operation == null) {
      // Snapshot reads and transaction markers must establish no workflow event.
      return null;
    }

    Object sourceValue = value(record.value(), "source");
    Map<String, Object> source = asMap(sourceValue);
    String schema = text(source.get("schema"));
    String table = text(source.get("table"));
    String database = text(source.get("db"));
    if (table == null || database == null) {
      return null;
    }
    // PostgreSQL exposes a schema in source metadata. MySQL exposes the
    // selected database as `db` and has no separate schema namespace; the
    // metadata crawler uses that database name as the relation namespace.
    if (schema == null) {
      schema = database;
    }

    Long committedAt = number(value(record.value(), "ts_ms"));
    if (committedAt == null) {
      committedAt = number(source.get("ts_ms"));
    }
    if (committedAt == null) {
      return null;
    }

    String positionFingerprint = fingerprint(record, source, database, schema, table);
    Map<String, Object> metadata = new LinkedHashMap<>();
    metadata.put("connectorId", connectorId);
    metadata.put("organizationId", organizationId);
    metadata.put("databaseServiceId", databaseServiceId);
    metadata.put("database", database);
    metadata.put("schema", schema);
    metadata.put("table", table);
    metadata.put("operation", operation);
    metadata.put("committedAt", committedAt);
    metadata.put("positionFingerprint", positionFingerprint);

    // The output key is deterministic but contains no source primary-key data.
    String eventKey = sha256(String.join("\u0000", connectorId, database, schema, table,
        operation, positionFingerprint));
    return new SourceRecord(
        record.sourcePartition(),
        record.sourceOffset(),
        record.topic(),
        record.kafkaPartition(),
        null,
        "sha256:" + eventKey,
        null,
        metadata);
  }

  @Override
  public ConfigDef config() {
    return new ConfigDef()
        .define(CONNECTOR_ID_CONFIG, ConfigDef.Type.STRING, ConfigDef.Importance.HIGH,
            "Stable Celesnity connector identity")
        .define(ORGANIZATION_ID_CONFIG, ConfigDef.Type.STRING, ConfigDef.Importance.HIGH,
            "Tenant identity attached by the platform")
        .define(DATABASE_SERVICE_ID_CONFIG, ConfigDef.Type.STRING, ConfigDef.Importance.HIGH,
            "Verified database service identity attached by the platform");
  }

  @Override
  public void close() {
    // No resources.
  }

  private String fingerprint(
      SourceRecord record,
      Map<String, Object> source,
      String database,
      String schema,
      String table) {
    StringJoiner joiner = new StringJoiner("\u0000");
    joiner.add(connectorId).add(database).add(schema).add(table);
    for (String field : POSITION_FIELDS) {
      Object value = source.get(field);
      if (value != null) {
        joiner.add(field + "=" + value);
      }
    }
    // A connector can omit a position field for a specific DBMS. Include the
    // source partition/offset map only in the hash; it never reaches the event.
    joiner.add(String.valueOf(record.sourcePartition()));
    joiner.add(String.valueOf(record.sourceOffset()));
    return "sha256:" + sha256(joiner.toString());
  }

  private static String required(Map<String, ?> configs, String key) {
    Object value = configs.get(key);
    if (!(value instanceof String string) || string.isBlank()) {
      throw new IllegalArgumentException(key + " must be configured");
    }
    return string.trim();
  }

  private static String operation(Object value) {
    if (!(value instanceof String raw)) {
      return null;
    }
    return switch (raw.toLowerCase()) {
      case "c", "i", "insert" -> "INSERT";
      case "u", "update" -> "UPDATE";
      case "d", "delete" -> "DELETE";
      default -> null;
    };
  }

  private static Object value(Object value, String field) {
    if (value instanceof Struct struct) {
      if (struct.schema().field(field) == null) {
        return null;
      }
      return struct.get(field);
    }
    if (value instanceof Map<?, ?> map) {
      return map.get(field);
    }
    return null;
  }

  private static Map<String, Object> asMap(Object value) {
    if (value instanceof Struct struct) {
      Map<String, Object> copy = new LinkedHashMap<>();
      for (org.apache.kafka.connect.data.Field field : struct.schema().fields()) {
        copy.put(field.name(), struct.get(field));
      }
      return copy;
    }
    if (!(value instanceof Map<?, ?> map)) {
      return Collections.emptyMap();
    }
    Map<String, Object> copy = new LinkedHashMap<>();
    for (Map.Entry<?, ?> entry : map.entrySet()) {
      if (entry.getKey() instanceof String key) {
        copy.put(key, entry.getValue());
      }
    }
    return copy;
  }

  private static String text(Object value) {
    return value instanceof String string && !string.isBlank() ? string : null;
  }

  private static Long number(Object value) {
    if (value instanceof Number number) {
      return number.longValue();
    }
    if (value instanceof String string) {
      try {
        return Long.parseLong(string);
      } catch (NumberFormatException ignored) {
        return null;
      }
    }
    return null;
  }

  private static String sha256(String value) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      byte[] bytes = digest.digest(value.getBytes(StandardCharsets.UTF_8));
      StringBuilder result = new StringBuilder(bytes.length * 2);
      for (byte byteValue : bytes) {
        result.append(String.format("%02x", byteValue));
      }
      return result.toString();
    } catch (NoSuchAlgorithmException exception) {
      throw new IllegalStateException("SHA-256 is unavailable", exception);
    }
  }
}
