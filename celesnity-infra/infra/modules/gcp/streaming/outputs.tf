output "bootstrap_brokers" {
  value = "redpanda.${var.namespace}.svc.cluster.local:9093"
}
output "namespace" { value = var.namespace }
output "redpanda_node_pool" { value = google_container_node_pool.redpanda.name }
output "mqtt_endpoint" { value = "mqtts://${var.mqtt_hostname}:8883" }
output "mqtt_load_balancer_ip" { value = google_compute_global_address.mqtt.address }
output "mqtt_load_balancer_address_id" {
  description = "Reserved global-address identifier. Other classic proxy frontends may reuse it only on distinct TCP ports."
  value       = google_compute_global_address.mqtt.id
}
output "mqtt_certificate_map" { value = google_certificate_manager_certificate_map.mqtt.name }
