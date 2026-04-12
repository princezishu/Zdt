#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import textwrap
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from xml.sax.saxutils import escape as xml_escape


PROJECT_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_MD = PROJECT_ROOT / "PROJECT_MASTER_HANDBOOK.md"
OUTPUT_DOCX = PROJECT_ROOT / "PROJECT_MASTER_HANDBOOK.docx"

EXCLUDED_DIRS = {
    ".git",
    "node_modules",
    "dist",
    "build",
    "coverage",
    ".next",
    ".cache",
    "__pycache__",
    ".idea",
    ".vscode",
    "uploads",
    "private_uploads",
}

SOURCE_EXTENSIONS = {
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".json",
    ".md",
    ".sql",
    ".mjs",
    ".cjs",
    ".css",
    ".scss",
    ".yml",
    ".yaml",
    ".txt",
    ".env",
}

BINARY_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".svg",
    ".ico",
    ".pdf",
    ".pptx",
    ".ppt",
    ".zip",
    ".rar",
    ".7z",
    ".mp4",
    ".mov",
    ".avi",
    ".mp3",
    ".wav",
    ".woff",
    ".woff2",
    ".ttf",
    ".otf",
    ".eot",
    ".psd",
    ".ai",
    ".sketch",
    ".exe",
    ".dll",
    ".bin",
}

API_METHODS = ("get", "post", "put", "patch", "delete", "options", "head")


@dataclass
class RouteEndpoint:
    router: str
    method: str
    path: str


@dataclass
class RouterDefinition:
    endpoints: list[RouteEndpoint]
    subrouter_uses: list[tuple[str, str]]


def rel(path: Path) -> str:
    return path.relative_to(PROJECT_ROOT).as_posix()


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def normalize_path(path: str) -> str:
    value = re.sub(r"/{2,}", "/", str(path or "").strip())
    if not value:
        return "/"
    if not value.startswith("/"):
        value = f"/{value}"
    if len(value) > 1 and value.endswith("/"):
        value = value[:-1]
    return value


def join_paths(prefix: str, suffix: str) -> str:
    left = normalize_path(prefix or "/")
    right = normalize_path(suffix or "/")
    if right == "/":
        return left
    if left == "/":
        return right
    return normalize_path(f"{left.rstrip('/')}/{right.lstrip('/')}")


