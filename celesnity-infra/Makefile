SHELL := /bin/bash
.DEFAULT_GOAL := help

COMPOSE    := docker compose --project-directory local -f local/compose.yaml

.PHONY: help
help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; print "Targets\n"} \
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

##@ Checks

.PHONY: validate
validate: lint-compose ## Run every offline check

.PHONY: lint-compose
lint-compose: ## Validate compose.yaml schema and interpolation
	$(COMPOSE) config --quiet && echo "compose.yaml OK"
