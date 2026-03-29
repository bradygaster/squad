#!/usr/bin/env bash
# Creates an Azure Storage account for the StorageProvider demo.
# Returns the connection string for use with the demo scripts.
#
# Usage:
#   ./scripts/create-storage.sh [resource-group] [location]
#
# Defaults:
#   resource-group: squad-storage-demo-rg
#   location: eastus2

set -euo pipefail

RG="${1:-squad-storage-demo-rg}"
LOCATION="${2:-eastus2}"
# Generate a unique storage account name (max 24 chars, lowercase alphanumeric)
ACCOUNT="squaddemo$(date +%s | tail -c 8)"

echo "══════════════════════════════════════════════"
echo "  Azure Storage — Create for Squad Demo"
echo "══════════════════════════════════════════════"
echo ""
echo "  Resource Group:   $RG"
echo "  Location:         $LOCATION"
echo "  Storage Account:  $ACCOUNT"
echo ""

# Create resource group
echo "── Creating resource group ────────────────────"
az group create --name "$RG" --location "$LOCATION" --output none
echo "  ✓ Resource group: $RG"

# Create storage account (Standard_LRS, blob public access disabled for security)
echo ""
echo "── Creating storage account ─────────────────────"
az storage account create \
  --name "$ACCOUNT" \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --sku Standard_LRS \
  --kind StorageV2 \
  --allow-blob-public-access false \
  --output none
echo "  ✓ Storage account: $ACCOUNT"

# Get connection string
echo ""
echo "── Retrieving connection string ─────────────────"
CONNECTION_STRING=$(az storage account show-connection-string \
  --name "$ACCOUNT" \
  --resource-group "$RG" \
  --query connectionString \
  --output tsv)

echo "  ✓ Connection string retrieved"
echo ""
echo "══════════════════════════════════════════════"
echo "  DONE! Set this environment variable:"
echo ""
echo "  export AZURE_STORAGE_CONNECTION_STRING=\"$CONNECTION_STRING\""
echo ""
echo "  Then run the demo:"
echo "    npm run demo"
echo ""
echo "  To clean up later:"
echo "    ./scripts/delete-storage.sh $RG"
echo "══════════════════════════════════════════════"
