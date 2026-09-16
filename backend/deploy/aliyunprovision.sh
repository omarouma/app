#!/usr/bin/env bash
# aliyunprovision.sh - Idempotent Alibaba Cloud provisioning for GaGa Chat.
#
# Verifies the network prerequisites in ap-southeast-3 (Kuala Lumpur) and
# prints the ECS launch plan for the API instance. Read-only by default;
# pass --apply to also add missing security-group rules.
#
# Resource IDs below were confirmed live via OpenAPI inventory (2026-09):
#   VPC     vpc-8psjb3ut04ylanmy6g7gx  (172.31.0.0/16, IPv6 enabled)
#   vSwitch vsw-8psdvlzrki4sjn34v4wlk (gagachat-vsw-c, zone ap-southeast-3c)
#   SG      sg-8ps6zz4o3wufmc0bhhjs  (gagachat-sg, production rules present)
#   Image   ubuntu_24_04_x64_20G_alibase_20260828.vhd (x86_64, Ubuntu 24.04)
# The paid provisioning calls (RunInstances, EIP Allocate) are executed by the
# operator AFTER account risk-control is lifted - see RUNBOOK-ACCOUNT-UNBLOCK.md.
#
# Usage:
#   ./aliyunprovision.sh            # inventory + gate check (read-only)
#   ./aliyunprovision.sh --apply    # also apply missing SG rules
# Requires: aliyun CLI 3.5.x configured (aliyun configure set ...).
set -euo pipefail

DRY_RUN=1
[[ "${1:-}" == "--apply" ]] && DRY_RUN=0

# ---- Project constants (discovered via OpenAPI inventory 2026-09) ----
REGION="ap-southeast-3"
VPC_ID="vpc-8psjb3ut04ylanmy6g7gx"
VSWITCH_ID="vsw-8psdvlzrki4sjn34v4wlk"
VSWITCH_ZONE="ap-southeast-3c"
SG_ID="sg-8ps6zz4o3wufmc0bhhjs"
IMAGE_ID="ubuntu_24_04_x64_20G_alibase_20260828.vhd"
INSTANCE_TYPE="ecs.e-c1m1.large"   # 2 vCPU / 2 GiB economy; zone-c available
INSTANCE_NAME="gagachat-api-01"

log()  { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*"; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
cli()  { aliyun "$@" --region "$REGION" 2>/dev/null; }

# ---------- 1. identity and connectivity ----------
log "checking aliyun CLI identity"
[[ -x "$(command -v aliyun)" ]] || die "aliyun CLI not found in PATH"
WHO=$(aliyun sts GetCallerIdentity 2>/dev/null | jq -r '.Arn // empty')
[[ -n "$WHO" ]] || die "aliyun CLI not configured (run: aliyun configure set --access-key-id ... --access-key-secret ... --region $REGION)"
log "identity: $WHO"
case "$WHO" in *:root) log "  WARNING: this is the ROOT key - create/use the gagachat-ops RAM key for provisioning";; esac

# ---------- 2. inventory read pass ----------
log "verifying VPC $VPC_ID"
VPC_CIDR=$(cli vpc DescribeVpcs --VpcId "$VPC_ID" | jq -r '.Vpcs.Vpc[0].CidrBlock // empty')
[[ -n "$VPC_CIDR" ]] || die "VPC $VPC_ID not found - check region or account"
log "  cidr: $VPC_CIDR"

log "verifying vSwitch $VSWITCH_ID"
VSWITCH=$(cli vpc DescribeVSwitches --VSwitchId "$VSWITCH_ID" | jq -r '.VSwitches.VSwitch[0].VSwitchId // empty')
[[ -n "$VSWITCH" ]] || die "vSwitch $VSWITCH_ID not found"
log "  ok: $VSWITCH (zone $VSWITCH_ZONE)"

log "verifying security group $SG_ID"
SG_NAME=$(cli ecs DescribeSecurityGroups --SecurityGroupId "$SG_ID" | jq -r '.SecurityGroups.SecurityGroup[0].SecurityGroupName // empty')
[[ -n "$SG_NAME" ]] || die "security group $SG_ID not found"
log "  name: $SG_NAME"

