#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <MQTT.h>
#include <WiFi.h>
#include <time.h>

namespace {
constexpr char WIFI_SSID[] = "Wokwi-GUEST";
constexpr char WIFI_PASSWORD[] = "";

// The browser simulation uses a public echo broker. For a Celesnity end-to-end
// run, replace these four values with the one-time credential and telemetry
// topic returned by Device Management, and use host.wokwi.internal as the host.
constexpr char MQTT_HOST[] = "broker.hivemq.com";
constexpr uint16_t MQTT_PORT = 1883;
constexpr char MQTT_USERNAME[] = "";
constexpr char MQTT_PASSWORD[] = "";
constexpr char MQTT_TELEMETRY_TOPIC[] = "celesnity/wokwi/device-validation/2026-09-05";
constexpr char MQTT_FIRMWARE_COMMAND_TOPIC[] =
    "celesnity/wokwi/device-validation/2026-09-05/commands/firmware";
constexpr char CORE_API_BASE_URL[] = "http://host.wokwi.internal:3301/api/v1";

constexpr char GATEWAY_ID[] = "wokwi-gateway-01";
constexpr char SENSOR_ID[] = "wokwi-temperature-01";
constexpr uint8_t SENSOR_PIN = 34;
constexpr uint32_t PUBLISH_INTERVAL_MS = 2000;

WiFiClient wifiClient;
MQTTClient mqtt(2048);
uint32_t sequenceNumber = 0;
uint32_t lastPublishAt = 0;
bool echoReceived = false;

void connectWifi() {
  Serial.print("WIFI connecting");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD, 6);
  while (WiFi.status() != WL_CONNECTED) {
    delay(100);
    Serial.print('.');
  }
  Serial.print(" connected ip=");
  Serial.println(WiFi.localIP());
}

void onMessage(String& topic, String& payload) {
  if (topic == MQTT_FIRMWARE_COMMAND_TOPIC) {
    JsonDocument command;
    if (deserializeJson(command, payload) || command["type"] != "firmware.install") {
      Serial.println("OTA command_invalid");
      return;
    }
    const char* deploymentId = command["deploymentId"];
    const char* artifactUrl = command["artifactUrl"];
    const char* sha256 = command["sha256"];
    const char* signature = command["signature"];
    const char* signingKeyId = command["signingKeyId"];
    const char* eventPath = command["eventPath"];
    const char* eventToken = command["eventToken"];
    const size_t artifactSizeBytes = command["artifactSizeBytes"] | 0;
    const bool resumable = command["download"]["resumable"] | false;
    const size_t chunkSizeBytes = command["download"]["chunkSizeBytes"] | 0;
    const char* bootStrategy = command["boot"]["strategy"];
    const uint32_t confirmationTimeoutSeconds =
        command["boot"]["confirmationTimeoutSeconds"] | 0;
    if (!deploymentId || !artifactUrl || !sha256 || !signature || !signingKeyId || !eventPath ||
        !eventToken || artifactSizeBytes == 0 || !resumable || chunkSizeBytes == 0 ||
        !bootStrategy || strcmp(bootStrategy, "A_B") != 0 || confirmationTimeoutSeconds == 0 ||
        strncmp(artifactUrl, "https://", 8) != 0 || strlen(sha256) != 64) {
      Serial.println("OTA command_contract=FAIL");
      return;
    }
    String expectedPath = "/device-management/firmware-deployments/";
    expectedPath += deploymentId;
    expectedPath += "/events";
    if (expectedPath != eventPath) {
      Serial.println("OTA event_path=FAIL");
      return;
    }

    const char* states[] = {"ACCEPTED", "DOWNLOADING", "VERIFYING", "INSTALLING", "REBOOTING"};
    const uint8_t progress[] = {0, 25, 60, 80, 95};
    for (size_t index = 0; index < 5; ++index) {
      HTTPClient http;
      String url = String(CORE_API_BASE_URL) + eventPath;
      http.begin(url);
      http.addHeader("Content-Type", "application/json");
      http.addHeader("X-Firmware-Event-Token", eventToken);
      JsonDocument event;
      event["status"] = states[index];
      event["progressPercent"] = progress[index];
      String body;
      serializeJson(event, body);
      const int statusCode = http.POST(body);
      http.end();
      if (statusCode < 200 || statusCode >= 300) {
        Serial.printf("OTA event=%s http_status=%d FAIL\n", states[index], statusCode);
        return;
      }
      Serial.printf("OTA event=%s progress=%u PASS\n", states[index], progress[index]);
      delay(150);
    }
    Serial.println("VALIDATION firmware_ota_contract=PASS awaiting_device_ota_adapter");
    return;
  }
  echoReceived = true;
  Serial.print("ECHO topic=");
  Serial.print(topic);
  Serial.print(" bytes=");
  Serial.println(payload.length());
}

