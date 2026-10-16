SHELL := /bin/bash
.DEFAULT_GOAL := help

# Which cloud and which environment. Together they select both the Terraform
# root and the kustomize overlay, so the two can never drift apart.
CLOUD      ?= gcp
ENV        ?= dev
TF_DIR     := infra/environments/$(CLOUD)-$(ENV)
OVERLAY    := deploy/overlays/$(CLOUD)-$(ENV)
WORKLOAD_NAMESPACE ?= $(if $(filter prod,$(ENV)),celesnity-prod,celesnity)
COMPOSE    := docker compose --project-directory local -f local/compose.yaml

# Shared provider cache. Without it every environment keeps its own copy of every
# provider: the AWS and GCP providers are ~600 MB each, and helm/kubernetes/random
# would be duplicated across roots. Terraform hard-links from here instead.
export TF_PLUGIN_CACHE_DIR ?= $(HOME)/.terraform.d/plugin-cache

# Kustomize refuses to read files outside the kustomization directory unless the
# load restrictor is relaxed. deploy/base reads config/trino/ on purpose, so that
# Compose and Kubernetes share one Trino configuration.
KUSTOMIZE_FLAGS := --load-restrictor LoadRestrictionsNone

# Gateway API and the GKE policy types are CRDs, so kubeconform has no schema for
# them and -strict treats that as an error. Skipped by kind rather than with
# -ignore-missing-schemas, which would silently pass over a typo in any manifest.
# Only the GCP overlay needs it; AWS stays fully strict.
#
# Gateway and HTTPRoute are upstream Gateway API; HealthCheckPolicy and
# GCPBackendPolicy are GKE-specific.
#
# The commas must be escaped through $(COMMA). Written inline they are read as
# argument separators to $(if), which silently truncates the list to "-skip
# Gateway" and lets the other three CRDs fail validation.
COMMA := ,
KUBECONFORM_SKIP_KINDS := Gateway$(COMMA)HTTPRoute$(COMMA)HealthCheckPolicy$(COMMA)GCPBackendPolicy
KUBECONFORM_SKIP := $(if $(filter gcp,$(CLOUD)),-skip $(KUBECONFORM_SKIP_KINDS),)

.PHONY: help
help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; print "Targets (override env with ENV=<name>, default: $(ENV))\n"} \
		/^[a-zA-Z0-9_-]+:.*?##/ { printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2 } \
		/^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) }' $(MAKEFILE_LIST)

##@ Local (Docker Compose)

.PHONY: up
up: ## Start the lightweight local data stack and wait for health
	$(COMPOSE) up -d --wait

.PHONY: up-full
up-full: ## Start all local services (streaming, FTPS, and agent tools)
	SPARK_WORKER_REPLICAS=$${SPARK_WORKER_REPLICAS:-2} $(COMPOSE) \
		--profile streaming --profile ftps --profile agent-tools up -d --wait

.PHONY: up-streaming
up-streaming: ## Add MQTT/Redpanda streaming to the lightweight stack
	SPARK_WORKER_REPLICAS=$${SPARK_WORKER_REPLICAS:-2} $(COMPOSE) \
		--profile streaming up -d --wait

.PHONY: up-cdc
up-cdc: ## Start the local Redpanda and Debezium CDC runtime
	$(COMPOSE) --profile cdc up -d --build --wait

.PHONY: up-ftps
up-ftps: ## Add the local FTPS service to the lightweight stack
	$(COMPOSE) --profile ftps up -d --wait

.PHONY: down
down: ## Stop the local stack, preserving volumes
	$(COMPOSE) down

.PHONY: reset
reset: ## Stop the local stack and DELETE all local data
	$(COMPOSE) down -v

.PHONY: ps
ps: ## Show local service status
	$(COMPOSE) ps

.PHONY: logs
logs: ## Tail local logs (SERVICE=trino-coordinator to narrow)
	$(COMPOSE) logs -f --tail=100 $(SERVICE)

.PHONY: build
build: ## Build the local Spark image
	$(COMPOSE) build spark-master

.PHONY: trino
trino: ## Open the Trino CLI against the local coordinator
	$(COMPOSE) exec trino-coordinator trino