def title_from_token(value: str) -> str:
    text = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", value)
    text = text.replace("_", " ").replace("-", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text.title()


def safe_literal(value: str) -> str:
    if len(value) > 80:
        return f"{value[:77]}..."
    return value


def scan_source_inventory(root: Path) -> dict:
    files_scanned = 0
    top_level_counter: Counter[str] = Counter()
    extension_counter: Counter[str] = Counter()
    binary_counter: Counter[str] = Counter()
    skipped_dirs: set[str] = set()
    binary_samples: list[str] = []

    for current_root, dirnames, filenames in os.walk(root):
        current = Path(current_root)
        filtered = []
        for dirname in dirnames:
            if dirname in EXCLUDED_DIRS:
                skipped_dirs.add(dirname)
                continue
            filtered.append(dirname)
        dirnames[:] = filtered

        for filename in filenames:
            path = current / filename
            extension = path.suffix.lower()
            relative = rel(path)
            top_level = relative.split("/", 1)[0]
            if extension in BINARY_EXTENSIONS:
                binary_counter[extension or "(none)"] += 1
                if len(binary_samples) < 40:
                    binary_samples.append(relative)
                continue
            if extension not in SOURCE_EXTENSIONS and path.name not in {
                ".env.example",
                "Dockerfile",
                "README",
                "README.md",
            }:
                continue
            files_scanned += 1
            top_level_counter[top_level] += 1
            extension_counter[extension or "(none)"] += 1

    return {
        "files_scanned": files_scanned,
        "top_level_counter": top_level_counter,
        "extension_counter": extension_counter,
        "binary_counter": binary_counter,
        "binary_samples": sorted(binary_samples),
        "skipped_dirs": sorted(skipped_dirs),
    }


def parse_package_json(path: Path) -> dict:
    payload = json.loads(read_text(path))
    return {
        "name": payload.get("name") or path.parent.name,
        "scripts": payload.get("scripts") or {},
        "dependencies": payload.get("dependencies") or {},
        "devDependencies": payload.get("devDependencies") or {},
    }


def classify_dependency(name: str) -> tuple[str, str]:
    checks = [
        (r"^(react|react-dom)$", "Frontend Runtime", "UI rendering and component lifecycle."),
        (r"^react-router-dom$", "Routing", "Declarative client-side navigation."),
        (r"^@radix-ui/", "UI Primitives", "Accessible headless components."),
        (r"(tailwind|autoprefixer|postcss)", "Styling", "Utility-first styling pipeline."),
        (r"^@react-google-maps/api$", "Maps", "Google Maps embedding and controls."),
        (r"^socket\.io(-client)?$", "Realtime", "Bidirectional websocket-style communication."),
        (r"^(zod|@hookform/resolvers|react-hook-form)$", "Validation and Forms", "Schema-driven input validation."),
        (r"^(recharts|embla-carousel-react|gsap|@gsap/react)$", "Visualization and Motion", "Charts, carousels, and animation."),
        (r"^@supabase/supabase-js$", "Managed Auth", "Supabase identity integration."),
        (r"^(vite|@vitejs/plugin-react)$", "Build Tooling", "Dev server and production build."),
        (r"^typescript$", "Type System", "Static typing for maintainability."),
        (r"^express$", "Backend HTTP", "REST server and middleware composition."),
        (r"^(pg)$", "Database", "PostgreSQL driver."),
        (r"^(jsonwebtoken|jose|bcryptjs)$", "Security/Auth", "JWT verification and password hashing."),
        (r"^(helmet|cors|compression|morgan)$", "HTTP Security/Perf", "Headers, CORS, compression, request logs."),
        (r"^(nodemailer|twilio)$", "Communication", "Email and SMS delivery."),
        (r"^(bullmq|ioredis)$", "Queueing", "Redis-backed background jobs."),
        (r"^node-cron$", "Scheduling", "Cron-based recurring tasks."),
        (r"^(rss-parser|fast-xml-parser|undici)$", "Ingestion/HTTP", "External feed parsing and robust fetch."),
        (r"^multer$", "Uploads", "Multipart file handling."),
        (r"^playwright$", "Automation", "Headless browser screenshots and rendering."),
        (r"^pptxgenjs$", "Presentation Export", "Programmatic pitch deck generation."),
    ]
    for pattern, category, reason in checks:
        if re.search(pattern, name):
            return category, reason
    return "Utility", "General-purpose helper library."


def summarize_dependencies(package_data: dict) -> dict:
    summary: dict[str, dict[str, list[tuple[str, str]]]] = {}
    for workspace, payload in package_data.items():
        grouped_runtime: dict[str, list[tuple[str, str]]] = defaultdict(list)
        grouped_dev: dict[str, list[tuple[str, str]]] = defaultdict(list)

        for dep_name in sorted(payload["dependencies"]):
            category, reason = classify_dependency(dep_name)
            grouped_runtime[category].append((dep_name, reason))

        for dep_name in sorted(payload["devDependencies"]):
            category, reason = classify_dependency(dep_name)
            grouped_dev[category].append((dep_name, reason))

        summary[workspace] = {
            "runtime": dict(sorted(grouped_runtime.items())),
            "dev": dict(sorted(grouped_dev.items())),
        }
    return summary


def parse_app_views(path: Path) -> list[str]:
    text = read_text(path)
    return re.findall(r"'([^']+)'", text)


def parse_app_lazy_imports(app_text: str) -> dict[str, str]:
    lazy_pattern = re.compile(
        r"const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*lazy\(\(\)\s*=>\s*import\('([^']+)'\)\);"
    )
    mapping: dict[str, str] = {}
    for component, import_path in lazy_pattern.findall(app_text):
        mapping[component] = import_path
    return mapping


def parse_app_static_routes(app_text: str) -> list[tuple[str, str]]:
    pattern = re.compile(
        r"if\s*\(\s*normalized\s*===\s*'([^']+)'\s*\)\s*\{\s*return\s*\{\s*view:\s*'([^']+)'",
        re.S,
    )
    seen = set()
    output: list[tuple[str, str]] = []
    for path_value, view in pattern.findall(app_text):
        key = (path_value, view)
        if key in seen:
            continue
        seen.add(key)
        output.append(key)
    return output


def parse_app_dynamic_routes(app_text: str) -> list[tuple[str, str]]:
    pattern = re.compile(
        r"const\s+[A-Za-z_][A-Za-z0-9_]*\s*=\s*(/[^;]+/)\.exec\(normalized\);\s*if\s*\([^)]+\)\s*\{\s*return\s*\{\s*view:\s*'([^']+)'",
        re.S,
    )
    seen = set()
    output: list[tuple[str, str]] = []
    for matcher, view in pattern.findall(app_text):
        key = (matcher, view)
        if key in seen:
            continue
        seen.add(key)
        output.append(key)
    return output


def parse_view_component_map(app_text: str) -> dict[str, str]:
    pattern = re.compile(
        r"currentView\s*===\s*'([^']+)'\s*&&[\s\S]{0,800}?<([A-Z][A-Za-z0-9_]*)\b",
        re.S,
    )
    mapping: dict[str, str] = {}
    for view, component in pattern.findall(app_text):
        mapping.setdefault(view, component)
    return mapping


def parse_module_exports(path: Path) -> list[str]:
    text = read_text(path)
    export_patterns = [
        re.compile(r"export\s+(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)"),
        re.compile(r"export\s+const\s+([A-Za-z_][A-Za-z0-9_]*)"),
        re.compile(r"export\s+class\s+([A-Za-z_][A-Za-z0-9_]*)"),
        re.compile(r"export\s+type\s+([A-Za-z_][A-Za-z0-9_]*)"),
        re.compile(r"export\s+interface\s+([A-Za-z_][A-Za-z0-9_]*)"),
    ]
    exports: list[str] = []
    seen = set()
    for pattern in export_patterns:
        for name in pattern.findall(text):
            if name in seen:
                continue
            seen.add(name)
            exports.append(name)
    return exports


def collect_frontend_sections(sections_root: Path) -> dict[str, list[str]]:
    grouped: dict[str, list[str]] = defaultdict(list)
    for path in sorted(sections_root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in {".tsx", ".ts", ".scss", ".css"}:
            continue
        relative = path.relative_to(sections_root).as_posix()
        parts = relative.split("/")
        group = parts[0] if len(parts) > 1 else "(root)"
        grouped[group].append(relative)
    return dict(sorted(grouped.items()))


def collect_frontend_lib_inventory(lib_root: Path) -> list[dict]:
    output = []
    for path in sorted(lib_root.glob("*")):
        if not path.is_file() or path.suffix.lower() not in {".ts", ".tsx", ".js"}:
            continue
        exports = parse_module_exports(path)
        output.append(
            {
                "path": rel(path),
                "exports": exports,
            }
        )
    return output


def extract_api_literals(text: str) -> list[str]:
    literals: list[str] = []
    patterns = [
        re.compile(r"apiRequest(?:<[\s\S]*?>)?\(\s*(['\"`])([^'\"`]+)\1"),
        re.compile(r"fetch\(\s*(['\"`])([^'\"`]+)\1"),
    ]
    for pattern in patterns:
        for _, value in pattern.findall(text):
            candidate = value.strip()
            if not candidate:
                continue
            if candidate.startswith("/") or candidate.startswith("http"):
                literals.append(candidate)
    seen = set()
    unique_values = []
    for value in literals:
        if value in seen:
            continue
        seen.add(value)
        unique_values.append(value)
    return unique_values


def collect_frontend_api_usage(files: Iterable[Path]) -> dict[str, list[str]]:
    mapping: dict[str, list[str]] = {}
    for file_path in sorted(files):
        if not file_path.is_file():
            continue
        if file_path.suffix.lower() not in {".ts", ".tsx", ".js", ".jsx"}:
            continue
        values = extract_api_literals(read_text(file_path))
        if values:
            mapping[rel(file_path)] = values
    return mapping


def parse_index_route_mounts(index_text: str) -> dict:
    const_pattern = re.compile(r"const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(['\"`])([^'\"`]+)\2\s*;")
    constants = {name: value for name, _, value in const_pattern.findall(index_text)}

    import_pattern = re.compile(
        r"^import\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:,\s*\{[\s\S]*?\})?\s*from\s*['\"]\.\/routes\/([^'\"]+)\.js['\"];",
        re.M,
    )
    variable_to_module: dict[str, str] = {}
    module_to_variable: dict[str, str] = {}
    for variable, module_name in import_pattern.findall(index_text):
        variable_to_module[variable] = module_name
        module_to_variable[module_name] = variable

    mount_pattern = re.compile(
        r"app\.use\(\s*([^,]+?)\s*,\s*([A-Za-z_][A-Za-z0-9_]*)\s*\);"
    )

    def resolve_mount(expr: str) -> str:
        value = expr.strip()
        if value in constants:
            return normalize_path(constants[value])
        if (value.startswith("'") and value.endswith("'")) or (
            value.startswith('"') and value.endswith('"')
        ):
            return normalize_path(value[1:-1])
        if value.startswith("`") and value.endswith("`"):
            template = value[1:-1]

            def replace_var(match: re.Match) -> str:
                var_name = match.group(1)
                return constants.get(var_name, match.group(0))

            rendered = re.sub(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}", replace_var, template)
            return normalize_path(rendered)
        return normalize_path(value)

    module_mounts: dict[str, list[str]] = defaultdict(list)
    for prefix_expr, variable in mount_pattern.findall(index_text):
        module_name = variable_to_module.get(variable)
        if not module_name:
            continue
        mount_prefix = resolve_mount(prefix_expr)
        if mount_prefix not in module_mounts[module_name]:
            module_mounts[module_name].append(mount_prefix)

    return {
        "constants": constants,
        "variable_to_module": variable_to_module,
        "module_to_variable": module_to_variable,
        "module_mounts": dict(sorted(module_mounts.items())),
    }


def parse_route_file(path: Path) -> tuple[str, dict[str, RouterDefinition]]:
    text = read_text(path)

    default_export_match = re.search(r"export\s+default\s+([A-Za-z_][A-Za-z0-9_]*)\s*;", text)
    default_router = default_export_match.group(1) if default_export_match else "router"

    router_names = set()
    for pattern in (
        re.compile(r"const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*express\.Router\(\s*\)\s*;"),
        re.compile(r"const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*Router\(\s*\)\s*;"),
    ):
        for name in pattern.findall(text):
            router_names.add(name)
    router_names.add(default_router)

    routers: dict[str, RouterDefinition] = {
        name: RouterDefinition(endpoints=[], subrouter_uses=[]) for name in sorted(router_names)
    }

    endpoint_pattern = re.compile(
        r"([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*(" + "|".join(API_METHODS) + r")\s*\(\s*('[^']*'|\"[^\"]*\"|`[^`]*`)",
        re.S,
    )
    for router_name, method, raw_path in endpoint_pattern.findall(text):
        if router_name not in routers:
            routers[router_name] = RouterDefinition(endpoints=[], subrouter_uses=[])
        local_path = raw_path[1:-1]
        routers[router_name].endpoints.append(
            RouteEndpoint(router=router_name, method=method.upper(), path=normalize_path(local_path))
        )

    subrouter_pattern = re.compile(
        r"([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*use\(\s*('[^']*'|\"[^\"]*\"|`[^`]*`)\s*,\s*([A-Za-z_][A-Za-z0-9_]*)",
        re.S,
    )
    for router_name, raw_path, target_router in subrouter_pattern.findall(text):
        if router_name not in routers:
            routers[router_name] = RouterDefinition(endpoints=[], subrouter_uses=[])
        routers[router_name].subrouter_uses.append((normalize_path(raw_path[1:-1]), target_router))

    return default_router, routers


def flatten_router_endpoints(
    routers: dict[str, RouterDefinition], root_router: str
) -> list[dict]:
    flattened: list[dict] = []
    visited: set[tuple[str, str]] = set()

    def walk(router_name: str, base_path: str) -> None:
        visit_key = (router_name, base_path)
        if visit_key in visited:
            return
        visited.add(visit_key)
        router_data = routers.get(router_name)
        if not router_data:
            return

        for endpoint in router_data.endpoints:
            absolute = join_paths(base_path, endpoint.path)
            flattened.append(
                {
                    "router": router_name,
                    "method": endpoint.method,
                    "path": absolute,
                }
            )

        for local_mount, child_router in router_data.subrouter_uses:
            if child_router not in routers:
                continue
            walk(child_router, join_paths(base_path, local_mount))

    walk(root_router, "/")

    deduped = []
    seen = set()
    for item in flattened:
        key = (item["method"], item["path"], item["router"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    deduped.sort(key=lambda value: (value["path"], value["method"]))
    return deduped


def collect_backend_route_inventory(routes_root: Path, mount_data: dict) -> dict:
    module_mounts: dict[str, list[str]] = mount_data["module_mounts"]
    route_files = sorted(path for path in routes_root.glob("*.js") if path.is_file())

    module_inventory: dict[str, dict] = {}

    for path in route_files:
        module_name = path.stem
        default_router, routers = parse_route_file(path)
        local_flattened = flatten_router_endpoints(routers, default_router)
        mounts = module_mounts.get(module_name, [])
        preferred_mount = ""
        if mounts:
            preferred_mount = next((mount for mount in mounts if mount.startswith("/api/v1")), mounts[0])

        mounted_endpoints: list[dict] = []
        for endpoint in local_flattened:
            for mount in mounts or ["/"]:
                mounted_endpoints.append(
                    {
                        "method": endpoint["method"],
                        "path": join_paths(mount, endpoint["path"]),
                        "router": endpoint["router"],
                    }
                )

        mounted_unique = []
        seen = set()
        for endpoint in mounted_endpoints:
            key = (endpoint["method"], endpoint["path"])
            if key in seen:
                continue
            seen.add(key)
            mounted_unique.append(endpoint)

        canonical_endpoints = []
        if preferred_mount:
            for endpoint in local_flattened:
                canonical_endpoints.append(
                    {
                        "method": endpoint["method"],
                        "path": join_paths(preferred_mount, endpoint["path"]),
                    }
                )
        else:
            canonical_endpoints = [{"method": endpoint["method"], "path": endpoint["path"]} for endpoint in local_flattened]

        dedup_canonical = []
        seen_canonical = set()
        for endpoint in canonical_endpoints:
            key = (endpoint["method"], endpoint["path"])
            if key in seen_canonical:
                continue
            seen_canonical.add(key)
            dedup_canonical.append(endpoint)

        module_inventory[module_name] = {
            "file": rel(path),
            "default_router": default_router,
            "routers": routers,
            "mounts": mounts,
            "preferred_mount": preferred_mount,
            "canonical_endpoints": sorted(dedup_canonical, key=lambda item: (item["path"], item["method"])),
            "all_mounted_endpoints": sorted(mounted_unique, key=lambda item: (item["path"], item["method"])),
        }

    mounted_modules = set(module_mounts)
    route_modules = {path.stem for path in route_files}
    unmounted_modules = sorted(route_modules - mounted_modules)
    unknown_mounted_modules = sorted(mounted_modules - route_modules)

    return {
        "route_files": [rel(path) for path in route_files],
        "module_inventory": dict(sorted(module_inventory.items())),
        "unmounted_modules": unmounted_modules,
        "unknown_mounted_modules": unknown_mounted_modules,
    }


def parse_db_ensure_tables(db_path: Path) -> dict:
    text = read_text(db_path)
    ensure_pattern = re.compile(
        r"export\s+async\s+function\s+(ensure[A-Za-z0-9_]+)\s*\([^)]*\)\s*\{([\s\S]*?)(?=^export\s+async\s+function\s+ensure|\Z)",
        re.M,
    )
    table_pattern = re.compile(
        r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)",
        re.I,
    )

    ensure_map: dict[str, list[str]] = {}
    for ensure_name, block in ensure_pattern.findall(text):
        tables = []
        for table_name in table_pattern.findall(block):
            if table_name not in tables:
                tables.append(table_name)
        ensure_map[ensure_name] = tables

    return dict(sorted(ensure_map.items()))


def parse_startup_ensure_order(index_path: Path) -> list[str]:
    text = read_text(index_path)
    return re.findall(r"await\s+(ensure[A-Za-z0-9_]+)\s*\(", text)


def parse_migrations(migrations_root: Path) -> list[dict]:
    output = []
    for path in sorted(p for p in migrations_root.iterdir() if p.is_file()):
        entry: dict = {
            "file": rel(path),
            "name": path.name,
            "kind": path.suffix.lower(),
            "date": "",
            "summary": "",
            "tables_created": [],
            "tables_altered": [],
        }

        date_match = re.match(r"(\d{8})_(.+)\.sql$", path.name)
        if date_match:
            raw_date = date_match.group(1)
            try:
                parsed_date = datetime.strptime(raw_date, "%Y%m%d")
                entry["date"] = parsed_date.strftime("%Y-%m-%d")
            except ValueError:
                entry["date"] = raw_date
            entry["summary"] = title_from_token(date_match.group(2))
        else:
            entry["summary"] = title_from_token(path.stem)

        if path.suffix.lower() == ".sql":
            text = read_text(path)
            created = re.findall(
                r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)",
                text,
                re.I,
            )
            altered = re.findall(
                r"ALTER\s+TABLE(?:\s+IF\s+EXISTS)?\s+([a-zA-Z_][a-zA-Z0-9_]*)",
                text,
                re.I,
            )
            seen_created = set()
            for table_name in created:
                if table_name in seen_created:
                    continue
                seen_created.add(table_name)
                entry["tables_created"].append(table_name)
            seen_altered = set()
            for table_name in altered:
                if table_name in seen_altered:
                    continue
                seen_altered.add(table_name)
                entry["tables_altered"].append(table_name)
        output.append(entry)
    return output


def parse_env_example(path: Path) -> list[dict]:
    lines = read_text(path).splitlines()
    output: list[dict] = []
    pending_comments: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            pending_comments = []
            continue
        if stripped.startswith("#"):
            pending_comments.append(stripped.lstrip("#").strip())
            continue
        if "=" not in line:
            pending_comments = []
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not re.fullmatch(r"[A-Z0-9_]+", key):
            pending_comments = []
            continue
        output.append(
            {
                "key": key,
                "value": value,
                "comment": " ".join(pending_comments).strip(),
            }
        )
        pending_comments = []
    return output


def env_group(key: str) -> str:
    if key.startswith("VITE_"):
        return "Frontend (Vite)"
    if key.startswith("DB_"):
        return "Database"
    if key.startswith("INFRA_"):
        return "Infrastructure Ingest"
    if key.startswith("SUPABASE_"):
        return "Managed Auth (Supabase)"
    if key.startswith("MANAGED_AUTH_"):
        return "Managed Auth"
    if key.startswith("REDIS_") or key.startswith("RATE_LIMIT_") or key.startswith("ENABLE_REDIS_"):
        return "Queue and Rate Limit"
    if key.startswith("SMTP_") or key.startswith("TWILIO_"):
        return "Communication (Email/SMS)"
    if key.startswith("OPENAI_") or key.startswith("GEMINI_") or key.startswith("MARKET_API_"):
        return "AI and Market Data"
    if key.startswith("MEDIA_") or key.startswith("PRIVATE_UPLOADS_"):
        return "Media and Uploads"
    if key.startswith("APARTMENT_"):
        return "Apartment Automation"
    if key in {"JWT_SECRET", "ADMIN_TOKEN", "FORCE_HTTPS", "TRUST_PROXY", "CORS_ORIGIN", "HOST", "PORT"}:
        return "Server Core/Security"
    return "General"


def env_purpose(key: str, comment: str) -> str:
    if comment:
        return comment
    rules = [
        (r"API_URL|API_VERSION_PREFIX", "API base URL and API versioning."),
        (r"SUPABASE", "Supabase managed authentication configuration."),
        (r"GOOGLE_MAPS", "Google Maps client key."),
        (r"WHATSAPP", "WhatsApp contact or prefilled message settings."),
        (r"DB_", "PostgreSQL connection and TLS settings."),
        (r"JWT_SECRET", "JWT signing secret."),
        (r"ADMIN_TOKEN", "Bootstrap admin token."),
        (r"CORS_ORIGIN", "Allowed frontend origins."),
        (r"TRUST_PROXY|FORCE_HTTPS", "Proxy and HTTPS enforcement."),
        (r"REDIS|RATE_LIMIT|QUEUE", "Redis queue and distributed rate limiting."),
        (r"ENABLE_INGEST|INFRA_", "Infrastructure ingest scheduling and source controls."),
        (r"SMTP_", "SMTP transport for email OTP/newsletter."),
        (r"TWILIO_", "Twilio SMS OTP delivery."),
        (r"OPENAI|GEMINI", "AI assistant model/provider configuration."),
        (r"MARKET_API", "Optional market data provider credentials."),
        (r"MEDIA_|UPLOAD", "Signed media URLs and upload root."),
        (r"APARTMENT_", "Apartment rent alerts and penalties."),
    ]
    for pattern, explanation in rules:
        if re.search(pattern, key):
            return explanation
    return "Configuration toggle or default runtime value."


CONCEPT_PATTERNS: dict[str, list[str]] = {
    "Authentication": ["requireauth", "login", "jwt", "token", "session", "otp", "password"],
    "Authorization/RBAC": ["requirepermission", "requirerole", "role_permissions", "user_roles", "main_admin"],
    "Validation": ["zod", "schema", "parse(", "safeparse"],
    "Rate Limiting": ["ratelimit", "429", "createratelimiter"],
    "Realtime": ["socket.io", "chatrealtime", "io("],
    "Queue/Async Jobs": ["bullmq", "enqueue", "queue", "worker"],
    "Scheduler/Cron": ["cron.schedule", "setinterval", "scheduler", "job"],
    "Database Access": ["pool.query", "select ", "insert ", "update ", "delete from"],
    "File/Media Handling": ["multer", "upload", "media", "signed"],
    "AI Integration": ["openai", "gemini", "ai assistant", "ai"],
    "Maps/Geo": ["google", "nominatim", "geo", "location"],
    "Notifications": ["twilio", "smtp", "nodemailer", "whatsapp", "notification"],
    "Analytics/Insights": ["analytics", "insights", "track", "market"],
}


def detect_concepts(path: Path) -> list[str]:
    text = read_text(path).lower()
    concepts = []
    for concept, needles in CONCEPT_PATTERNS.items():
        if any(needle.lower() in text for needle in needles):
            concepts.append(concept)
    return concepts


def build_concept_matrix(files: Iterable[Path]) -> list[dict]:
    output = []
    for path in sorted(files):
        if not path.is_file():
            continue
        if path.suffix.lower() not in {".js", ".ts", ".tsx"}:
            continue
        concepts = detect_concepts(path)
        if not concepts:
            continue
        output.append({"file": rel(path), "concepts": concepts})
    return output


def find_keyword_files(root_dirs: list[Path], keywords: list[str], limit: int = 8) -> list[str]:
    matches: list[str] = []
    keyword_lower = [keyword.lower() for keyword in keywords]
    for root in root_dirs:
        if not root.exists():
            continue
        for path in sorted(root.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in {".js", ".ts", ".tsx", ".env", ".example"}:
                continue
            candidate = read_text(path).lower()
            if any(keyword in candidate for keyword in keyword_lower):
                matches.append(rel(path))
                if len(matches) >= limit:
                    return matches
    return matches


def detect_integrations() -> dict[str, dict]:
    lookup_roots = [
        PROJECT_ROOT / "app" / "src",
        PROJECT_ROOT / "server" / "src",
        PROJECT_ROOT / "app",
        PROJECT_ROOT / "server",
    ]
    integration_specs = {
        "Supabase": {
            "keywords": ["supabase", "managedauth", "managed_auth"],
            "env_keys": ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "SUPABASE_PROJECT_URL", "SUPABASE_JWKS_URL"],
            "reason": "Managed identity provider for login/password reset/OAuth bridge.",
        },
        "Google Maps": {
            "keywords": ["google maps", "@react-google-maps/api", "vite_google_maps_api_key"],
            "env_keys": ["VITE_GOOGLE_MAPS_API_KEY"],
            "reason": "Map rendering and location-based property discovery.",
        },
        "OpenAI": {
            "keywords": ["openai", "chat/completions"],
            "env_keys": ["OPENAI_API_KEY", "OPENAI_CHAT_MODEL"],
            "reason": "Primary LLM response path for AI assistant route.",
        },
        "Gemini": {
            "keywords": ["gemini", "generativelanguage.googleapis.com"],
            "env_keys": ["GEMINI_API_KEY", "GEMINI_MODEL"],
            "reason": "Fallback/alternative LLM provider for AI assistant route.",
        },
        "Twilio": {
            "keywords": ["twilio", "sms", "otp"],
            "env_keys": ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER"],
            "reason": "SMS OTP delivery for auth flows.",
        },
        "SMTP/Nodemailer": {
            "keywords": ["smtp", "nodemailer", "newsletter", "email"],
            "env_keys": ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"],
            "reason": "Email OTP and newsletter dispatch.",
        },
        "NSE": {
            "keywords": ["nseindia", "nifty realty", "invest/realty-stock-signals"],
            "env_keys": [],
            "reason": "Live realty stock signal feed for invest section.",
        },
        "OSM/Nominatim": {
            "keywords": ["nominatim.openstreetmap.org", "openstreetmap"],
            "env_keys": [],
            "reason": "Reverse geocoding for location suggestion enrichment.",
        },
    }

    result: dict[str, dict] = {}
    for name, spec in integration_specs.items():
        files = find_keyword_files(lookup_roots, spec["keywords"], limit=12)
        result[name] = {
            "files": files,
            "env_keys": spec["env_keys"],
            "reason": spec["reason"],
        }
    return result


def collect_backend_misc_inventory() -> dict:
    root = PROJECT_ROOT / "server" / "src"
    folders = {
        "controllers": sorted(rel(path) for path in (root / "controllers").glob("*.js")),
        "middleware": sorted(rel(path) for path in (root / "middleware").glob("*.js")),
        "services": sorted(rel(path) for path in (root / "services").rglob("*.js")),
        "jobs": sorted(rel(path) for path in (root / "jobs").glob("*.js")),
        "utils": sorted(rel(path) for path in (root / "utils").glob("*.js")),
    }
    return folders


def collect_binary_artifact_summary() -> dict:
    counter: Counter[str] = Counter()
    notable: list[str] = []
    for current_root, dirnames, filenames in os.walk(PROJECT_ROOT):
        current = Path(current_root)
        filtered = []
        for dirname in dirnames:
            if dirname in EXCLUDED_DIRS:
                continue
            filtered.append(dirname)
        dirnames[:] = filtered

        for filename in filenames:
            path = current / filename
            extension = path.suffix.lower()
            if extension not in BINARY_EXTENSIONS:
                continue
            counter[extension] += 1
            path_rel = rel(path)
            if (
                len(notable) < 40
                and any(path_rel.startswith(prefix) for prefix in ("docs/", "images/", "server/data/", "server/uploads/"))
            ):
                notable.append(path_rel)
    return {
        "counter": counter,
        "notable": sorted(notable),
    }


def collect_runtime_flow_facts(index_text: str) -> dict:
    facts = {
        "has_helmet": "helmet(" in index_text,
        "has_cors": "cors(" in index_text,
        "has_morgan": "morgan(" in index_text,
        "has_compression": "compression(" in index_text,
        "has_json_limit": "express.json({ limit:" in index_text,
        "has_health_route": "app.get('/health'" in index_text,
        "has_error_handler": "app.use((err, req, res, next)" in index_text,
        "has_socketio": "initializeChatRealtime(" in index_text,
        "has_cron": "cron.schedule(" in index_text,
        "has_queue": "initializeQueueSystem(" in index_text,
    }
    return facts


def evaluate_coverage(
    backend_routes: dict,
    mount_data: dict,
    frontend_static_routes: list[tuple[str, str]],
    frontend_dynamic_routes: list[tuple[str, str]],
    view_components: dict[str, str],
    db_ensure_map: dict,
    migrations: list[dict],
    app_env_vars: list[dict],
    server_env_vars: list[dict],
) -> list[dict]:
    route_files = {Path(path).stem for path in backend_routes["route_files"]}
    mounted_modules = set(mount_data["module_mounts"])
    checks = [
        {
            "name": "All backend route modules included",
            "ok": route_files.issubset(mounted_modules),
            "detail": f"route_files={len(route_files)}, mounted_modules={len(mounted_modules)}",
        },
        {
            "name": "Mounted prefixes captured",
            "ok": all(backend_routes["module_inventory"][module]["mounts"] for module in backend_routes["module_inventory"]),
            "detail": f"modules_with_mounts={sum(1 for module in backend_routes['module_inventory'].values() if module['mounts'])}",
        },
        {
            "name": "Frontend route/view mappings captured",
            "ok": bool(frontend_static_routes or frontend_dynamic_routes) and bool(view_components),
            "detail": f"static={len(frontend_static_routes)}, dynamic={len(frontend_dynamic_routes)}, components={len(view_components)}",
        },
        {
            "name": "DB tables and migrations listed",
            "ok": bool(db_ensure_map) and bool(migrations),
            "detail": f"ensure_groups={len(db_ensure_map)}, migrations={len(migrations)}",
        },
        {
            "name": "Env vars documented",
            "ok": bool(app_env_vars) and bool(server_env_vars),
            "detail": f"app_env={len(app_env_vars)}, server_env={len(server_env_vars)}",
        },
    ]
    return checks


def md_heading(lines: list[str], level: int, title: str) -> None:
    lines.append(f"{'#' * level} {title}")
    lines.append("")


def md_bullet(lines: list[str], text: str, indent: int = 0) -> None:
    prefix = "  " * max(0, indent)
    lines.append(f"{prefix}- {text}")


def render_markdown(data: dict) -> str:
    lines: list[str] = []
    generated_at = data["generated_at_local"]
    generated_at_utc = data["generated_at_utc"]

    md_heading(lines, 1, "PROJECT MASTER HANDBOOK")
    lines.append(f"- Generated from repository state on **{generated_at}** (UTC: {generated_at_utc}).")
    lines.append("- Scope: frontend (`app`), backend (`server`), tooling (`tools`), docs/assets (`docs`, `images`).")
    lines.append("- Language style: English with simple Hindi support lines.")
    lines.append("")

    md_heading(lines, 2, "1) Executive Snapshot")
    lines.append("Hindi quick line: **Yeh section project ka fast overview deta hai.**")
    lines.append("")
    inventory = data["source_inventory"]
    md_bullet(lines, f"Source files scanned (excluding `.git`, `node_modules`, binary uploads): **{inventory['files_scanned']}**")
    md_bullet(lines, f"Backend route modules: **{len(data['backend_routes']['module_inventory'])}**")
    total_canonical = sum(
        len(module["canonical_endpoints"]) for module in data["backend_routes"]["module_inventory"].values()
    )
    total_all_mounted = sum(
        len(module["all_mounted_endpoints"]) for module in data["backend_routes"]["module_inventory"].values()
    )
    md_bullet(lines, f"Canonical API endpoints (primary mounts): **{total_canonical}**")
    md_bullet(lines, f"All mounted endpoints including aliases: **{total_all_mounted}**")
    md_bullet(lines, f"Frontend app views defined: **{len(data['app_views'])}**")
    md_bullet(lines, f"Frontend route rules parsed: static **{len(data['frontend_static_routes'])}**, dynamic **{len(data['frontend_dynamic_routes'])}**")
    md_bullet(lines, f"DB ensure groups: **{len(data['db_ensure_map'])}**")
    md_bullet(lines, f"SQL migration files: **{len(data['migrations'])}**")
    md_bullet(lines, f"Environment variables documented: app **{len(data['app_env_vars'])}**, server **{len(data['server_env_vars'])}**")
    lines.append("")

    md_heading(lines, 2, "2) Repository Scan Boundaries and Inputs")
    lines.append("Hindi quick line: **Yeh batata hai handbook kis source se bana hai.**")
    lines.append("")
    md_bullet(lines, "Primary source-of-truth files scanned:")
    md_bullet(lines, "`app/src/main.tsx`, `app/src/App.tsx`, `app/src/lib/*`, `app/src/sections/**/*`", indent=1)
    md_bullet(lines, "`server/src/index.js`, middleware, services, jobs, controllers, routes", indent=1)
    md_bullet(lines, "`server/src/db.js`, `server/sql/migrations/*`", indent=1)
    md_bullet(lines, "`app/.env.example`, `server/.env.example`", indent=1)
    md_bullet(lines, "`app/package.json`, `server/package.json`, `tools/pitch-deck/package.json`", indent=1)
    md_bullet(lines, "Skipped directories:")
    for dirname in inventory["skipped_dirs"]:
        md_bullet(lines, dirname, indent=1)
    md_bullet(lines, "Top-level scanned file counts:")
    for name, count in inventory["top_level_counter"].most_common():
        md_bullet(lines, f"{name}: {count}", indent=1)
    lines.append("")

    md_heading(lines, 2, "3) End-to-End Runtime Flow (Start to End)")
    lines.append("Hindi quick line: **User request start se DB response tak ka pura flow yaha hai.**")
    lines.append("")
    flow_points = [
        "Frontend bootstraps in `app/src/main.tsx`: React StrictMode + root render + global toaster.",
        "Client-side view resolution runs in `app/src/App.tsx` using `viewFromPathname`, mapping URL -> `AppView` -> lazy-loaded section component.",
        "Auth/session state is managed by `app/src/lib/session.ts`; managed provider bridge is handled by `app/src/lib/supabase.ts`.",
        "All API calls go through `app/src/lib/http.ts` (`apiRequest`) which appends API version prefix, token, cookie credentials, and `X-Device-Id`.",
        "Backend entrypoint `server/src/index.js` configures security and transport middleware (`helmet`, CORS, request logging, compression, JSON limits, static uploads).",
        "Requests are routed to domain modules mounted on both legacy and versioned prefixes (for backward compatibility and `/api/v1` consistency).",
        "Route handlers validate input (mostly Zod), enforce auth/permission middleware, then call DB queries or domain services.",
        "DB layer is PostgreSQL via `pg` pool (`server/src/db.js`), with ensure-* bootstrap functions creating/maintaining schema at startup.",
        "Cross-cutting async behavior: cron schedulers, Redis/BullMQ queue (optional), analytics aggregation jobs, infra ingestion jobs.",
        "Realtime messaging is initialized through Socket.IO (`initializeChatRealtime`) on the same HTTP server.",
        "Errors are normalized in the global Express error middleware (Zod, PostgreSQL codes, generic fallback).",
        "Frontend receives JSON responses, updates state/UI, and (for chat) receives realtime events via socket subscriptions.",
    ]
    for point in flow_points:
        md_bullet(lines, point)
    lines.append("")

    md_heading(lines, 2, "4) Frontend Architecture")
    lines.append("Hindi quick line: **Frontend architecture modular hai, view-driven navigation ke saath.**")
    lines.append("")

    md_heading(lines, 3, "4.1 Entry and App Shell")
    md_bullet(lines, "Entry: `app/src/main.tsx`")
    md_bullet(lines, "Main shell + routing logic: `app/src/App.tsx`")
    md_bullet(lines, "View contracts: `app/src/lib/views.ts`")
    md_bullet(lines, "Header/Footer and major section components are lazy loaded for faster initial render.")
    lines.append("")

    md_heading(lines, 3, "4.2 Frontend View Routing Map")
    md_bullet(lines, "Static path mappings parsed from `viewFromPathname`:")
    for path_value, view in sorted(data["frontend_static_routes"], key=lambda item: item[0]):
        component = data["view_components"].get(view, "(component not resolved in App conditional block)")
        md_bullet(lines, f"`{path_value}` -> view `{view}` -> component `{component}`", indent=1)
    lines.append("")
    md_bullet(lines, "Dynamic path matchers parsed from `viewFromPathname`:")
    for matcher, view in sorted(data["frontend_dynamic_routes"], key=lambda item: item[0]):
        component = data["view_components"].get(view, "(component not resolved in App conditional block)")
        md_bullet(lines, f"`{matcher}` -> view `{view}` -> component `{component}`", indent=1)
    lines.append("")

    md_heading(lines, 3, "4.3 app/src/lib Module Inventory (Concept Used Where)")
    for module in data["frontend_lib_inventory"]:
        exports = ", ".join(module["exports"][:12]) if module["exports"] else "(no explicit named exports detected)"
        concept_row = next((row for row in data["concept_matrix"] if row["file"] == module["path"]), None)
        concepts = ", ".join(concept_row["concepts"]) if concept_row else "General utility"
        md_bullet(lines, f"`{module['path']}`")
        md_bullet(lines, f"Concepts: {concepts}", indent=1)
        md_bullet(lines, f"Exports: {exports}", indent=1)
    lines.append("")

    md_heading(lines, 3, "4.4 Sections Directory Inventory")
    for group, files in data["frontend_sections"].items():
        md_bullet(lines, f"Group `{group}` ({len(files)} files)")
        for file_name in files:
            md_bullet(lines, file_name, indent=1)
    lines.append("")

    md_heading(lines, 3, "4.5 Frontend API Usage Map")
    for file_path, endpoints in data["frontend_api_usage"].items():
        md_bullet(lines, f"`{file_path}`")
        for endpoint in endpoints:
            md_bullet(lines, endpoint, indent=1)
    lines.append("")

    md_heading(lines, 2, "5) Backend Architecture")
    lines.append("Hindi quick line: **Backend domain-based routes + services pattern follow karta hai.**")
    lines.append("")
    runtime_facts = data["runtime_flow_facts"]
    md_bullet(lines, "Core entry file: `server/src/index.js`")
    md_bullet(lines, f"Security middleware present: helmet={runtime_facts['has_helmet']}, cors={runtime_facts['has_cors']}, compression={runtime_facts['has_compression']}")
    md_bullet(lines, f"Observability middleware present: morgan={runtime_facts['has_morgan']}, /health route={runtime_facts['has_health_route']}")
    md_bullet(lines, f"Reliability features: global error handler={runtime_facts['has_error_handler']}, cron={runtime_facts['has_cron']}, queue={runtime_facts['has_queue']}, realtime={runtime_facts['has_socketio']}")
    lines.append("")

    md_heading(lines, 3, "5.1 Startup Ensure Order")
    for ensure_name in data["startup_ensure_order"]:
        tables = data["db_ensure_map"].get(ensure_name, [])
        md_bullet(lines, f"{ensure_name} ({len(tables)} tables)")
    lines.append("")

    md_heading(lines, 3, "5.2 Backend Module Inventory")
    backend_misc = data["backend_misc"]
    for group_name in ("controllers", "middleware", "services", "jobs", "utils"):
        files = backend_misc[group_name]
        md_bullet(lines, f"{group_name.title()} ({len(files)} files)")
        for file_path in files:
            concepts = next((row["concepts"] for row in data["concept_matrix"] if row["file"] == file_path), [])
            concept_text = ", ".join(concepts) if concepts else "General"
            md_bullet(lines, f"`{file_path}` -> {concept_text}", indent=1)
    lines.append("")

    md_heading(lines, 3, "5.3 Route Module Architecture")
    for module_name, module_data in data["backend_routes"]["module_inventory"].items():
        mounts = ", ".join(module_data["mounts"]) if module_data["mounts"] else "(not mounted in index.js)"
        md_bullet(
            lines,
            f"`{module_name}` | file `{module_data['file']}` | mounts: {mounts} | canonical endpoints: {len(module_data['canonical_endpoints'])}",
        )
    if data["backend_routes"]["unmounted_modules"]:
        md_bullet(lines, f"Unmouted route files detected: {', '.join(data['backend_routes']['unmounted_modules'])}")
    if data["backend_routes"]["unknown_mounted_modules"]:
        md_bullet(lines, f"Mounted modules missing file: {', '.join(data['backend_routes']['unknown_mounted_modules'])}")
    lines.append("")

    md_heading(lines, 2, "6) Full API Catalog (Grouped by Domain)")
    lines.append("Hindi quick line: **Is section mein saare API endpoints domain-wise listed hain.**")
    lines.append("")
    for module_name, module_data in data["backend_routes"]["module_inventory"].items():
        md_heading(lines, 3, f"6.{module_name} {title_from_token(module_name)}")
        mounts = module_data["mounts"]
        preferred = module_data["preferred_mount"] or "(none)"
        md_bullet(lines, f"Source file: `{module_data['file']}`")
        md_bullet(lines, f"Primary mount: `{preferred}`")
        if mounts:
            aliases = [mount for mount in mounts if mount != preferred]
            md_bullet(lines, f"All mounts: {', '.join(f'`{mount}`' for mount in mounts)}")
            if aliases:
                md_bullet(lines, f"Alias mounts: {', '.join(f'`{mount}`' for mount in aliases)}")
        else:
            md_bullet(lines, "Mounts not found in `server/src/index.js`.")
        md_bullet(lines, f"Canonical endpoint count: {len(module_data['canonical_endpoints'])}")
        for endpoint in module_data["canonical_endpoints"]:
            md_bullet(lines, f"{endpoint['method']} `{endpoint['path']}`", indent=1)
        lines.append("")

    md_heading(lines, 2, "7) Database Schema and Migration Evolution")
    lines.append("Hindi quick line: **Database ka schema group-wise aur migration timeline yaha diya hai.**")
    lines.append("")
    md_heading(lines, 3, "7.1 ensure* Function -> Table Groups")
    for ensure_name, tables in data["db_ensure_map"].items():
        md_bullet(lines, f"`{ensure_name}` ({len(tables)} tables)")
        for table_name in tables:
            md_bullet(lines, table_name, indent=1)
    lines.append("")

    md_heading(lines, 3, "7.2 Migration Timeline (`server/sql/migrations`)")
    for migration in data["migrations"]:
        date_label = migration["date"] or "n/a"
        md_bullet(lines, f"{date_label} | `{migration['name']}` | {migration['summary']}")
        if migration["tables_created"]:
            md_bullet(lines, f"Creates: {', '.join(migration['tables_created'])}", indent=1)
        if migration["tables_altered"]:
            md_bullet(lines, f"Alters: {', '.join(migration['tables_altered'])}", indent=1)
    lines.append("")

    md_heading(lines, 2, "8) Environment and Config Map")
    lines.append("Hindi quick line: **Secrets expose kiye bina env purpose document kiya gaya hai.**")
    lines.append("")
    md_heading(lines, 3, "8.1 Frontend Env (`app/.env.example`)")
    app_env_grouped: dict[str, list[dict]] = defaultdict(list)
    for row in data["app_env_vars"]:
        app_env_grouped[env_group(row["key"])].append(row)
    for group_name in sorted(app_env_grouped):
        md_bullet(lines, group_name)
        for row in app_env_grouped[group_name]:
            md_bullet(
                lines,
                f"`{row['key']}` = `{safe_literal(row['value'])}` -> {env_purpose(row['key'], row['comment'])}",
                indent=1,
            )
    lines.append("")

    md_heading(lines, 3, "8.2 Server Env (`server/.env.example`)")
    server_env_grouped: dict[str, list[dict]] = defaultdict(list)
    for row in data["server_env_vars"]:
        server_env_grouped[env_group(row["key"])].append(row)
    for group_name in sorted(server_env_grouped):
        md_bullet(lines, group_name)
        for row in server_env_grouped[group_name]:
            md_bullet(
                lines,
                f"`{row['key']}` = `{safe_literal(row['value'])}` -> {env_purpose(row['key'], row['comment'])}",
                indent=1,
            )
    lines.append("")

    md_heading(lines, 2, "9) Technology Used Where and Why")
    lines.append("Hindi quick line: **Tech stack ko workspace aur use-case ke hisaab se map kiya gaya hai.**")
    lines.append("")
    dep_summary = data["dependency_summary"]
    for workspace, groups in dep_summary.items():
        md_heading(lines, 3, f"9.{workspace} {workspace}")
        md_bullet(lines, "Runtime dependencies:")
        for category, deps in groups["runtime"].items():
            dep_names = ", ".join(f"`{name}`" for name, _ in deps)
            reason = deps[0][1] if deps else ""
            md_bullet(lines, f"{category}: {dep_names}", indent=1)
            if reason:
                md_bullet(lines, f"Why here: {reason}", indent=2)
        if groups["dev"]:
            md_bullet(lines, "Dev dependencies:")
            for category, deps in groups["dev"].items():
                dep_names = ", ".join(f"`{name}`" for name, _ in deps)
                reason = deps[0][1] if deps else ""
                md_bullet(lines, f"{category}: {dep_names}", indent=1)
                if reason:
                    md_bullet(lines, f"Why here: {reason}", indent=2)
        lines.append("")

    md_heading(lines, 2, "10) Security, Auth, Rate Limit, Queue, Scheduler, Realtime")
    lines.append("Hindi quick line: **Core non-functional architecture controls yaha summarized hain.**")
    lines.append("")
    controls = [
        ("Auth + Session", "`server/src/middleware/auth.js`, `app/src/lib/session.ts`, `app/src/lib/supabase.ts`"),
        ("RBAC", "`requireRole`, `requirePermission`, DB role/permission tables in `server/src/db.js`"),
        ("Validation", "Zod schemas in route modules + centralized Zod error formatting in `server/src/index.js`"),
        ("Rate Limiting", "`server/src/middleware/rateLimit.js` with Redis-backed and in-memory fallback modes"),
        ("Queueing", "`server/src/services/queue/index.js` with BullMQ + Redis version checks and inline fallback"),
        ("Scheduling", "`node-cron` jobs in `server/src/index.js` + analytics/insights and ingest jobs"),
        ("Realtime Chat", "`server/src/services/chatRealtime.js` + `app/src/sections/MessagesPage.tsx` socket client"),
        ("Transport Security", "Helmet, CORS allowlist, HTTPS enforcement, strict security headers"),
    ]
    for title, detail in controls:
        md_bullet(lines, f"{title}: {detail}")
    lines.append("")

    md_heading(lines, 2, "11) External Services Integration Map")
    lines.append("Hindi quick line: **External providers kaha use hue hain, yeh clear mapping yaha hai.**")
    lines.append("")
    for service_name, service_data in data["integrations"].items():
        md_bullet(lines, f"{service_name}")
        md_bullet(lines, f"Why used: {service_data['reason']}", indent=1)
        if service_data["env_keys"]:
            md_bullet(lines, f"Env keys: {', '.join(f'`{key}`' for key in service_data['env_keys'])}", indent=1)
        else:
            md_bullet(lines, "Env keys: (none required in env example or hardcoded external feed URLs)", indent=1)
        if service_data["files"]:
            md_bullet(lines, "Where referenced:", indent=1)
            for file_path in service_data["files"]:
                md_bullet(lines, f"`{file_path}`", indent=2)
        else:
            md_bullet(lines, "Where referenced: no direct code hit found with current keyword scan.", indent=1)
    lines.append("")

    md_heading(lines, 2, "12) Concept Used Where (Module-wise)")
    lines.append("Hindi quick line: **Agar interview mein pooche concept kaha hai, is matrix se turant answer de sakte ho.**")
    lines.append("")
    for row in data["concept_matrix"]:
        md_bullet(lines, f"`{row['file']}` -> {', '.join(row['concepts'])}")
    lines.append("")

    md_heading(lines, 2, "13) Change Playbook (Exact File Groups + Sequence)")
    lines.append("Hindi quick line: **Feature change karne ka practical step-by-step sequence yaha ready hai.**")
    lines.append("")

    playbook_entries = [
        (
            "A) Add/Change any REST API endpoint",
            [
                "Step 1: Update or create route handler in `server/src/routes/<domain>.js`.",
                "Step 2: Add/adjust middleware checks in `server/src/middleware/auth.js` or route-level guards.",
                "Step 3: Update DB query logic in route file or related service under `server/src/services/*`.",
                "Step 4: If schema changes are needed, update `server/sql/migrations/*.sql` and `server/src/db.js` ensure-group.",
                "Step 5: If the route is new module, mount it in `server/src/index.js` under legacy + `/api/v1` prefixes.",
                "Step 6: Update frontend API wrapper in `app/src/lib/*Api.ts` or relevant section component.",
                "Step 7: Update affected UI screens in `app/src/sections/**/*` and navigation mapping in `app/src/App.tsx` if needed.",
            ],
        ),
        (
            "B) Add new frontend page/view",
            [
                "Step 1: Create page component in `app/src/sections/...`.",
                "Step 2: Add lazy import in `app/src/App.tsx`.",
                "Step 3: Add path->view mapping in `viewFromPathname` in `app/src/App.tsx`.",
                "Step 4: Add render condition block `currentView === '...'` in `app/src/App.tsx`.",
                "Step 5: Add view key in `app/src/lib/views.ts`.",
                "Step 6: Wire header/footer/menu navigation callbacks.",
            ],
        ),
        (
            "C) Change auth/permission behavior",
            [
                "Step 1: Update token/session logic in `server/src/middleware/auth.js`.",
                "Step 2: Update role/permission tables and seeds in `server/src/db.js` (+ migration if needed).",
                "Step 3: Update auth route flows in `server/src/routes/auth.js`.",
                "Step 4: Update frontend session handling in `app/src/lib/session.ts` and managed bridge in `app/src/lib/supabase.ts`.",
                "Step 5: Verify protected view access logic in `canAccessView` (`app/src/App.tsx`).",
            ],
        ),
        (
            "D) Change chat/realtime flow",
            [
                "Step 1: API changes in `server/src/routes/chat.js`.",
                "Step 2: Socket event or presence changes in `server/src/services/chatRealtime.js`.",
                "Step 3: DB table impact in chat tables inside `server/src/db.js`.",
                "Step 4: Frontend socket consumer changes in `app/src/sections/MessagesPage.tsx`.",
            ],
        ),
        (
            "E) Change infra tracker/ingestion",
            [
                "Step 1: Infra routes in `server/src/routes/infraUpdates.js`, `infraSubscriptions.js`, `infraIngest.js`.",
                "Step 2: Source ingestion job changes in `server/src/jobs/infraIngest.js` and `server/src/jobs/pibIngest.js`.",
                "Step 3: Scheduler toggles in `server/src/index.js` and env keys `INFRA_*`.",
                "Step 4: Frontend pages in `app/src/sections/InfrastructureTrackerPage.tsx` and admin infra pages.",
            ],
        ),
        (
            "F) Change AI assistant behavior/provider",
            [
                "Step 1: Prompt/model/provider logic in `server/src/routes/aiAssistant.js`.",
                "Step 2: Update env examples for `OPENAI_*` / `GEMINI_*` keys if needed.",
                "Step 3: Frontend callers in `app/src/lib/aiChatbotApi.ts`, `app/src/sections/MessagesPage.tsx`, widget components.",
            ],
        ),
        (
            "G) Change DB schema safely",
            [
                "Step 1: Create new SQL migration in `server/sql/migrations/`.",
                "Step 2: Mirror changes in correct ensure-function inside `server/src/db.js`.",
                "Step 3: Update route/service query shape and frontend payload mapping.",
                "Step 4: Backfill or compatibility handling for old rows/legacy columns where needed.",
            ],
        ),
    ]
    for heading, steps in playbook_entries:
        md_bullet(lines, heading)
        for step in steps:
            md_bullet(lines, step, indent=1)
    lines.append("")

    md_heading(lines, 2, "14) Interview-Ready “How It Works” Script")
    lines.append("Hindi quick line: **Is script ko bolke aap project architecture confidently explain kar sakte ho.**")
    lines.append("")
    interview_script = [
        "This project is a full-stack real-estate platform with a React + TypeScript frontend and an Express + PostgreSQL backend.",
        "Frontend navigation is view-driven inside a central App shell (`App.tsx`) that maps URL paths to logical app views and lazy-loaded sections.",
        "The frontend uses a single HTTP client abstraction (`apiRequest`) for auth token attachment, device tracking, and API version prefix routing.",
        "Backend routes are domain-split (auth, workflow, realty, owner, rentals, insights, infra, chat, materials, support, promotions, etc.) and mounted under both legacy and `/api/v1` prefixes.",
        "Security is layered using Helmet, CORS allowlist, strict headers, JWT auth middleware, RBAC permissions, and route-specific rate limiters.",
        "PostgreSQL schema bootstrap is managed by ensure-functions in `db.js`, and historical schema evolution is tracked in SQL migrations.",
        "The system supports asynchronous processing with optional Redis/BullMQ queues and cron-driven schedulers for analytics, reminders, and ingestion.",
        "Realtime communication is implemented with Socket.IO for chat conversations, message delivery/read receipts, and online presence updates.",
        "External integrations include Supabase (managed auth bridge), Google Maps, OpenAI/Gemini AI assistant, SMTP/Twilio notifications, NSE feed, and OSM/Nominatim geocoding.",
        "For change requests, we follow a predictable file-group sequence: route/service/db/migration/backend mount/frontend API wrapper/frontend section.",
    ]
    for line in interview_script:
        md_bullet(lines, line)
    lines.append("")

    md_heading(lines, 2, "15) Common Interview Q&A")
    qa_pairs = [
        ("How is routing done on frontend?", "Using path-to-view resolution in `App.tsx`, then conditional rendering of lazy-loaded page sections."),
        ("How are APIs versioned?", "Frontend adds `VITE_API_VERSION_PREFIX`; backend mounts the same route modules under legacy and `/api/v1` prefixes."),
        ("How is authentication handled?", "JWT session auth with device/session tracking; optional managed auth via Supabase bridge."),
        ("How do you enforce authorization?", "Role and permission guards through middleware (`requireRole`, `requirePermission`) plus RBAC tables."),
        ("Where is validation implemented?", "Primarily at route level with Zod schemas; errors normalized in the global error handler."),
        ("How do you prevent abuse?", "Route-level rate limiters with Redis-backed shared windows and in-memory fallback."),
        ("How is realtime chat implemented?", "Socket.IO server in `chatRealtime.js` + REST endpoints in `chat.js` + frontend socket client in `MessagesPage.tsx`."),
        ("How are background jobs handled?", "Cron schedulers and optional BullMQ queue workers with fallback to inline execution."),
        ("How is DB schema managed?", "Ensure-functions bootstrap tables; SQL migrations capture timeline for controlled schema changes."),
        ("How do external AI providers work here?", "AI route chooses OpenAI or Gemini based on env availability and provider responses."),
        ("How is infra data ingestion done?", "Scheduled jobs fetch PIB and optional tender/PPP sources, store inbox items, and publish admin-reviewed updates."),
        ("How do you safely modify a feature?", "Follow the change playbook: API/domain layer, schema if needed, frontend wrapper, and UI integration updates."),
    ]
    for question, answer in qa_pairs:
        md_bullet(lines, f"Q: {question}")
        md_bullet(lines, f"A: {answer}", indent=1)
    lines.append("")

    md_heading(lines, 2, "16) Binary Artifacts (Described, Not Inlined)")
    lines.append("Hindi quick line: **Binary files ko embed nahi kiya gaya, sirf map kiya gaya hai.**")
    lines.append("")
    binary_summary = data["binary_artifacts"]
    for extension, count in binary_summary["counter"].most_common():
        md_bullet(lines, f"{extension}: {count} files")
    md_bullet(lines, "Notable binary/document assets:")
    for file_path in binary_summary["notable"]:
        md_bullet(lines, f"`{file_path}`", indent=1)
    lines.append("")

    md_heading(lines, 2, "17) Coverage Check against Requested Plan")
    for check in data["coverage_checks"]:
        status = "PASS" if check["ok"] else "WARN"
        md_bullet(lines, f"[{status}] {check['name']} -> {check['detail']}")
    lines.append("")

    md_heading(lines, 2, "18) Quick Regeneration")
    md_bullet(lines, "Run: `python tools/project-doc/generate_project_handbook.py`")
    md_bullet(lines, "Outputs: `PROJECT_MASTER_HANDBOOK.md` and `PROJECT_MASTER_HANDBOOK.docx` in repo root.")
    lines.append("")

    return "\n".join(lines).strip() + "\n"


def markdown_to_blocks(markdown_text: str) -> list[dict]:
    lines = markdown_text.splitlines()
    blocks: list[dict] = []
    paragraph_parts: list[str] = []
    code_mode = False
    code_lines: list[str] = []

    def flush_paragraph() -> None:
        nonlocal paragraph_parts
        if paragraph_parts:
            text = " ".join(part.strip() for part in paragraph_parts if part.strip()).strip()
            if text:
                blocks.append({"type": "paragraph", "text": text})
            paragraph_parts = []

    for line in lines:
        if line.startswith("```"):
            if code_mode:
                for code_line in code_lines:
                    blocks.append({"type": "code", "text": code_line})
                code_lines = []
                code_mode = False
            else:
                flush_paragraph()
                code_mode = True
            continue

        if code_mode:
            code_lines.append(line)
            continue

        if not line.strip():
            flush_paragraph()
            blocks.append({"type": "blank"})
            continue

        heading_match = re.match(r"^(#{1,6})\s+(.*)$", line)
        if heading_match:
            flush_paragraph()
            blocks.append(
                {
                    "type": "heading",
                    "level": len(heading_match.group(1)),
                    "text": heading_match.group(2).strip(),
                }
            )
            continue

        bullet_match = re.match(r"^(\s*)-\s+(.*)$", line)
        if bullet_match:
            flush_paragraph()
            level = max(0, len(bullet_match.group(1)) // 2)
            blocks.append(
                {
                    "type": "bullet",
                    "level": min(level, 4),
                    "text": bullet_match.group(2).strip(),
                }
            )
            continue

        number_match = re.match(r"^(\s*)\d+[.)]\s+(.*)$", line)
        if number_match:
            flush_paragraph()
            level = max(0, len(number_match.group(1)) // 2)
            blocks.append(
                {
                    "type": "number",
                    "level": min(level, 4),
                    "text": number_match.group(2).strip(),
                }
            )
            continue

        paragraph_parts.append(line)

    flush_paragraph()
    if code_mode and code_lines:
        for code_line in code_lines:
            blocks.append({"type": "code", "text": code_line})
    return blocks


def xml_paragraph(text: str, style: str | None = None, bullet_level: int | None = None, number_level: int | None = None) -> str:
    escaped = xml_escape(text)
    ppr_parts = []
    if style:
        ppr_parts.append(f'<w:pStyle w:val="{style}"/>')
    if bullet_level is not None:
        ppr_parts.append(
            f'<w:numPr><w:ilvl w:val="{bullet_level}"/><w:numId w:val="1"/></w:numPr>'
        )
        if style is None:
            ppr_parts.append('<w:pStyle w:val="ListParagraph"/>')
    if number_level is not None:
        ppr_parts.append(
            f'<w:numPr><w:ilvl w:val="{number_level}"/><w:numId w:val="2"/></w:numPr>'
        )
        if style is None:
            ppr_parts.append('<w:pStyle w:val="ListParagraph"/>')
    ppr_xml = f"<w:pPr>{''.join(ppr_parts)}</w:pPr>" if ppr_parts else ""
    return (
        "<w:p>"
        f"{ppr_xml}"
        '<w:r><w:t xml:space="preserve">'
        f"{escaped}"
        "</w:t></w:r>"
        "</w:p>"
    )


def build_document_xml(markdown_text: str) -> str:
    blocks = markdown_to_blocks(markdown_text)
    paragraphs: list[str] = []

    for block in blocks:
        block_type = block["type"]
        if block_type == "blank":
            paragraphs.append("<w:p/>")
            continue
        if block_type == "heading":
            level = block["level"]
            style = "Heading1" if level == 1 else "Heading2" if level == 2 else "Heading3"
            paragraphs.append(xml_paragraph(block["text"], style=style))
            continue
        if block_type == "bullet":
            paragraphs.append(xml_paragraph(block["text"], bullet_level=block["level"]))
            continue
        if block_type == "number":
            paragraphs.append(xml_paragraph(block["text"], number_level=block["level"]))
            continue
        if block_type == "code":
            paragraphs.append(xml_paragraph(block["text"], style="CodeBlock"))
            continue
        paragraphs.append(xml_paragraph(block["text"]))

    body_xml = "".join(paragraphs)
    return textwrap.dedent(
        f"""\
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
            xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
            xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
            xmlns:v="urn:schemas-microsoft-com:vml"
            xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:w10="urn:schemas-microsoft-com:office:word"
            xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
            xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
            xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
            xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
            xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
            mc:Ignorable="w14 wp14">
          <w:body>
            {body_xml}
            <w:sectPr>
              <w:pgSz w:w="12240" w:h="15840"/>
              <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
              <w:cols w:space="708"/>
              <w:docGrid w:linePitch="360"/>
            </w:sectPr>
          </w:body>
        </w:document>
        """
    ).strip()


def build_styles_xml() -> str:
    return textwrap.dedent(
        """\
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
            <w:name w:val="Normal"/>
            <w:qFormat/>
            <w:rPr>
              <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/>
              <w:sz w:val="22"/>
              <w:szCs w:val="22"/>
            </w:rPr>
          </w:style>
          <w:style w:type="paragraph" w:styleId="Heading1">
            <w:name w:val="heading 1"/>
            <w:basedOn w:val="Normal"/>
            <w:next w:val="Normal"/>
            <w:qFormat/>
            <w:rPr>
              <w:b/>
              <w:sz w:val="34"/>
              <w:szCs w:val="34"/>
            </w:rPr>
          </w:style>
          <w:style w:type="paragraph" w:styleId="Heading2">
            <w:name w:val="heading 2"/>
            <w:basedOn w:val="Normal"/>
            <w:next w:val="Normal"/>
            <w:qFormat/>
            <w:rPr>
              <w:b/>
              <w:sz w:val="30"/>
              <w:szCs w:val="30"/>
            </w:rPr>
          </w:style>
          <w:style w:type="paragraph" w:styleId="Heading3">
            <w:name w:val="heading 3"/>
            <w:basedOn w:val="Normal"/>
            <w:next w:val="Normal"/>
            <w:qFormat/>
            <w:rPr>
              <w:b/>
              <w:sz w:val="26"/>
              <w:szCs w:val="26"/>
            </w:rPr>
          </w:style>
          <w:style w:type="paragraph" w:styleId="ListParagraph">
            <w:name w:val="List Paragraph"/>
            <w:basedOn w:val="Normal"/>
          </w:style>
          <w:style w:type="paragraph" w:styleId="CodeBlock">
            <w:name w:val="Code Block"/>
            <w:basedOn w:val="Normal"/>
            <w:pPr>
              <w:spacing w:before="0" w:after="80"/>
            </w:pPr>
            <w:rPr>
              <w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Consolas" w:cs="Consolas"/>
              <w:sz w:val="20"/>
              <w:szCs w:val="20"/>
            </w:rPr>
          </w:style>
        </w:styles>
        """
    ).strip()


def build_numbering_xml() -> str:
    return textwrap.dedent(
        """\
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:abstractNum w:abstractNumId="0">
            <w:multiLevelType w:val="hybridMultilevel"/>
            <w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl>
            <w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/><w:lvlText w:val="o"/></w:lvl>
            <w:lvl w:ilvl="2"><w:numFmt w:val="bullet"/><w:lvlText w:val="▪"/></w:lvl>
            <w:lvl w:ilvl="3"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl>
            <w:lvl w:ilvl="4"><w:numFmt w:val="bullet"/><w:lvlText w:val="o"/></w:lvl>
          </w:abstractNum>
          <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
          <w:abstractNum w:abstractNumId="1">
            <w:multiLevelType w:val="multilevel"/>
            <w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl>
            <w:lvl w:ilvl="1"><w:numFmt w:val="decimal"/><w:lvlText w:val="%2."/></w:lvl>
            <w:lvl w:ilvl="2"><w:numFmt w:val="decimal"/><w:lvlText w:val="%3."/></w:lvl>
            <w:lvl w:ilvl="3"><w:numFmt w:val="decimal"/><w:lvlText w:val="%4."/></w:lvl>
            <w:lvl w:ilvl="4"><w:numFmt w:val="decimal"/><w:lvlText w:val="%5."/></w:lvl>
          </w:abstractNum>
          <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
        </w:numbering>
        """
    ).strip()


def write_docx(markdown_text: str, output_path: Path) -> None:
    document_xml = build_document_xml(markdown_text)
    styles_xml = build_styles_xml()
    numbering_xml = build_numbering_xml()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    content_types_xml = textwrap.dedent(
        """\
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
          <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
          <Default Extension="xml" ContentType="application/xml"/>
          <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
          <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
          <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
          <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
          <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
        </Types>
        """
    ).strip()

    root_rels_xml = textwrap.dedent(
        """\
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
          <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
          <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
        </Relationships>
        """
    ).strip()

    document_rels_xml = textwrap.dedent(
        """\
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
          <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
        </Relationships>
        """
    ).strip()

    core_xml = textwrap.dedent(
        f"""\
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
          xmlns:dc="http://purl.org/dc/elements/1.1/"
          xmlns:dcterms="http://purl.org/dc/terms/"
          xmlns:dcmitype="http://purl.org/dc/dcmitype/"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <dc:title>PROJECT MASTER HANDBOOK</dc:title>
          <dc:creator>Codex Generator</dc:creator>
          <cp:lastModifiedBy>Codex Generator</cp:lastModifiedBy>
          <dcterms:created xsi:type="dcterms:W3CDTF">{now}</dcterms:created>
          <dcterms:modified xsi:type="dcterms:W3CDTF">{now}</dcterms:modified>
        </cp:coreProperties>
        """
    ).strip()

    app_xml = textwrap.dedent(
        """\
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
          xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
          <Application>Microsoft Office Word</Application>
          <DocSecurity>0</DocSecurity>
          <ScaleCrop>false</ScaleCrop>
          <HeadingPairs>
            <vt:vector size="2" baseType="variant">
              <vt:variant><vt:lpstr>Title</vt:lpstr></vt:variant>
              <vt:variant><vt:i4>1</vt:i4></vt:variant>
            </vt:vector>
          </HeadingPairs>
          <TitlesOfParts>
            <vt:vector size="1" baseType="lpstr">
              <vt:lpstr>PROJECT MASTER HANDBOOK</vt:lpstr>
            </vt:vector>
          </TitlesOfParts>
          <Company></Company>
          <LinksUpToDate>false</LinksUpToDate>
          <SharedDoc>false</SharedDoc>
          <HyperlinksChanged>false</HyperlinksChanged>
          <AppVersion>16.0000</AppVersion>
        </Properties>
        """
    ).strip()

    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types_xml)
        archive.writestr("_rels/.rels", root_rels_xml)
        archive.writestr("docProps/core.xml", core_xml)
        archive.writestr("docProps/app.xml", app_xml)
        archive.writestr("word/document.xml", document_xml)
        archive.writestr("word/styles.xml", styles_xml)
        archive.writestr("word/numbering.xml", numbering_xml)
        archive.writestr("word/_rels/document.xml.rels", document_rels_xml)


def gather_data() -> dict:
    now_local = datetime.now()
    now_utc = datetime.now(timezone.utc)

    inventory = scan_source_inventory(PROJECT_ROOT)

    app_package = parse_package_json(PROJECT_ROOT / "app" / "package.json")
    server_package = parse_package_json(PROJECT_ROOT / "server" / "package.json")
    tools_package = parse_package_json(PROJECT_ROOT / "tools" / "pitch-deck" / "package.json")
    package_data = {
        "app": app_package,
        "server": server_package,
        "tools/pitch-deck": tools_package,
    }
    dependency_summary = summarize_dependencies(package_data)

    app_views = parse_app_views(PROJECT_ROOT / "app" / "src" / "lib" / "views.ts")
    app_text = read_text(PROJECT_ROOT / "app" / "src" / "App.tsx")
    frontend_static_routes = parse_app_static_routes(app_text)
    frontend_dynamic_routes = parse_app_dynamic_routes(app_text)
    view_components = parse_view_component_map(app_text)
    lazy_imports = parse_app_lazy_imports(app_text)

    frontend_sections = collect_frontend_sections(PROJECT_ROOT / "app" / "src" / "sections")
    frontend_lib_inventory = collect_frontend_lib_inventory(PROJECT_ROOT / "app" / "src" / "lib")
    frontend_api_usage = collect_frontend_api_usage(
        list((PROJECT_ROOT / "app" / "src" / "lib").rglob("*"))
        + list((PROJECT_ROOT / "app" / "src" / "sections").rglob("*"))
    )

    index_path = PROJECT_ROOT / "server" / "src" / "index.js"
    index_text = read_text(index_path)
    mount_data = parse_index_route_mounts(index_text)
    backend_routes = collect_backend_route_inventory(PROJECT_ROOT / "server" / "src" / "routes", mount_data)
    backend_misc = collect_backend_misc_inventory()

    db_ensure_map = parse_db_ensure_tables(PROJECT_ROOT / "server" / "src" / "db.js")
    startup_ensure_order = parse_startup_ensure_order(index_path)
    migrations = parse_migrations(PROJECT_ROOT / "server" / "sql" / "migrations")

    app_env_vars = parse_env_example(PROJECT_ROOT / "app" / ".env.example")
    server_env_vars = parse_env_example(PROJECT_ROOT / "server" / ".env.example")

    concept_files = (
        list((PROJECT_ROOT / "app" / "src" / "lib").rglob("*"))
        + list((PROJECT_ROOT / "app" / "src" / "sections").rglob("*"))
        + list((PROJECT_ROOT / "server" / "src" / "routes").rglob("*"))
        + list((PROJECT_ROOT / "server" / "src" / "middleware").rglob("*"))
        + list((PROJECT_ROOT / "server" / "src" / "services").rglob("*"))
        + list((PROJECT_ROOT / "server" / "src" / "jobs").rglob("*"))
        + list((PROJECT_ROOT / "server" / "src" / "controllers").rglob("*"))
        + list((PROJECT_ROOT / "server" / "src" / "utils").rglob("*"))
    )
    concept_matrix = build_concept_matrix(concept_files)

    integrations = detect_integrations()
    runtime_flow_facts = collect_runtime_flow_facts(index_text)
    binary_artifacts = collect_binary_artifact_summary()

    coverage_checks = evaluate_coverage(
        backend_routes=backend_routes,
        mount_data=mount_data,
        frontend_static_routes=frontend_static_routes,
        frontend_dynamic_routes=frontend_dynamic_routes,
        view_components=view_components,
        db_ensure_map=db_ensure_map,
        migrations=migrations,
        app_env_vars=app_env_vars,
        server_env_vars=server_env_vars,
    )

    return {
        "generated_at_local": now_local.strftime("%Y-%m-%d %H:%M:%S"),
        "generated_at_utc": now_utc.strftime("%Y-%m-%d %H:%M:%S UTC"),
        "source_inventory": inventory,
        "package_data": package_data,
        "dependency_summary": dependency_summary,
        "app_views": app_views,
        "frontend_static_routes": frontend_static_routes,
        "frontend_dynamic_routes": frontend_dynamic_routes,
        "view_components": view_components,
        "lazy_imports": lazy_imports,
        "frontend_sections": frontend_sections,
        "frontend_lib_inventory": frontend_lib_inventory,
        "frontend_api_usage": frontend_api_usage,
        "mount_data": mount_data,
        "backend_routes": backend_routes,
        "backend_misc": backend_misc,
        "db_ensure_map": db_ensure_map,
        "startup_ensure_order": startup_ensure_order,
        "migrations": migrations,
        "app_env_vars": app_env_vars,
        "server_env_vars": server_env_vars,
        "concept_matrix": concept_matrix,
        "integrations": integrations,
        "runtime_flow_facts": runtime_flow_facts,
        "binary_artifacts": binary_artifacts,
        "coverage_checks": coverage_checks,
    }


def main() -> None:
    data = gather_data()
    markdown = render_markdown(data)
    OUTPUT_MD.write_text(markdown, encoding="utf-8")
    write_docx(markdown, OUTPUT_DOCX)

    total_warnings = sum(1 for check in data["coverage_checks"] if not check["ok"])
    print("Handbook generated successfully.")
    print(f"- Markdown: {rel(OUTPUT_MD)}")
    print(f"- DOCX: {rel(OUTPUT_DOCX)}")
    print(
        f"- Route modules: {len(data['backend_routes']['module_inventory'])}, "
        f"canonical endpoints: {sum(len(module['canonical_endpoints']) for module in data['backend_routes']['module_inventory'].values())}"
    )
    print(
        f"- DB ensure groups: {len(data['db_ensure_map'])}, "
        f"migrations: {len(data['migrations'])}, env vars: {len(data['app_env_vars']) + len(data['server_env_vars'])}"
    )
    print(f"- Coverage warnings: {total_warnings}")


if __name__ == "__main__":
    main()
