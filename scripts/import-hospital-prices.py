"""Extract public CMS wide-format hospital rates without inventing contract validity.

Example: python3 scripts/import-hospital-prices.py --zip /tmp/guardian-um-prices.zip
This catalog is pricing evidence, not a patient's EOB or an entitlement to a refund.
"""
import argparse
import csv
import datetime
import hashlib
import io
import json
from pathlib import Path
import zipfile

SOURCE = "https://www.uofmhealth.org/386006309_university-of-michigan-health_standardcharges4-1-2026.zip"
PAGE = "https://www.uofmhealth.org/patients-visitors/billing-insurance/estimates/michigan-medicine-standard-charges"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--zip", required=True)
    parser.add_argument("--codes", nargs="+", default=["99285", "70450", "71046", "12001"])
    parser.add_argument("--output", default="reference-data/michigan-medicine-selected-rates.json")
    parser.add_argument("--encoding", default="cp1252", help="Publisher CSV encoding; this source contains Windows-1252 bytes")
    args = parser.parse_args()
    selected = set(args.codes)
    records = []
    with zipfile.ZipFile(args.zip) as archive:
        names = [name for name in archive.namelist() if name.lower().endswith(".csv")]
        if len(names) != 1:
            raise ValueError("Expected exactly one wide-format hospital CSV")
        with archive.open(names[0]) as stream:
            reader = csv.reader(io.TextIOWrapper(stream, encoding=args.encoding))
            metadata = dict(zip(next(reader), next(reader)))
            columns = next(reader)
            required = {"billing_class", "description", "setting", "standard_charge|discounted_cash"}
            if not required.issubset(columns):
                raise ValueError("Unsupported hospital price file schema")
            for raw in reader:
                row = dict(zip(columns, raw))
                codes = [{"code": row.get(f"code|{i}"), "type": row.get(f"code|{i}|type")} for i in range(1, 5)]
                codes = [entry for entry in codes if entry["code"] in selected and entry["type"] in {"CPT", "HCPCS"}]
                if not codes:
                    continue
                context = {"provider": metadata["hospital_name"], "providerNpis": metadata.get("type_2_npi", "").split("|"), "address": metadata.get("hospital_address"), "description": row.get("description"), "codes": codes, "component": row["billing_class"].upper(), "setting": row["setting"].upper(), "modifiers": row.get("modifiers", ""), "notes": row.get("additional_generic_notes", ""), "sourceRow": reader.line_num, "units": None}
                for column, value in row.items():
                    basis = "CASH" if column == "standard_charge|discounted_cash" else "NEGOTIATED" if column.startswith("standard_charge|") and column.endswith("|negotiated_dollar") else None
                    if not basis or not value:
                        continue
                    try:
                        amount = float(value)
                    except ValueError:
                        continue
                    if not 0 < amount < 1e8:
                        continue
                    parts = column.split("|")
                    payer, plan = (parts[1], parts[2]) if basis == "NEGOTIATED" else (None, None)
                    methodology = row.get(f"standard_charge|{payer}|{plan}|methodology", "") if payer else "discounted cash"
                    # Algorithmic, percentage, and bundled figures must not be treated as exact unit rates.
                    records.append({**context, "basis": basis, "amount": amount, "payer": payer, "plan": plan, "methodology": methodology, "payerNotes": row.get(f"additional_payer_notes|{payer}|{plan}", "") if payer else "", "asOf": metadata["last_updated_on"], "contractValidThrough": None})
    catalog = {"sourceName": "University of Michigan Health published standard charges", "sourceUrl": SOURCE, "sourcePage": PAGE, "sourceSha256": hashlib.sha256(Path(args.zip).read_bytes()).hexdigest(), "retrievedOn": datetime.datetime.now(datetime.timezone.utc).date().isoformat(), "metadata": {key: metadata.get(key) for key in ["hospital_name", "last_updated_on", "version", "hospital_address", "type_2_npi"]}, "limitations": ["Published snapshot, not a patient-specific estimate or verified current contract rate.", "Codes must match the actual service; example codes are not assigned to the demo's unspecified procedures.", "Match provider identity, payer, plan, component, setting, modifiers, units, and service date before making a comparison.", "Methodology may be percent-of-charges or bundled even when a dollar figure is present; inspect notes and EOB.", "No validity end date or billing units are inferred. Do not automatically use these rows as exact rates."], "records": records}
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(catalog, indent=2) + "\n")
    print(f"Extracted {len(records)} sourced rates for {len(selected)} requested codes to {output}")


if __name__ == "__main__":
    main()
