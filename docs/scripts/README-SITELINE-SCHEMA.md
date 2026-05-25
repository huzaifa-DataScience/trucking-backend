# Siteline Schema Introspection (Field Listing)

This repo integrates with Siteline via GraphQL. When we need to know what fields exist on a specific type (e.g. `Project`), we can use GraphQL introspection to list the available field names.

## Script

`scripts/siteline_list_type_fields.py`

## Prerequisites

Set (or keep) the following in `.env`:

- `SITELINE_API_URL`
- `SITELINE_API_TOKEN`
- optional: `SITELINE_AUTH_HEADER` (if Siteline requires a non-`Authorization` header)

## Examples

List all available fields on `Project`:

```bash
cd /Users/apple/trucking
python3 scripts/siteline_list_type_fields.py --type Project
```

List fields on multiple types:

```bash
python3 scripts/siteline_list_type_fields.py --type Project --type Contract --type PayApp
```

JavaScript version (no Python):

```bash
cd /Users/apple/trucking
node scripts/siteline_list_type_fields.js --type Project --type Contract --type PayApp
```

If your `.env` lives somewhere else:

```bash
python3 scripts/siteline_list_type_fields.py --env-file /path/to/.env --type Project
```

