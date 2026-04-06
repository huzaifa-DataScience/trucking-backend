import argparse
import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from urllib import error, request


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


def post_graphql(
    api_url: str,
    token: str,
    auth_header: str,
    query: str,
    variables: Optional[Dict[str, Any]] = None,
    operation_name: Optional[str] = None,
) -> Dict[str, Any]:
    if not api_url.rstrip("/").endswith("/graphql"):
        api_url = api_url.rstrip("/") + "/graphql"

    headers = {"Content-Type": "application/json"}
    if auth_header:
        headers[auth_header] = token
    else:
        headers["Authorization"] = f"Bearer {token}"

    body: Dict[str, Any] = {"query": query, "variables": variables or {}}
    if operation_name:
        body["operationName"] = operation_name

    req = request.Request(
        api_url,
        data=json.dumps(body).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=90) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return json.loads(raw)
    except error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = {"raw": raw}
        return {"httpError": {"code": e.code, "body": parsed}}
    except Exception as e:
        return {"exception": str(e)}


CURRENT_COMPANY_QUERY = """
query currentCompany {
  currentCompany {
    id
    createdAt
    updatedAt
    name
    phoneNumber
    users { id firstName lastName email jobTitle phoneNumber status }
    locations {
      id nickname street1 street2 city county state country postalCode timeZone
    }
  }
}
"""


PAGINATED_CONTRACTS_QUERY = """
query paginatedContracts($input: GetPaginatedContractsInput!) {
  paginatedContracts(input: $input) {
    cursor
    hasNext
    contracts {
      id
      createdAt
      updatedAt
      internalProjectNumber
      billingType
      percentComplete
      status
      timeZone
      paymentTermsType
      paymentTerms
      project {
        id
        name
        projectNumber
        timeZone
        gcName
        bondNumber
        createdAt
        updatedAt
        gcAddress { street1 city state postalCode country }
      }
      payApps {
        id
        createdAt
        payAppNumber
        billingType
        status
        statusChangedAt
        billingStart
        billingEnd
        payAppDueDate
        timeZone
        retentionOnly
        currentBilled
        currentRetention
        totalRetention
        totalValue
        balanceToFinish
        previousRetentionBilled
        retentionReleased
        retentionHeldPercent
        updatedAt
      }
    }
  }
}
"""


CONTRACT_QUERY = """
query Contract($id: ID!) {
  contract(id: $id) {
    id
    createdAt
    updatedAt
    internalProjectNumber
    billingType
    status
    timeZone
    paymentTermsType
    paymentTerms
    percentComplete
    leadPMs { id firstName lastName email }
    project {
      id
      name
      projectNumber
      timeZone
      createdAt
      updatedAt
      gcName
      bondNumber
      gcAddress { street1 city state postalCode country }
    }
    sov {
      id
      totalValue
      totalBilled
      totalRetention
      progressComplete
      lineItems {
        id code name originalTotalValue latestTotalValue totalBilled totalRetention progressComplete
      }
    }
    payApps {
      id
      createdAt
      payAppNumber
      billingType
      billingStart
      billingEnd
      payAppDueDate
      timeZone
      status
      statusChangedAt
      retentionOnly
      currentBilled
      currentRetention
      totalRetention
      totalValue
      balanceToFinish
      previousRetentionBilled
      retentionReleased
      retentionHeldPercent
      updatedAt
    }
  }
}
"""


PAY_APP_QUERY = """
query PayApp($id: ID!) {
  payApp(id: $id) {
    id
    createdAt
    payAppNumber
    billingType
    billingStart
    billingEnd
    payAppDueDate
    status
    statusChangedAt
    updatedAt
    retentionOnly
    currentBilled
    currentRetention
    totalRetention
    totalValue
    balanceToFinish
    previousRetentionBilled
    retentionReleased
    retentionHeldPercent
    timeZone
    progress {
      id
      progressBilled
      storedMaterialBilled
      totalValue
      sovLineItem { id code name }
    }
    contract {
      id
      internalProjectNumber
      billingType
      status
      project {
        id
        name
        projectNumber
        gcName
        timeZone
      }
    }
    g702Values {
      originalContractSum
      netChangeByChangeOrders
      contractSumToDate
      totalCompletedToDate
      progressRetentionPercent
      progressRetentionAmount
      materialsRetentionPercent
      materialsRetentionAmount
      totalRetention
      totalLessRetainage
      previousPayments
      balanceToFinish
      balanceToFinishWithRetention
    }
  }
}
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch Siteline API snapshot and save it to docs.")
    parser.add_argument("--env-file", default=".env")
    parser.add_argument("--contracts-limit", type=int, default=10)
    parser.add_argument("--out", default="")
    args = parser.parse_args()

    env = load_env(args.env_file)
    api_url = env.get("SITELINE_API_URL", "")
    token = env.get("SITELINE_API_TOKEN", "")
    auth_header = env.get("SITELINE_AUTH_HEADER", "")
    if not api_url or not token:
        print("Missing SITELINE_API_URL or SITELINE_API_TOKEN")
        return 2

    snapshot: Dict[str, Any] = {
        "fetchedAtUtc": datetime.now(timezone.utc).isoformat(),
        "apiUrl": api_url,
        "queries": {},
    }

    current_company = post_graphql(
        api_url, token, auth_header, CURRENT_COMPANY_QUERY, operation_name="currentCompany"
    )
    snapshot["queries"]["currentCompany"] = current_company

    paginated_contracts = post_graphql(
        api_url,
        token,
        auth_header,
        PAGINATED_CONTRACTS_QUERY,
        variables={"input": {"limit": args.contracts_limit}},
        operation_name="paginatedContracts",
    )
    snapshot["queries"]["paginatedContracts"] = paginated_contracts

    first_contract_id = None
    first_pay_app_id = None
    contracts = (
        paginated_contracts.get("data", {})
        .get("paginatedContracts", {})
        .get("contracts", [])
    )
    if contracts:
        first_contract_id = contracts[0].get("id")
        pay_apps = contracts[0].get("payApps", [])
        if pay_apps:
            first_pay_app_id = pay_apps[0].get("id")

    if first_contract_id:
        contract_detail = post_graphql(
            api_url,
            token,
            auth_header,
            CONTRACT_QUERY,
            variables={"id": first_contract_id},
            operation_name="Contract",
        )
        snapshot["queries"]["contractById"] = {"id": first_contract_id, "response": contract_detail}
    else:
        snapshot["queries"]["contractById"] = {"skipped": "No contract id from paginatedContracts"}

    if first_pay_app_id:
        pay_app_detail = post_graphql(
            api_url,
            token,
            auth_header,
            PAY_APP_QUERY,
            variables={"id": first_pay_app_id},
            operation_name="PayApp",
        )
        snapshot["queries"]["payAppById"] = {"id": first_pay_app_id, "response": pay_app_detail}
    else:
        snapshot["queries"]["payAppById"] = {"skipped": "No pay app id from first contract"}

    os.makedirs("docs", exist_ok=True)
    out_path = args.out.strip() or f"docs/siteline_api_snapshot_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, indent=2)

    print(out_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
