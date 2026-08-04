#!/usr/bin/env python3
"""
End-to-end Planetary Computer Pro sample: create a STAC collection, ingest sample
Sentinel-2 imagery from the public Microsoft Planetary Computer, configure render +
mosaic so the collection is visualizable, and print the Explorer URL.

Mirrors the official API tutorial, packaged as a single runnable script so the POC
workstation can prove the ingest -> configure -> visualize flow with zero external data.

Prerequisites (installed by setup.ps1):
    pip install pystac-client azure-identity requests pillow
    az login        # the signed-in identity needs GeoCatalog Administrator on the catalog

Usage:
    python ingest_sample.py --geocatalog-url https://<name>.<region>.<...>.azure.com
"""

from __future__ import annotations

import argparse
import json
import os
import random
import string
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import requests
from azure.identity import AzureCliCredential
from pystac_client import Client

# Microsoft Planetary Computer Pro control/data plane app ID used for token scoping.
MPC_APP_ID = "https://geocatalog.spatio.azure.com"
API_VERSION = "2026-04-15"

# Public Planetary Computer endpoints used as the sample data source.
PC_STAC = "https://planetarycomputer.microsoft.com/api/stac/v1"
PC_SAS = "https://planetarycomputer.microsoft.com/api/sas/v1/token"
PC_DATA = "https://planetarycomputer.microsoft.com/api/data/v1"

# Sample selection: a small set of Sentinel-2 scenes over southern Iceland.
PC_COLLECTION = "sentinel-2-l2a"
BBOX_AOI = [-22.455626, 63.834083, -22.395201, 63.880750]
DATE_RANGE = "2024-02-04/2024-02-11"
MAX_ITEMS = 6


_credential = AzureCliCredential()
_token = None


def bearer() -> Dict[str, str]:
    """Return an Authorization header, refreshing the token as needed."""
    global _token
    if not _token or datetime.fromtimestamp(_token.expires_on) < datetime.now() + timedelta(minutes=5):
        _token = _credential.get_token(f"{MPC_APP_ID}/.default")
    return {"Authorization": f"Bearer {_token.token}"}


def raise_for_status(r: requests.Response) -> None:
    try:
        r.raise_for_status()
    except requests.exceptions.HTTPError:
        try:
            print(json.dumps(r.json(), indent=2))
        except Exception:
            print(r.content)
        raise


def create_collection(geocatalog_url: str) -> str:
    """Clone the public Sentinel-2 collection definition into the GeoCatalog."""
    resp = requests.get(f"{PC_STAC}/collections/{PC_COLLECTION}")
    raise_for_status(resp)
    stac_collection = resp.json()

    collection_id = f"{PC_COLLECTION}-poc-{random.randint(0, 1000)}"
    stac_collection["id"] = collection_id
    stac_collection["title"] = collection_id

    # Collection-level assets (e.g. thumbnail) aren't allowed on create; drop them.
    stac_collection.pop("assets", None)
    stac_collection.pop("msft:storage_account", None)
    stac_collection.pop("msft:container", None)

    resp = requests.post(
        f"{geocatalog_url}/stac/collections",
        json=stac_collection,
        headers=bearer(),
        params={"api-version": API_VERSION},
    )
    if resp.status_code != 201:
        raise_for_status(resp)
    print(f"Created STAC collection: {collection_id}")
    return collection_id


def find_ingestion_source(geocatalog_url: str, container_url: str) -> Optional[Dict[str, Any]]:
    endpoint = f"{geocatalog_url}/inma/ingestion-sources"
    resp = requests.get(endpoint, headers=bearer(), params={"api-version": API_VERSION})
    raise_for_status(resp)
    for source in resp.json().get("value", []):
        detail = requests.get(
            f"{endpoint}/{source['id']}",
            headers=bearer(),
            params={"api-version": API_VERSION},
        )
        raise_for_status(detail)
        detail = detail.json()
        if detail["connectionInfo"]["containerUrl"] == container_url:
            return detail
    return None


def create_ingestion_source(geocatalog_url: str, container_url: str, sas_token: str) -> None:
    resp = requests.post(
        f"{geocatalog_url}/inma/ingestion-sources",
        json={
            "kind": "SasToken",
            "connectionInfo": {"containerUrl": container_url, "sasToken": sas_token},
        },
        headers=bearer(),
        params={"api-version": API_VERSION},
    )
    raise_for_status(resp)


def remove_ingestion_source(geocatalog_url: str, source_id: str) -> None:
    resp = requests.delete(
        f"{geocatalog_url}/inma/ingestion-sources/{source_id}",
        headers=bearer(),
        params={"api-version": API_VERSION},
    )
    raise_for_status(resp)


