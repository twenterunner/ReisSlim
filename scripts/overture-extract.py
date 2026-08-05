#!/usr/bin/env python3
"""Local DuckDB worker for pinned Overture catalogue extraction.

This worker never connects to an Overture HTTPS endpoint. The Node controller
downloads the STAC index and exposes exact, allowlisted assets over a
localhost-only range proxy. Keeping TLS and upstream policy in Node avoids
duplicating trust configuration inside DuckDB/httpfs.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
from pathlib import Path
import sys
import tempfile
import time
from urllib.parse import urlparse


TOURING_PLACE_GROUPS = {
    "accommodations": (
        "hotel", "lodging", "motel", "hostel", "guest_house",
        "bed_and_breakfast", "campground", "camping", "camp_site",
        "caravan_site", "resort", "private_lodging", "holiday_rental", "inn",
    ),
    "restaurants": (
        "restaurant", "fast_food_restaurant", "cafe", "coffee_shop",
        "food_court", "bakery", "bar", "pub", "smoothie_juice_bar",
        "tea_room", "ice_cream_shop",
    ),
    "services": (
        "gas_station", "fuel_station", "charging_station",
        "ev_charging_station", "parking", "automotive_service",
        "vehicle_service", "car_repair", "motorcycle_repair", "rest_area",
        "public_restroom", "toilet", "ferry_terminal", "vehicle_parts_store",
        "tire_shop",
    ),
    "pois": (
        "historic_site", "museum", "park", "national_park", "nature_reserve",
        "protected_area", "viewpoint", "scenic_viewpoint", "tourist_attraction",
        "landmark", "zoo", "aquarium", "garden", "botanical_garden", "beach",
        "mountain", "theatre_venue", "art_gallery", "winery", "monument",
        "castle", "heritage_site", "science_attraction", "amusement_park",
        "amusement_attraction", "animal_attraction", "public_plaza",
    ),
}
TOURING_PLACE_CATEGORIES = tuple(
    category for categories in TOURING_PLACE_GROUPS.values() for category in categories
)


def require_duckdb():
    try:
        import duckdb  # type: ignore
    except ImportError as error:
        raise SystemExit(
            "DuckDB is required. Install the pinned catalogue requirements: "
            "python -m pip install -r requirements-catalog.txt"
        ) from error
    return duckdb


def sql_string(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def parse_bbox(value: str) -> tuple[float, float, float, float]:
    try:
        west, south, east, north = (float(part) for part in value.split(","))
    except (TypeError, ValueError) as error:
        raise SystemExit("bbox must contain west,south,east,north") from error
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise SystemExit("bbox is outside WGS84 bounds or has invalid ordering")
    return west, south, east, north


def connection(*, http_enabled: bool, extension_dir: str | None = None):
    duckdb = require_duckdb()
    database = duckdb.connect()
    if extension_dir:
        Path(extension_dir).mkdir(parents=True, exist_ok=True)
        database.execute(f"SET extension_directory={sql_string(Path(extension_dir).as_posix())}")
    if http_enabled:
        try:
            database.execute("LOAD httpfs")
        except Exception:
            database.execute("INSTALL httpfs")
            database.execute("LOAD httpfs")
        database.execute("SET http_timeout=60")
        database.execute("SET http_retries=2")
        database.execute("SET enable_http_metadata_cache=true")
    return database


def resolve_assets(args: argparse.Namespace) -> int:
    west, south, east, north = parse_bbox(args.bbox)
    stac_path = Path(args.stac).resolve()
    if not stac_path.is_file():
        raise SystemExit(f"STAC index does not exist: {stac_path}")
    database = connection(http_enabled=False)
    rows = database.execute(
        """
        SELECT id, collection, assets.aws.href AS url, num_rows, bbox
        FROM read_parquet(?)
        WHERE collection = ?
          AND bbox.xmin <= ? AND bbox.xmax >= ?
          AND bbox.ymin <= ? AND bbox.ymax >= ?
        ORDER BY id
        """,
        [str(stac_path), args.type, east, west, north, south],
    ).fetchall()
    assets = [
        {
            "id": str(row[0]),
            "collection": row[1],
            "url": row[2],
            "rowCount": int(row[3]) if row[3] is not None else None,
            "bbox": row[4],
        }
        for row in rows
    ]
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(assets, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return 0


def load_batch_requests(path_value: str) -> list[dict]:
    path = Path(path_value).resolve()
    if not path.is_file():
        raise SystemExit(f"Batch requests file does not exist: {path}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    requests = payload.get("requests") if isinstance(payload, dict) else payload
    if not isinstance(requests, list) or not requests:
        raise SystemExit("Batch requests must be a non-empty JSON array")
    seen: set[str] = set()
    normalized: list[dict] = []
    for index, request in enumerate(requests):
        if not isinstance(request, dict) or not str(request.get("baseId", "")).strip():
            raise SystemExit(f"Batch request {index + 1} requires baseId")
        base_id = str(request["baseId"])
        if base_id in seen:
            raise SystemExit(f"Duplicate batch baseId: {base_id}")
        seen.add(base_id)
        bbox_value = request.get("bbox")
        if isinstance(bbox_value, dict):
            bbox_text = ",".join(str(bbox_value[key]) for key in ("west", "south", "east", "north"))
        elif isinstance(bbox_value, list):
            bbox_text = ",".join(str(item) for item in bbox_value)
        else:
            bbox_text = str(bbox_value or "")
        normalized.append({"baseId": base_id, "bbox": parse_bbox(bbox_text)})
    return normalized


def resolve_assets_batch(args: argparse.Namespace) -> int:
    requests = load_batch_requests(args.requests)
    stac_path = Path(args.stac).resolve()
    if not stac_path.is_file():
        raise SystemExit(f"STAC index does not exist: {stac_path}")
    predicates: list[str] = []
    parameters: list[object] = [args.type]
    for request in requests:
        west, south, east, north = request["bbox"]
        predicates.append("(bbox.xmin <= ? AND bbox.xmax >= ? AND bbox.ymin <= ? AND bbox.ymax >= ?)")
        parameters.extend([east, west, north, south])
    database = connection(http_enabled=False)
    rows = database.execute(
        f"""
        SELECT id, collection, assets.aws.href AS url, num_rows, bbox
        FROM read_parquet(?)
        WHERE collection = ? AND ({' OR '.join(predicates)})
        ORDER BY id
        """,
        [str(stac_path), *parameters],
    ).fetchall()
    assets = [
        {
            "id": str(row[0]),
            "collection": row[1],
            "url": row[2],
            "rowCount": int(row[3]) if row[3] is not None else None,
            "bbox": row[4],
        }
        for row in rows
    ]
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(assets, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return 0


def validate_local_urls(urls: list[str]) -> None:
    if not urls:
        raise SystemExit("At least one localhost asset URL is required")
    for value in urls:
        url = urlparse(value)
        if url.scheme != "http" or url.hostname not in {"127.0.0.1", "localhost"} or not url.path.startswith("/assets/"):
            raise SystemExit(f"DuckDB may read only the local Overture range proxy: {value}")


def available_columns(database, parquet_expression: str) -> set[str]:
    return {row[0] for row in database.execute(f"DESCRIBE SELECT * FROM {parquet_expression}").fetchall()}


def optional(column_names: set[str], expression: str, column: str, alias: str | None = None) -> str:
    name = alias or column
    return f"{expression} AS {name}" if column in column_names else f"NULL AS {name}"


def place_query(parquet_expression: str, columns: set[str], bbox: tuple[float, float, float, float], row_limit: int | None = None) -> str:
    required = {"id", "names", "basic_category", "bbox"}
    missing = required - columns
    if missing:
        raise SystemExit(f"Pinned Overture place schema is missing required columns: {sorted(missing)}")
    west, south, east, north = bbox
    selections = [
        "id",
        "names.primary AS name",
        "basic_category",
        optional(columns, "confidence", "confidence"),
        optional(columns, "websites", "websites"),
        optional(columns, "addresses", "addresses"),
        optional(columns, "sources", "sources"),
        optional(columns, "taxonomy", "taxonomy"),
        optional(columns, "operating_status", "operating_status"),
        "bbox.xmin AS lon",
        "bbox.ymin AS lat",
    ]
    per_group_limit = int(row_limit or 50)
    categories = ",".join(sql_string(value) for value in TOURING_PLACE_CATEGORIES)
    order = "confidence DESC NULLS LAST, id" if "confidence" in columns else "id"
    group_case = "CASE " + " ".join(
        f"WHEN basic_category IN ({','.join(sql_string(value) for value in categories)}) THEN {sql_string(group)}"
        for group, categories in TOURING_PLACE_GROUPS.items()
    ) + " END"
    return f"""
        WITH ranked AS (
          SELECT {', '.join(selections)},
                 {group_case} AS reisslim_group,
                 ROW_NUMBER() OVER (PARTITION BY {group_case} ORDER BY {order}) AS reisslim_rank
          FROM {parquet_expression}
          WHERE bbox.xmin BETWEEN {west} AND {east}
            AND bbox.ymin BETWEEN {south} AND {north}
            AND basic_category IN ({categories})
        )
        SELECT * EXCLUDE (reisslim_group, reisslim_rank)
        FROM ranked
        WHERE reisslim_rank <= {per_group_limit}
        ORDER BY reisslim_group, reisslim_rank, id
    """


def segment_query(parquet_expression: str, columns: set[str], bbox: tuple[float, float, float, float], row_limit: int | None = None) -> str:
    required = {"id", "bbox"}
    missing = required - columns
    if missing:
        raise SystemExit(f"Pinned Overture segment schema is missing required columns: {sorted(missing)}")
    west, south, east, north = bbox
    selections = [
        "id",
        optional(columns, "subtype", "subtype"),
        optional(columns, '"class"', "class", "road_class"),
        optional(columns, "names", "names"),
        optional(columns, "routes", "routes"),
        optional(columns, "access_restrictions", "access_restrictions"),
        optional(columns, "road_surface", "road_surface"),
        optional(columns, "speed_limits", "speed_limits"),
        optional(columns, "sources", "sources"),
        "bbox",
    ]
    per_class_limit = int(row_limit or 25)
    motor_classes = ",".join(sql_string(value) for value in (
        "motorway", "trunk", "primary", "secondary", "tertiary",
        "residential", "unclassified", "service", "living_street", "track"
    ))
    road_filter = f'AND ("class" IN ({motor_classes}) OR subtype = \'ferry\')' if "class" in columns else ""
    evidence_order = []
    if "routes" in columns:
        evidence_order.append("CASE WHEN routes IS NULL OR len(routes) = 0 THEN 1 ELSE 0 END")
    if "road_surface" in columns:
        evidence_order.append("CASE WHEN road_surface IS NULL OR len(road_surface) = 0 THEN 1 ELSE 0 END")
    evidence_order.append("id")
    order = ", ".join(evidence_order)
    return f"""
        WITH ranked AS (
          SELECT {', '.join(selections)},
                 ROW_NUMBER() OVER (PARTITION BY "class" ORDER BY {order}) AS reisslim_rank
          FROM {parquet_expression}
          WHERE bbox.xmin <= {east} AND bbox.xmax >= {west}
            AND bbox.ymin <= {north} AND bbox.ymax >= {south}
            {road_filter}
        )
        SELECT * EXCLUDE (reisslim_rank)
        FROM ranked
        WHERE reisslim_rank <= {per_class_limit}
        ORDER BY road_class, reisslim_rank, id
    """


def batch_boxes_sql(requests: list[dict]) -> str:
    values = []
    for request in requests:
        west, south, east, north = request["bbox"]
        values.append(
            f"({sql_string(request['baseId'])},{west},{south},{east},{north})"
        )
    return "reisslim_boxes(base_id, west, south, east, north) AS (VALUES " + ",".join(values) + ")"


def place_batch_query(parquet_expression: str, columns: set[str], requests: list[dict], row_limit: int | None = None) -> str:
    required = {"id", "names", "basic_category", "bbox"}
    missing = required - columns
    if missing:
        raise SystemExit(f"Pinned Overture place schema is missing required columns: {sorted(missing)}")
    selections = [
        "p.id",
        "p.names.primary AS name",
        "p.basic_category",
        optional(columns, "p.confidence", "confidence"),
        optional(columns, "p.websites", "websites"),
        optional(columns, "p.addresses", "addresses"),
        optional(columns, "p.sources", "sources"),
        optional(columns, "p.taxonomy", "taxonomy"),
        optional(columns, "p.operating_status", "operating_status"),
        "p.bbox.xmin AS lon",
        "p.bbox.ymin AS lat",
    ]
    per_group_limit = int(row_limit or 50)
    categories = ",".join(sql_string(value) for value in TOURING_PLACE_CATEGORIES)
    group_case = "CASE " + " ".join(
        f"WHEN p.basic_category IN ({','.join(sql_string(value) for value in categories)}) THEN {sql_string(group)}"
        for group, categories in TOURING_PLACE_GROUPS.items()
    ) + " END"
    order = "p.confidence DESC NULLS LAST, p.id" if "confidence" in columns else "p.id"
    return f"""
        WITH {batch_boxes_sql(requests)},
        ranked AS (
          SELECT b.base_id, {', '.join(selections)},
                 {group_case} AS reisslim_group,
                 ROW_NUMBER() OVER (PARTITION BY b.base_id, {group_case} ORDER BY {order}) AS reisslim_rank
          FROM {parquet_expression} AS p
          JOIN reisslim_boxes AS b
            ON p.bbox.xmin BETWEEN b.west AND b.east
           AND p.bbox.ymin BETWEEN b.south AND b.north
          WHERE p.basic_category IN ({categories})
        )
        SELECT * EXCLUDE (reisslim_group, reisslim_rank)
        FROM ranked
        WHERE reisslim_rank <= {per_group_limit}
        ORDER BY base_id, reisslim_group, reisslim_rank, id
    """


def segment_batch_query(parquet_expression: str, columns: set[str], requests: list[dict], row_limit: int | None = None) -> str:
    required = {"id", "bbox"}
    missing = required - columns
    if missing:
        raise SystemExit(f"Pinned Overture segment schema is missing required columns: {sorted(missing)}")
    selections = [
        "p.id",
        optional(columns, "p.subtype", "subtype"),
        optional(columns, 'p."class"', "class", "road_class"),
        optional(columns, "p.names", "names"),
        optional(columns, "p.routes", "routes"),
        optional(columns, "p.access_restrictions", "access_restrictions"),
        optional(columns, "p.road_surface", "road_surface"),
        optional(columns, "p.speed_limits", "speed_limits"),
        optional(columns, "p.sources", "sources"),
        "p.bbox AS bbox",
    ]
    per_class_limit = int(row_limit or 25)
    motor_classes = ",".join(sql_string(value) for value in (
        "motorway", "trunk", "primary", "secondary", "tertiary",
        "residential", "unclassified", "service", "living_street", "track"
    ))
    road_filter = f'AND (p."class" IN ({motor_classes}) OR p.subtype = \'ferry\')' if "class" in columns else ""
    evidence_order = []
    if "routes" in columns:
        evidence_order.append("CASE WHEN p.routes IS NULL OR len(p.routes) = 0 THEN 1 ELSE 0 END")
    if "road_surface" in columns:
        evidence_order.append("CASE WHEN p.road_surface IS NULL OR len(p.road_surface) = 0 THEN 1 ELSE 0 END")
    evidence_order.append("p.id")
    order = ", ".join(evidence_order)
    partition = 'p."class"' if "class" in columns else "p.subtype"
    return f"""
        WITH {batch_boxes_sql(requests)},
        ranked AS (
          SELECT b.base_id, {', '.join(selections)},
                 ROW_NUMBER() OVER (PARTITION BY b.base_id, {partition} ORDER BY {order}) AS reisslim_rank
          FROM {parquet_expression} AS p
          JOIN reisslim_boxes AS b
            ON p.bbox.xmin <= b.east AND p.bbox.xmax >= b.west
           AND p.bbox.ymin <= b.north AND p.bbox.ymax >= b.south
          WHERE TRUE {road_filter}
        )
        SELECT * EXCLUDE (reisslim_rank)
        FROM ranked
        WHERE reisslim_rank <= {per_class_limit}
        ORDER BY base_id, road_class, reisslim_rank, id
    """


def json_safe(value):
    if isinstance(value, bytes):
        return {"encoding": "base64", "value": base64.b64encode(value).decode("ascii")}
    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(item) for item in value]
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def temporary_output_path(output: Path) -> Path:
    """Create an atomic-write path without leaking the Windows file handle."""
    descriptor, path = tempfile.mkstemp(
        prefix=f".{output.name}.", suffix=".tmp", dir=output.parent
    )
    os.close(descriptor)
    return Path(path)


def write_cursor(handle, cursor, *, base_id: str | None = None, base_id_column: bool = False, counts: dict[str, int] | None = None) -> int:
    names = [item[0] for item in cursor.description]
    count = 0
    while True:
        batch = cursor.fetchmany(5_000)
        if not batch:
            break
        for row in batch:
            record = dict(zip(names, row))
            effective_base_id = str(record.pop("base_id")) if base_id_column else base_id
            geometry = record.pop("geometry", None)
            if geometry is not None:
                encoded = json_safe(geometry)
                if isinstance(encoded, dict) and encoded.get("encoding") == "base64":
                    record["geometry_base64"] = encoded["value"]
                else:
                    record["geometry"] = encoded
            payload = {"baseId": effective_base_id, "record": record} if effective_base_id is not None else record
            handle.write(json.dumps(json_safe(payload), ensure_ascii=False, sort_keys=True) + "\n")
            if counts is not None and effective_base_id is not None:
                counts[effective_base_id] = counts.get(effective_base_id, 0) + 1
            count += 1
    return count


def extract(args: argparse.Namespace) -> int:
    validate_local_urls(args.url)
    bbox = parse_bbox(args.bbox)
    database = connection(http_enabled=True, extension_dir=args.extension_dir)
    parquet_expression = "read_parquet([" + ",".join(sql_string(url) for url in args.url) + "])"
    columns = available_columns(database, parquet_expression)
    query = place_query(parquet_expression, columns, bbox, args.row_limit) if args.type == "place" else segment_query(parquet_expression, columns, bbox, args.row_limit)
    cursor = database.execute(query)
    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = temporary_output_path(output)
    started = time.perf_counter()
    count = 0
    try:
        with temporary.open("w", encoding="utf-8", newline="\n") as handle:
            count = write_cursor(handle, cursor)
        os.replace(temporary, output)
    finally:
        if temporary.exists():
            temporary.unlink()
    print(json.dumps({"rows": count, "seconds": round(time.perf_counter() - started, 3), "type": args.type}), file=sys.stderr)
    return 0


def extract_batch(args: argparse.Namespace) -> int:
    validate_local_urls(args.url)
    requests = load_batch_requests(args.requests)
    database = connection(http_enabled=True, extension_dir=args.extension_dir)
    parquet_expression = "read_parquet([" + ",".join(sql_string(url) for url in args.url) + "])"
    columns = available_columns(database, parquet_expression)
    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = temporary_output_path(output)
    started = time.perf_counter()
    total = 0
    counts: dict[str, int] = {}
    try:
        with temporary.open("w", encoding="utf-8", newline="\n") as handle:
            for request in requests:
                query = (
                    place_query(parquet_expression, columns, request["bbox"], args.row_limit)
                    if args.type == "place"
                    else segment_query(parquet_expression, columns, request["bbox"], args.row_limit)
                )
                cursor = database.execute(query)
                count = write_cursor(handle, cursor, base_id=request["baseId"])
                counts[request["baseId"]] = count
                total += count
        os.replace(temporary, output)
    finally:
        if temporary.exists():
            temporary.unlink()
    print(json.dumps({
        "rows": total,
        "bases": len(requests),
        "rowsByBase": counts,
        "seconds": round(time.perf_counter() - started, 3),
        "type": args.type,
    }, sort_keys=True), file=sys.stderr)
    return 0


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(dest="command", required=True)
    resolve = commands.add_parser("resolve-assets", help="Resolve bbox-intersecting assets from a local STAC Parquet index")
    resolve.add_argument("--stac", required=True)
    resolve.add_argument("--bbox", required=True)
    resolve.add_argument("--type", choices=["place", "segment"], required=True)
    resolve.add_argument("--output", required=True)
    resolve.set_defaults(handler=resolve_assets)
    resolve_batch = commands.add_parser("resolve-assets-batch", help="Resolve the union asset set for multiple base bboxes")
    resolve_batch.add_argument("--stac", required=True)
    resolve_batch.add_argument("--requests", required=True)
    resolve_batch.add_argument("--type", choices=["place", "segment"], required=True)
    resolve_batch.add_argument("--output", required=True)
    resolve_batch.set_defaults(handler=resolve_assets_batch)
    extract_command = commands.add_parser("extract", help="Extract projected bbox rows through the localhost range proxy")
    extract_command.add_argument("--url", action="append", required=True)
    extract_command.add_argument("--bbox", required=True)
    extract_command.add_argument("--type", choices=["place", "segment"], required=True)
    extract_command.add_argument("--output", required=True)
    extract_command.add_argument("--extension-dir")
    extract_command.add_argument("--row-limit", type=int, default=50_000)
    extract_command.set_defaults(handler=extract)
    extract_batch_command = commands.add_parser("extract-batch", help="Extract many base bboxes with one DuckDB connection")
    extract_batch_command.add_argument("--url", action="append", required=True)
    extract_batch_command.add_argument("--requests", required=True)
    extract_batch_command.add_argument("--type", choices=["place", "segment"], required=True)
    extract_batch_command.add_argument("--output", required=True)
    extract_batch_command.add_argument("--extension-dir")
    extract_batch_command.add_argument("--row-limit", type=int, default=50_000)
    extract_batch_command.set_defaults(handler=extract_batch)
    return root


def main() -> int:
    arguments = parser().parse_args()
    return arguments.handler(arguments)


if __name__ == "__main__":
    raise SystemExit(main())