##@ Infrastructure (Terraform)

GCP_ADC_FILE := $(HOME)/.config/gcloud/application_default_credentials.json

# Terraform does NOT use the gcloud CLI's active account. It authenticates through
# Application Default Credentials, a separate credential store, and the two drift
# routinely: `gcloud config` can name the correct account while ADC still holds a
# login from a different one. Every Terraform read then succeeds and every write
# returns 403, which reads like a missing-role problem and is not one.
#
# So resolve the ADC token to the identity the API actually sees, rather than
# checking that the credentials file exists.
.PHONY: gcp-identity
gcp-identity: ## Compare the gcloud CLI identity against the ADC identity Terraform uses
	@set -uo pipefail; \
	cli=$$(gcloud config list --format='value(core.account)' 2>/dev/null); \
	[ -n "$$cli" ] || { echo "No active gcloud account. Run: gcloud auth login"; exit 1; }; \
	[ -f "$(GCP_ADC_FILE)" ] || { \
		echo "No Application Default Credentials."; \
		echo "Run: gcloud auth application-default login"; exit 1; }; \
	tok=$$(gcloud auth application-default print-access-token 2>/dev/null || true); \
	[ -n "$$tok" ] || { \
		echo "ADC present but unusable (expired or revoked)."; \
		echo "Run: gcloud auth application-default login"; exit 1; }; \
	adc=$$(curl -s --max-time 15 https://www.googleapis.com/oauth2/v3/userinfo \
		-H "Authorization: Bearer $$tok" 2>/dev/null \
		| python3 -c 'import json,sys; print(json.load(sys.stdin).get("email",""))' 2>/dev/null || true); \
	if [ -z "$$adc" ]; then \
		adc=$$(python3 -c 'import json;print(json.load(open("$(GCP_ADC_FILE)")).get("client_email",""))' 2>/dev/null || true); \
	fi; \
	quota=$$(python3 -c 'import json;print(json.load(open("$(GCP_ADC_FILE)")).get("quota_project_id","<unset>"))' 2>/dev/null || echo '<unset>'); \
	printf '%-22s %s\n' "gcloud account" "$$cli"; \
	printf '%-22s %s\n' "adc identity" "$${adc:-<unresolved>}"; \
	printf '%-22s %s\n' "adc quota project" "$$quota"; \
	if [ "$$cli" != "$$adc" ]; then \
		echo; \
		echo "IDENTITY MISMATCH. Terraform authenticates as '$$adc', not '$$cli'."; \
		echo "Reads will succeed and every write will fail with 403. Fix with:"; \
		echo "  gcloud auth application-default login    # choose $$cli"; \
		echo "  gcloud auth application-default set-quota-project \$$(gcloud config get-value project)"; \
		exit 1; \
	fi

.PHONY: whoami
whoami: ## Show which cloud identity is currently active
	@if [ "$(CLOUD)" = "gcp" ]; then \
		$(MAKE) --no-print-directory gcp-identity; \
	else \
		aws sts get-caller-identity --output table 2>/dev/null \
			|| { echo "No AWS credentials. See the Authentication section of README.md."; exit 1; }; \
	fi

.PHONY: preflight
preflight: whoami ## Verify credentials, region, and required tools before applying
	@set -euo pipefail; \
	echo; \
	printf '%-22s %s\n' "cloud"     "$(CLOUD)"; \
	printf '%-22s %s\n' "tf root"   "$(TF_DIR)"; \
	printf '%-22s %s\n' "overlay"   "$(OVERLAY)"; \
	if [ "$(CLOUD)" = "gcp" ]; then \
		printf '%-22s %s\n' "gcloud" "$$(gcloud version --format='value(\"Google Cloud SDK\")' 2>/dev/null || echo MISSING)"; \
	else \
		printf '%-22s %s\n' "aws cli" "$$(aws --version 2>&1 | cut -d' ' -f1)"; \
		printf '%-22s %s\n' "profile" "$${AWS_PROFILE:-<default chain>}"; \
	fi; \
	printf '%-22s %s\n' "terraform" "$$(terraform version -json | python3 -c 'import json,sys;print(json.load(sys.stdin)["terraform_version"])')"; \
	printf '%-22s %s\n' "kubectl"   "$$(kubectl version --client -o json 2>/dev/null | python3 -c 'import json,sys;print(json.load(sys.stdin)["clientVersion"]["gitVersion"])')"; \
	printf '%-22s %s\n' "docker buildx" "$$(docker buildx version 2>/dev/null | cut -d' ' -f2 || echo MISSING)"; \
	printf '%-22s %s\n' "tf region" "$$(cd $(TF_DIR) && terraform console <<< 'var.region' 2>/dev/null | tr -d '\"' || echo unknown)"; \
	echo; \
	echo "Ready. Next: make infra-plan CLOUD=$(CLOUD)"