def register_source(geocatalog_url: str) -> None:
    """Register (or refresh) the public PC container as a SAS-token ingestion source."""
    pc_token = requests.get(f"{PC_SAS}/{PC_COLLECTION}").json()
    stac_collection = requests.get(f"{PC_STAC}/collections/{PC_COLLECTION}").json()
    container_url = (
        f"https://{stac_collection['msft:storage_account']}.blob.core.windows.net/"
        f"{stac_collection['msft:container']}"
    )

    existing = find_ingestion_source(geocatalog_url, container_url)
    if existing:
        expiration = datetime.fromisoformat(
            existing["connectionInfo"]["expiration"].split(".")[0]
        ).replace(tzinfo=timezone.utc)
        if expiration < datetime.now(tz=timezone.utc) + timedelta(minutes=15):
            print("Refreshing expiring ingestion source.")
            remove_ingestion_source(geocatalog_url, existing["id"])
            create_ingestion_source(geocatalog_url, container_url, pc_token["token"])
        else:
            print("Using existing ingestion source.")
    else:
        print("Creating ingestion source.")
        create_ingestion_source(geocatalog_url, container_url, pc_token["token"])


def ingest_items(geocatalog_url: str, collection_id: str) -> None:
    """Query the public PC and ingest matching Sentinel-2 items into the collection."""
    catalog = Client.open(PC_STAC)
    search = catalog.search(collections=[PC_COLLECTION], bbox=BBOX_AOI, datetime=DATE_RANGE)
    items = list(search.item_collection())[:MAX_ITEMS]
    print(f"Found {len(items)} items to ingest.")

    items_endpoint = f"{geocatalog_url}/stac/collections/{collection_id}/items"
    operation_ids = []
    for item in items:
        item_json = item.to_dict()
        item_json["collection"] = collection_id
        for dynamic in ("rendered_preview", "preview", "tilejson"):
            item_json.get("assets", {}).pop(dynamic, None)
        resp = requests.post(
            items_endpoint,
            json=item_json,
            headers=bearer(),
            params={"api-version": API_VERSION},
        )
        raise_for_status(resp)
        operation_ids.append(resp.json()["id"])
        print(f"  queued {item_json['id']}")

    wait_for_operations(geocatalog_url, operation_ids)


def wait_for_operations(geocatalog_url: str, operation_ids: list[str]) -> None:
    endpoint = f"{geocatalog_url}/inma/operations"
    start = time.time()
    while True:
        running = finished = failed = 0
        for op_id in operation_ids:
            resp = requests.get(
                f"{endpoint}/{op_id}",
                headers=bearer(),
                params={"api-version": API_VERSION},
            )
            raise_for_status(resp)
            status = resp.json()["status"]
            if status == "Running":
                running += 1
            elif status == "Failed":
                failed += 1
            elif status == "Succeeded":
                finished += 1
        print(f"Ingesting... finished={finished} running={running} failed={failed} "
              f"({time.time() - start:.0f}s)")
        if running == 0:
            print(f"Ingestion complete: {finished} succeeded, {failed} failed.")
            return
        time.sleep(5)


def configure_visualization(geocatalog_url: str, collection_id: str) -> None:
    """Add render options and a mosaic definition so the collection shows in Explorer."""
    render_json = requests.get(f"{PC_DATA}/mosaic/info?collection={PC_COLLECTION}").json()
    render_endpoint = (
        f"{geocatalog_url}/stac/collections/{collection_id}/configurations/render-options"
    )
    for render_option in render_json.get("renderOptions", []):
        render_option["id"] = (
            render_option["name"]
            .translate(str.maketrans("", "", string.punctuation))
            .lower()
            .replace(" ", "-")[:30]
        )
        requests.post(
            render_endpoint,
            json=render_option,
            headers=bearer(),
            params={"api-version": API_VERSION},
        )
    print("Applied render options.")

    mosaics_endpoint = (
        f"{geocatalog_url}/stac/collections/{collection_id}/configurations/mosaics"
    )
    requests.post(
        mosaics_endpoint,
        json={
            "id": "mos1",
            "name": "Most recent available",
            "description": "Most recent available imagery in this collection",
            "cql": [],
        },
        headers=bearer(),
        params={"api-version": API_VERSION},
    )
    print("Applied mosaic definition.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Planetary Computer Pro end-to-end sample.")
    parser.add_argument(
        "--geocatalog-url",
        default=os.environ.get("GEOCATALOG_URL"),
        help="GeoCatalog URI (from the portal Overview blade). Or set GEOCATALOG_URL.",
    )
    args = parser.parse_args()

    if not args.geocatalog_url:
        parser.error("--geocatalog-url is required (or set GEOCATALOG_URL).")

    geocatalog_url = args.geocatalog_url.rstrip("/")

    collection_id = create_collection(geocatalog_url)
    register_source(geocatalog_url)
    ingest_items(geocatalog_url, collection_id)
    configure_visualization(geocatalog_url, collection_id)

    print("\nDone. Open the Explorer to visualize your collection:")
    print(f"  {geocatalog_url}/collections/{collection_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
