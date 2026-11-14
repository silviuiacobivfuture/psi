#!/bin/bash
# Shared by the backup scripts (sourced). Hetzner Object Storage rejects the AWS CLI's default request checksums, and
# answers NoSuchBucket for a moment after a bucket is created: every call that may meet that is retried.
set -euo pipefail
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required
export AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
export AWS_PAGER=""

# The backup location is a different data centre from everything it copies (nbg1): Falkenstein.
BACKUP_ENDPOINT="${BACKUP_ENDPOINT:-https://fsn1.your-objectstorage.com}"
BACKUP_REGION="${BACKUP_REGION:-fsn1}"
SOURCE_ENDPOINT="${SOURCE_ENDPOINT:-https://nbg1.your-objectstorage.com}"

retry() {
	local n=0
	until "$@"; do
		n=$((n + 1))
		if [ "$n" -ge 10 ]; then
			echo "FAILED after $n tries: $1 $2 ${3:-}" >&2
			return 1
		fi
		sleep 3
	done
}

# An ISO-8601 instant <days> from now, for object-lock retain-until.
until_days() { date -u -d "+$1 days" +%Y-%m-%dT%H:%M:%SZ; }