.PHONY: infra-init
infra-init: ## terraform init
	terraform -chdir=$(TF_DIR) init

.PHONY: infra-fmt
infra-fmt: ## terraform fmt across modules and environments
	terraform fmt -recursive infra

.PHONY: infra-validate
infra-validate: ## terraform validate
	terraform -chdir=$(TF_DIR) validate

.PHONY: infra-plan
infra-plan: ## terraform plan
	terraform -chdir=$(TF_DIR) plan

# Two stages are required. The Kubernetes and Helm providers cannot authenticate
# against a cluster that does not exist yet, so the cloud foundation goes first.
.PHONY: infra-apply
infra-apply: ## terraform apply (two-stage: infra, then Kubernetes resources)
	terraform -chdir=$(TF_DIR) apply \
		-target=module.network -target=module.cluster -target=module.data
	terraform -chdir=$(TF_DIR) apply

.PHONY: infra-destroy
infra-destroy: ## terraform destroy
	terraform -chdir=$(TF_DIR) destroy

.PHONY: infra-output
infra-output: ## Show Terraform outputs
	terraform -chdir=$(TF_DIR) output

.PHONY: kubeconfig
kubeconfig: ## Point kubectl at the cluster for this cloud and environment
	@eval "$$(terraform -chdir=$(TF_DIR) output -raw kubeconfig_command)"

##@ Workloads (Kubernetes)

# Registry, auth, and target architecture all differ by cloud:
#   aws - ECR, `aws ecr get-login-password`, arm64 (Graviton t4g nodes)
#   gcp - Artifact Registry, `gcloud auth configure-docker`, amd64 (e2 nodes)
# Pushing the wrong architecture yields an exec format error at pod start.
.PHONY: image-push
image-push: ## Build and push the Spark image to the cloud's registry
	@set -euo pipefail; \
	region=$$(terraform -chdir=$(TF_DIR) output -raw region); \
	if [ "$(CLOUD)" = "gcp" ]; then \
		repo=$$(terraform -chdir=$(TF_DIR) output -raw spark_repository); \
		echo "==> configuring docker for $$region-docker.pkg.dev"; \
		gcloud auth configure-docker "$$region-docker.pkg.dev" --quiet; \
		platform=linux/amd64; \
	else \
		repo=$$(terraform -chdir=$(TF_DIR) output -raw spark_ecr_repository); \
		echo "==> logging in to $${repo%%/*}"; \
		aws ecr get-login-password --region "$$region" \
			| docker login --username AWS --password-stdin "$${repo%%/*}"; \
		platform=linux/arm64; \
	fi; \
	echo "==> building $$platform"; \
	docker buildx build --platform "$$platform" \
		--tag "$$repo:3.5.7-iceberg-1.11.0" --push images/spark

# The Spark image lives in ECR, whose URL contains the account ID and region and
# so is only known after apply. Rather than hardcode it in kustomization.yaml,
# rewrite the image reference at render time from the Terraform output. Falls
# back to the bare name when Terraform state is absent, so `make render` still
# works offline for linting.
SPARK_REPO_OUTPUT := $(if $(filter gcp,$(CLOUD)),spark_repository,spark_ecr_repository)

define RENDER
	repo=$$(terraform -chdir=$(TF_DIR) output -raw $(SPARK_REPO_OUTPUT) 2>/dev/null || true); \
	kubectl kustomize $(KUSTOMIZE_FLAGS) $(OVERLAY) \
	  | if [ -n "$$repo" ]; then sed -E "s#image: ([^ ]*/)?spark:#image: $$repo:#"; else cat; fi