# ---------- 3. security-group rules (idempotent) ----------
# Rules confirmed present 2026-09; re-assert only any that are missing.
# Port list matches the PDF production spec (SSH, HTTP(S), TURN 3478/5349,
# TURN media relay range, WebRTC default 8080).
IpProtocol=(tcp tcp tcp tcp tcp tcp udp udp udp)
PortMin=(22 80 443 3478 5349 8080 3478 5349 49152)
PortMax=(22 80 443 3478 5349 8080 3478 5349 65535)
for i in "${!IpProtocol[@]}"; do
  proto="${IpProtocol[$i]}"; pmin="${PortMin[$i]}"; pmax="${PortMax[$i]}"
  existing=$(cli ecs DescribeSecurityGroupAttribute --SecurityGroupId "$SG_ID" --Direction ingress \
    | jq -r --arg p "$proto" --arg lo "$pmin" --arg hi "$pmax" \
      '[.Permissions.Permission[]? | select(((.IpProtocol // "") | ascii_downcase)==$p and .PortRange==($lo+"/"+$hi))] | length')
  if [[ "${existing:-0}" -ge 1 ]]; then
    log "  sg rule ok: $proto ${pmin}-${pmax}"
  elif [[ "$DRY_RUN" -eq 1 ]]; then
    log "  sg rule MISSING: $proto ${pmin}-${pmax} (rerun with --apply to add)"
  else
    log "  sg rule adding: $proto ${pmin}-${pmax}"
    cli ecs AuthorizeSecurityGroup --SecurityGroupId "$SG_ID" --IpProtocol "$proto" \
      --PortRange "${pmin}/${pmax}" --SourceCidrIp "0.0.0.0/0" --Direction ingress >/dev/null
  fi
done
RULE_COUNT=$(cli ecs DescribeSecurityGroupAttribute --SecurityGroupId "$SG_ID" --Direction ingress \
  | jq -r '[.Permissions.Permission[]?] | length')
log "  ingress rule count: $RULE_COUNT"

# ---------- 4. instance-type availability ----------
log "checking instance availability $INSTANCE_TYPE in zone $VSWITCH_ZONE"
AVAILABLE=$(cli ecs DescribeAvailableResources --RegionId "$REGION" \
  --DestinationResource InstanceType --ZoneId "$VSWITCH_ZONE" \
  --InstanceChargeType PostPaid 2>/dev/null \
  | jq -r 'first(.AvailableZones.AvailableZone[].AvailableResources.AvailableResource[]
            .AvailableResources.AvailableResourceType[]
            | select(.Type=="'"$INSTANCE_TYPE"'") | .Status) // empty' 2>/dev/null || echo "")
if [[ "${AVAILABLE:-}" == "Available" ]]; then
  log "  $INSTANCE_TYPE: Available in zone $VSWITCH_ZONE"
elif [[ -n "${AVAILABLE:-}" ]]; then
  log "  $INSTANCE_TYPE status: $AVAILABLE (choose another zone-c type if unavailable)"
else
  log "  NOTE: availability API returned no rows - last known state: Available (2026-09)"
fi

# ---------- 5. existing instances ----------
RUNNING=$(cli ecs DescribeInstances --Status Running 2>/dev/null \
  | jq -r '[.Instances.Instance[]?] | length' 2>/dev/null || echo "0")
log "running ECS instances in region: $RUNNING"
if [[ "$RUNNING" -gt 0 ]]; then
  cli ecs DescribeInstances --Status Running 2>/dev/null \
    | jq -r '.Instances.Instance[] | "  \(.InstanceId) \(.InstanceName) \(.PublicIpAddress.IpAddress[0] // "no-public-ip")"'
fi

# ---------- 6. launch plan ----------
log "launch plan (run AFTER risk-control is lifted):"
cat <<PLAN
  aliyun ecs RunInstances \\
    --RegionId $REGION \\
    --ZoneId $VSWITCH_ZONE \\
    --ImageId $IMAGE_ID \\
    --InstanceType $INSTANCE_TYPE \\
    --SecurityGroupId $SG_ID \\
    --VSwitchId $VSWITCH_ID \\
    --InstanceName $INSTANCE_NAME \\
    --InternetMaxBandwidthOut 5 \\
    --InternetChargeType PayByTraffic \\
    --SystemDisk.Category cloud_essd_entry \\
    --SystemDisk.Size 40 \\
    --Password "<set-a-strong-password>" \\
    --InstanceChargeType PostPaid
  # capture InstanceId from the JSON output, wait for Running:
  aliyun ecs DescribeInstances --RegionId $REGION --InstanceIds '["<InstanceId>"]'
  # record the public IP, then update the api.gagachat.app A record at
  # Namecheap (registrar-servers.com is authoritative - NOT Alibaba DNS)
  # ssh root@<public-ip> then run: ./ecs-deploy.sh on the host
PLAN

log "runbook: see RUNBOOK-ACCOUNT-UNBLOCK.md for the risk-control lift steps"
log "DONE (dry-run=$([ $DRY_RUN -eq 1 ] && echo yes || echo no))"
