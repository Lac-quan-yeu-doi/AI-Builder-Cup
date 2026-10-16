locals {
  # The queries use the existing low-cardinality app label. Request IDs and
  # error text stay in log lines and are available in Grafana Explore.
  error_alert_queries = {
    core = {
      expr       = "sum(count_over_time({app=\"celesnity-core\"} |= \"\\\"event\\\":\\\"http_request_completed\\\"\" |~ \"\\\"status\\\":5[0-9][0-9]\" [5m]))"
      log_filter = "{app=\"celesnity-core\"} |= \"\\\"event\\\":\\\"http_request_completed\\\"\" |~ \"\\\"status\\\":5[0-9][0-9]\""
    }
    core_worker = {
      expr       = "sum(count_over_time({app=\"celesnity-core\",component=\"worker\"} |= \"ERROR\" [5m]))"
      log_filter = "{app=\"celesnity-core\",component=\"worker\"} |= \"ERROR\""
    }
    web = {
      expr       = "sum(count_over_time({app=\"celesnity-web\"} |~ \"core_proxy_request_failed|agent_proxy_request_failed\" [5m]))"
      log_filter = "{app=\"celesnity-web\"} |~ \"core_proxy_request_failed|agent_proxy_request_failed\""
    }
    agent = {
      expr       = "sum(count_over_time({app=\"minder-serve\"} |~ \"http_exception|agent_run_summary\" |~ \"\\\"status\\\":5[0-9][0-9]|\\\"status\\\":\\\"failed\\\"\" [5m]))"
      log_filter = "{app=\"minder-serve\"} |~ \"http_exception|agent_run_summary\" |~ \"\\\"status\\\":5[0-9][0-9]|\\\"status\\\":\\\"failed\\\"\""
    }
  }

  # Request IDs and timestamps identify separate 4xx responses at query time.
  # This lets Grafana notify about a new denial while an earlier one is still
  # inside the five-minute window, without adding high-cardinality Loki labels.
  client_error_log_filters = {
    core  = "{app=\"celesnity-core\"} |= \"\\\"event\\\":\\\"http_request_completed\\\"\" |~ \"\\\"status\\\":4[0-9][0-9]\""
    web   = "{app=\"celesnity-web\"} |= \"\\\"event\\\":\\\"web_http_client_error\\\"\" |~ \"\\\"status\\\":4[0-9][0-9]\""
    agent = "{app=\"minder-serve\"} |= \"\\\"event\\\":\\\"http_exception\\\"\" |~ \"\\\"status\\\":4[0-9][0-9]\""
  }
  client_error_queries = {
    for service, filter in local.client_error_log_filters : service =>
    "sum by (requestId, occurredAt, status) (count_over_time(${filter} | regexp \"(?P<error_payload>\\\\{.*\\\\})\" | line_format \"{{`{{.error_payload}}`}}\" | json [5m]))"
  }

  # Parse the structured failure line into query-time labels. occurredAt makes
  # each failed step a distinct alert instance; the labels are not Loki index
  # labels, and the five-minute window bounds how long an instance is active.
  agent_tool_failure_query = "sum by (tool, runId, occurredAt) (count_over_time({app=\"minder-serve\"} |= \"\\\"event\\\":\\\"agent_tool_finished\\\"\" |= \"\\\"status\\\":\\\"error\\\"\" | json [5m]))"

  # Existing Core middleware and Agent filters cover new API routes without
  # additional alert rules. A new service needs one spec with an event query.
  error_alert_specs = merge(
    {
      for service, query in local.error_alert_queries : service => {
        uid         = "celesnity_${service}_errors"
        title       = "Celesnity ${service} errors"
        service     = service
        expr        = query.expr
        log_filter  = query.log_filter
        summary     = "New ${service} errors in the last five minutes"
        description = "Open the matching protected logs for request details."
      }
    },
    {
      for service, query in local.client_error_queries : "${service}_client_errors" => {
        uid         = "celesnity_${service}_client_errors"
        title       = "Celesnity ${service} HTTP 4xx"
        service     = service
        expr        = query
        log_filter  = "${local.client_error_log_filters[service]} |= \"__REQUEST_ID__\""
        summary     = "{{`HTTP {{ $labels.status }} in ${service}`}}"
        description = "{{`Request {{ $labels.requestId }} at {{ $labels.occurredAt }} UTC.`}}"
      }
    },
    {
      agent_tool_failures = {
        uid         = "celesnity_agent_tool_failures"
        title       = "Celesnity agent tool failures"
        service     = "agent"
        expr        = local.agent_tool_failure_query
        log_filter  = "{app=\"minder-serve\"} |= \"\\\"event\\\":\\\"agent_tool_finished\\\"\" |= \"__RUN_ID__\""
        summary     = "{{`Agent tool failed: {{ $labels.tool }}`}}"
        description = "{{`Run {{ $labels.runId }} at {{ $labels.occurredAt }} UTC.`}}"
      }
    }
  )

  # Grafana Explore supports a URL-encoded panes state. Only the tool failure
  # filter contains __RUN_ID__, which Grafana replaces from its alert label.
  error_logs_urls = {
    for name, spec in local.error_alert_specs : name => replace(replace(
      "https://${var.grafana_hostname}/explore?panes=${urlencode(jsonencode({
        A = {
          datasource = "P8E80F9AEF21F6940"
          queries = [{
            refId      = "A"
            datasource = { uid = "P8E80F9AEF21F6940", type = "loki" }
            expr       = spec.log_filter
            queryType  = "range"
          }]
          range = { from = "now-7d", to = "now" }
        }
      }))}&schemaVersion=1&orgId=1",
      "__RUN_ID__",
      "{{`{{ $labels.runId }}`}}"
    ), "__REQUEST_ID__", "{{`{{ $labels.requestId }}`}}")
  }

  error_alert_rules = {
    apiVersion = 1
    groups = [{
      orgId    = 1
      name     = "celesnity-service-errors"
      folder   = "Celesnity"
      interval = "30s"
      rules = [
        for name, spec in local.error_alert_specs : {
          uid          = spec.uid
          title        = spec.title
          condition    = "C"
          noDataState  = "OK"
          execErrState = "Alerting"
          for          = "0s"
          labels = {
            service             = spec.service
            severity            = "error"
            notification_target = "discord-errors"
          }
          notification_settings = {
            receiver        = "celesnity-discord-errors"
            group_by        = ["service"]
            group_wait      = "30s"
            group_interval  = "30s"
            repeat_interval = "4h"
          }
          annotations = {
            summary     = spec.summary
            description = spec.description
            logs_url    = local.error_logs_urls[name]
          }
          data = [
            {
              refId             = "A"
              datasourceUid     = "P8E80F9AEF21F6940"
              relativeTimeRange = { from = 300, to = 0 }
              model = {
                datasource = { type = "loki", uid = "P8E80F9AEF21F6940" }
                expr       = spec.expr
                queryType  = "instant"
                refId      = "A"
              }
            },
            {
              refId             = "B"
              datasourceUid     = "__expr__"
              relativeTimeRange = { from = 0, to = 0 }
              model = {
                datasource = { type = "__expr__", uid = "__expr__" }
                expression = "A"
                type       = "reduce"
                reducer    = "last"
                refId      = "B"
              }
            },
            {
              refId             = "C"
              datasourceUid     = "__expr__"
              relativeTimeRange = { from = 0, to = 0 }
              model = {
                datasource = { type = "__expr__", uid = "__expr__" }
                expression = "$B > 0"
                type       = "math"
                refId      = "C"
              }
            },
          ]
        }
      ]
    }]
  }
}