endef

.PHONY: render
render: ## Render manifests to stdout without applying
	@$(RENDER)

.PHONY: deploy
deploy: ## Apply the Kubernetes workloads
	@$(RENDER) | kubectl apply -f -

.PHONY: undeploy
undeploy: ## Delete the Kubernetes workloads
	@$(RENDER) | kubectl delete --ignore-not-found -f -

.PHONY: status
status: ## Show workload pods
	kubectl -n $(WORKLOAD_NAMESPACE) get pods,svc,gateway,httproute

##@ Observability

MON_NS ?= monitoring

.PHONY: grafana
grafana: ## Port-forward Grafana to http://localhost:3000
	@echo "==> http://localhost:3000  (user: admin)"
	@echo "==> password: make grafana-password"
	kubectl -n $(MON_NS) port-forward svc/grafana 3000:80

.PHONY: grafana-password
grafana-password: ## Print the generated Grafana admin password
	@kubectl -n $(MON_NS) get secret grafana-admin \
		-o jsonpath='{.data.admin-password}' | base64 -d; echo

.PHONY: obs-status
obs-status: ## Show the logging stack, including Alloy pods per node
	kubectl -n $(MON_NS) get pods -o wide

.PHONY: obs-logs
obs-logs: ## Tail Alloy's own logs, to debug collection itself
	kubectl -n $(MON_NS) logs -l app.kubernetes.io/name=alloy --tail=100 -f

##@ Checks

.PHONY: validate
validate: infra-validate lint-manifests lint-compose lint-alloy lint-observability-dashboard ## Run every offline check for CLOUD

.PHONY: validate-all
validate-all: ## Run every offline check for GCP development and production
	@$(MAKE) --no-print-directory validate CLOUD=gcp ENV=dev
	@$(MAKE) --no-print-directory validate CLOUD=gcp ENV=prod
	@echo
	@echo "both GCP environments validated"

.PHONY: lint-alloy
lint-alloy: ## Validate the rendered Alloy pipeline for this cloud (needs grafana-alloy)
	@set -euo pipefail; \
	tmp=$$(mktemp /tmp/alloy.XXXXXX.alloy); \
	trap 'rm -f "$$tmp"' EXIT; \
	echo 'templatefile("../../modules/$(CLOUD)/observability/config/logs.alloy.tftpl", { \
		loki_push_url = "http://loki.$(MON_NS).svc.cluster.local:3100/loki/api/v1/push", \
		cluster_label = "lint", log_namespaces = ["celesnity"], drop_healthcheck_logs = true })' \
		| terraform -chdir=$(TF_DIR) console 2>/dev/null | sed '1d;$$d' > "$$tmp"; \
	alloy validate "$$tmp" && echo "alloy config OK ($(CLOUD))"

.PHONY: lint-observability-dashboard
lint-observability-dashboard: ## Validate Grafana PromQL targets and the Grafana 12 migration workaround
	@jq -e '\
		[.panels[] | select(.datasource.type == "stackdriver") | .targets[] | select(.queryType == "promQL")] as $$queries \
		| ($$queries | length) > 0 \
		  and all($$queries[]; \
		    (.promQLQuery.expr | length) > 0 \
		    and (.promQLQuery.projectName | length) > 0 \
		    and (.promQLQuery.step | length) > 0 \
		    and has("timeSeriesList") \
		    and (.timeSeriesList == {}) \
		  )' \
		infra/modules/gcp/observability/dashboards/platform-overview.json >/dev/null
	@echo "Grafana PromQL dashboard targets OK"

.PHONY: lint-manifests
lint-manifests: ## Schema-validate rendered manifests (needs kubeconform)
	kubectl kustomize $(KUSTOMIZE_FLAGS) $(OVERLAY) \
		| kubeconform -summary -strict -kubernetes-version 1.36.0 $(KUBECONFORM_SKIP) -

.PHONY: lint-compose
lint-compose: ## Validate compose.yaml schema and interpolation
	$(COMPOSE) config --quiet && echo "compose.yaml OK"
