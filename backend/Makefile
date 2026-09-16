# GaGa Chat backend — cloud deploy targets (Alibaba ap-southeast-1)
# Usage: make <target>. See deploy/RUNBOOK-ACCOUNT-UNBLOCK.md for the full path.

SHELL := /bin/bash
.DEFAULT_GOAL := help

REGION := ap-southeast-1

.PHONY: help provision provision-apply verify backend-test cloud-check cloud-migrate
.PHONY: deploy-verify deploy-live image-build image-push live-gate dns-check hint

help:
	@echo 'GaGa Chat backend deploy targets:'
	@echo '  provision       - verify Alibaba network (read-only)'
	@echo '  provision-apply - add any missing SG rules'
	@echo '  verify          - backend tests + Alibaba inventory check'
	@echo '  backend-test    - npm test in backend/'
	@echo '  cloud-check     - readiness gate: 14 runtime secrets + live RDS/Redis/OSS'
	@echo '  cloud-migrate   - one-time SQLite -> RDS import (SQLITE_SOURCE_PATH=...)'
	@echo '  image-build     - build the API image (NS=<acr-namespace>)'
	@echo '  deploy-verify   - public endpoint verify (npm run deploy:verify)'
	@echo '  live-gate       - raw live gate check of api.gagachat.app'

provision:
	bash deploy/aliyunprovision.sh

provision-apply:
	bash deploy/aliyunprovision.sh --apply

verify: backend-test provision

backend-test:
	npm test

cloud-check:
	npm run cloud:check

cloud-migrate:
	npm run cloud:migrate

deploy-verify:
	npm run deploy:verify

deploy-live:
	bash deploy/verify-live.sh

# On the ECS host (after Steps 1-5 of the runbook):
#   make image-build NS=<acr-namespace>
image-build:
	docker build -t registry.$(REGION).aliyuncs.com/$(NS)/gagachat-api:3.9.0 .

image-push: image-build
	docker push registry.$(REGION).aliyuncs.com/$(NS)/gagachat-api:3.9.0
	@docker inspect --format='{{index .RepoDigests 0}}' registry.$(REGION).aliyuncs.com/$(NS)/gagachat-api:3.9.0
	@echo 'Set GAGA_API_IMAGE in /etc/gagachat/runtime.env to the digest above.'

live-gate:
	@curl -fsS https://api.gagachat.app/api/ready | jq -e '.ready==true and .database=="rds-mysql" and .realtime=="redis" and .media=="oss"' && echo LIVE_GATE_PASS || echo 'LIVE_GATE_PENDING (expected until DNS cutover)'

dns-check:
	@getent hosts api.gagachat.app || echo 'api.gagachat.app: NXDOMAIN (expected until DNS cutover at Namecheap)'

hint:
	@echo 'Account blocked? See deploy/RUNBOOK-ACCOUNT-UNBLOCK.md Step 1.'