void connectMqtt() {
  while (!mqtt.connected()) {
    String clientId = "celesnity-wokwi-" + String(static_cast<uint32_t>(ESP.getEfuseMac()));
    Serial.print("MQTT connecting client=");
    Serial.println(clientId);
    const bool connected = MQTT_USERNAME[0] == '\0'
                               ? mqtt.connect(clientId.c_str())
                               : mqtt.connect(clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD);
    if (!connected) {
      Serial.println("MQTT connection failed");
      delay(1000);
      continue;
    }
    mqtt.subscribe(MQTT_TELEMETRY_TOPIC, 1);
    mqtt.subscribe(MQTT_FIRMWARE_COMMAND_TOPIC, 1);
    Serial.println("MQTT connected and subscribed");
  }
}

void publishTelemetry() {
  const int raw = analogRead(SENSOR_PIN);
  const float temperature = 20.0F + (15.0F * raw / 4095.0F);
  ++sequenceNumber;

  struct tm utcTime;
  char eventTimeJson[24];
  if (getLocalTime(&utcTime, 1000)) {
    char eventTime[21];
    strftime(eventTime, sizeof(eventTime), "%Y-%m-%dT%H:%M:%SZ", &utcTime);
    snprintf(eventTimeJson, sizeof(eventTimeJson), "\"%s\"", eventTime);
  } else {
    // The ingestion envelope explicitly permits a null event time. Do not stop
    // telemetry when an isolated device cannot reach NTP; receivedAt remains
    // available downstream and a later message can carry the synchronized time.
    strcpy(eventTimeJson, "null");
    Serial.println("TIME_SYNC_PENDING");
  }

  char payload[384];
  snprintf(
      payload,
      sizeof(payload),
      "{\"eventId\":\"wokwi-%lu\",\"eventTime\":%s,\"gatewayId\":\"%s\","
      "\"deviceId\":\"%s\",\"sequence\":%lu,\"temperature\":%.2f,"
      "\"batteryPercent\":95,\"radio\":{\"rssi\":-78,\"snr\":7.5},"
      "\"transport\":\"SIMULATED_ANALOG\"}",
      static_cast<unsigned long>(sequenceNumber),
      eventTimeJson,
      GATEWAY_ID,
      SENSOR_ID,
      static_cast<unsigned long>(sequenceNumber),
      temperature);

  echoReceived = false;
  const bool published = mqtt.publish(MQTT_TELEMETRY_TOPIC, payload, false, 1);
  Serial.print(published ? "PUBLISHED " : "PUBLISH_FAILED ");
  Serial.println(payload);
}
}  // namespace

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  connectWifi();
  configTime(0, 0, "pool.ntp.org");
  mqtt.begin(MQTT_HOST, MQTT_PORT, wifiClient);
  mqtt.onMessage(onMessage);
  connectMqtt();
}

void loop() {
  if (!mqtt.connected()) connectMqtt();
  mqtt.loop();

  const uint32_t now = millis();
  if (now - lastPublishAt >= PUBLISH_INTERVAL_MS) {
    lastPublishAt = now;
    publishTelemetry();
  }

  if (echoReceived) {
    echoReceived = false;
    Serial.println("VALIDATION mqtt_publish_and_echo=PASS");
  }
  delay(10);
}
