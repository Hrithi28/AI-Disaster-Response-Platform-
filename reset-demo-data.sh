#!/usr/bin/env bash
# Deletes the saved demo data (registered users, incidents, reports). Stop the servers first.
cd "$(dirname "$0")"
rm -rf backend/data/local-db backend/data/local-db-cloud backend/data/local-docs*.json*
echo "Saved data deleted - the next start begins with fresh demo data."
