#!/usr/bin/env bash
# Deletes the Azure resource group and all resources within it.
#
# Usage:
#   ./scripts/delete-storage.sh [resource-group]
#
# Default:
#   resource-group: squad-storage-demo-rg

set -euo pipefail

RG="${1:-squad-storage-demo-rg}"

echo "══════════════════════════════════════════════"
echo "  Azure Storage — Delete Squad Demo Resources"
echo "══════════════════════════════════════════════"
echo ""
echo "  Resource Group: $RG"
echo ""

echo "── Deleting resource group (and all contents) ──"
az group delete --name "$RG" --yes --no-wait
echo "  ✓ Deletion started (--no-wait). Resources will be removed in the background."
echo ""
echo "  To verify deletion:"
echo "    az group show --name $RG 2>/dev/null || echo 'Deleted'"
echo ""
echo "══════════════════════════════════════════════"
