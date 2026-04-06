import argparse
import json
import os
import sys
from typing import Dict
from urllib import request, error


QUERY = """
query agingDashboard($input: DashboardInput!) {
  agingDashboard(input: $input) {
    ...AgingDashboardProperties
    __typename
  }
}

fragment AgingDashboardProperties on PayAppAgingDashboard {
  payAppAgingSummary {
    ...PayAppAgingDashboardSummaryProperties
    __typename
  }
  contracts {
    ...PayAppAgingDashboardContractProperties
    __typename
  }
  __typename
}

fragment PayAppAgingDashboardSummaryProperties on PayAppAgingDashboardSummary {
  amountOutstandingThisMonth
  amountOutstandingMonthOverMonthPercent
  amountAged30Days
  amountAged30DaysMonthOverMonthPercent
  amountAged60Days
  amountAged60DaysMonthOverMonthPercent
  amountAged90Days
  amountAged90DaysMonthOverMonthPercent
  amountAged120Days
  amountAged120DaysMonthOverMonthPercent
  averageDaysToPaid
  averageDaysToPaidMonthOverMonthPercent
  payAppAgingBreakdown {
    ...AgingBreakdownProperties
    __typename
  }
  __typename
}

fragment AgingBreakdownProperties on AgingBreakdown {
  numCurrent
  numAged30Days
  numAged60Days
  numAged90Days
  numAged120Days
  amountAgedTotal
  amountAgedCurrent
  amountAged30Days
  amountAged60Days
  amountAged90Days
  amountAged120Days
  amountAgedTotalOverdueOnly
  averageDaysToPaid
  __typename
}

fragment PayAppAgingDashboardContractProperties on PayAppAgingDashboardContract {
  contract {
    id
    billingType
    internalProjectNumber
    paymentTermsType
    paymentTerms
    project {
      id
      name
      projectNumber
      gcName
      gc {
        id
        name
        __typename
      }
      __typename
    }
    company {
      id
      __typename
    }
    leadPMs {
      id
      firstName
      lastName
      __typename
    }
    __typename
  }
  agingBreakdown {
    ...AgingBreakdownProperties
    __typename
  }
  billingStatus
  hasMissingPreSitelinePayApps
  __typename
}
"""


def load_env(path: str) -> Dict[str, str]:
  env: Dict[str, str] = {}
  if not os.path.exists(path):
    return env
  with open(path, "r", encoding="utf-8") as f:
    for raw in f:
      line = raw.strip()
      if not line or line.startswith("#") or "=" not in line:
        continue
      k, v = line.split("=", 1)
      env[k.strip()] = v.strip().strip("'").strip('"')
  return env


def main() -> int:
  parser = argparse.ArgumentParser(description="Fetch Siteline agingDashboard and print raw JSON.")
  parser.add_argument("--env-file", default=".env")
  parser.add_argument("--start-date", required=True, help="YYYY-MM-DD")
  parser.add_argument("--end-date", required=True, help="YYYY-MM-DD")
  parser.add_argument("--search", default="")
  parser.add_argument("--overdue-only", action="store_true")
  parser.add_argument("--company-id", default=None)
  args = parser.parse_args()

  env = load_env(args.env_file)
  api_url = env.get("SITELINE_API_URL") or os.environ.get("SITELINE_API_URL", "")
  token = env.get("SITELINE_API_TOKEN") or os.environ.get("SITELINE_API_TOKEN", "")
  auth_header = env.get("SITELINE_AUTH_HEADER") or os.environ.get("SITELINE_AUTH_HEADER", "")

  if not api_url or not token:
    print("Missing SITELINE_API_URL or SITELINE_API_TOKEN", file=sys.stderr)
    return 2

  if not api_url.rstrip("/").endswith("/graphql"):
    api_url = api_url.rstrip("/") + "/graphql"

  headers = {"Content-Type": "application/json"}
  if auth_header:
    headers[auth_header] = token
  else:
    headers["Authorization"] = f"Bearer {token}"

  body = {
    "operationName": "agingDashboard",
    "query": QUERY,
    "variables": {
      "input": {
        "companyId": args.company_id,
        "startDate": args.start_date,
        "endDate": args.end_date,
        "filters": {
          "overdueOnly": bool(args.overdue_only),
          "search": args.search,
        },
      }
    },
  }

  req = request.Request(
    api_url,
    data=json.dumps(body).encode("utf-8"),
    headers=headers,
    method="POST",
  )

  try:
    with request.urlopen(req, timeout=90) as resp:
      raw = resp.read().decode("utf-8", errors="replace")
      try:
        parsed = json.loads(raw)
        print(json.dumps(parsed, indent=2))
      except json.JSONDecodeError:
        print(raw)
      return 0
  except error.HTTPError as e:
    text = e.read().decode("utf-8", errors="replace")
    print(f"HTTP {e.code}", file=sys.stderr)
    print(text, file=sys.stderr)
    return 1
  except Exception as e:  # pragma: no cover
    print(str(e), file=sys.stderr)
    return 1


if __name__ == "__main__":
  raise SystemExit(main())
