import argparse
import os
import sys
from typing import Any, Dict, List

import requests


SCHEMA_QUERY = """
query __TypeFields($name: String!) {
  __type(name: $name) {
    fields {
      name
    }
  }
}
"""


def load_env(path: str) -> Dict[str, str]:
    """
    Minimal .env loader (KEY=VALUE). This avoids adding new dependencies.
    """
    env: Dict[str, str] = {}
    if not os.path.exists(path):
        return env

    with open(path, "r", encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            k, v = line.split("=", 1)
            k = k.strip()
            v = v.strip().strip("'").strip('"')
            env[k] = v
    return env


def get_headers(api_token: str, auth_header: str) -> Dict[str, str]:
    if auth_header:
        return {auth_header: api_token}
    return {"Authorization": f"Bearer {api_token}"}


def list_fields(api_url: str, api_token: str, auth_header: str, gql_type_name: str) -> List[str]:
    headers = get_headers(api_token, auth_header)
    resp = requests.post(
        api_url,
        json={"query": SCHEMA_QUERY, "variables": {"name": gql_type_name}},
        headers={**headers, "Content-Type": "application/json"},
        timeout=60,
    )
    resp.raise_for_status()

    payload: Dict[str, Any] = resp.json()
    if "errors" in payload and payload["errors"]:
        raise RuntimeError(f"GraphQL errors: {payload['errors']}")

    t = payload.get("data", {}).get("__type")
    if not t:
        return []
    fields = t.get("fields") or []
    return sorted([f["name"] for f in fields if f.get("name")])


def main() -> None:
    parser = argparse.ArgumentParser(
        description="List GraphQL field names for Siteline types using introspection (__type(fields))."
    )
    parser.add_argument(
        "--type",
        dest="types",
        action="append",
        required=True,
        help="GraphQL type name to introspect (repeatable). Example: --type Project --type Contract",
    )
    parser.add_argument("--env-file", default=os.path.join(os.getcwd(), ".env"), help="Path to .env file")
    args = parser.parse_args()

    env = load_env(args.env_file)
    api_url = env.get("SITELINE_API_URL") or os.environ.get("SITELINE_API_URL")
    api_token = env.get("SITELINE_API_TOKEN") or os.environ.get("SITELINE_API_TOKEN")
    auth_header = env.get("SITELINE_AUTH_HEADER") or os.environ.get("SITELINE_AUTH_HEADER") or ""

    if not api_url or not api_token:
        print(
            "Missing SITELINE_API_URL and/or SITELINE_API_TOKEN. Set them in .env or env vars.",
            file=sys.stderr,
        )
        sys.exit(2)

    # Match backend behavior: backend expects full URL and uses it as-is.
    # Your .env uses /graphql already, but we keep it flexible.
    # If someone provides a base URL without /graphql, we append it.
    if not api_url.rstrip("/").endswith("/graphql"):
        api_url = api_url.rstrip("/") + "/graphql"

    for type_name in args.types:
        fields = list_fields(api_url, api_token, auth_header, type_name)
        print(f"--- {type_name} fields ({len(fields)}) ---")
        if not fields:
            print("(no fields or unknown type)")
        else:
            for f in fields:
                print(f"- {f}")
        print()


if __name__ == "__main__":
    main()

