#!/usr/bin/env python3
"""Read-only validation of a QUEST FORGE .xcarchive and its source snapshot.

Usage: python3 ios/scripts/verify-package.py ARCHIVE.xcarchive SOURCE_ROOT
Add --require-signature for a signed release archive. An unsigned archive otherwise
produces a warning. No keychain, credentials, private keys, or raw signing output
are read or printed. This is package validation, not App Store acceptance.
"""
from __future__ import annotations

import argparse
import ast
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path, PurePosixPath
import plistlib
import re
import shutil
import struct
import subprocess
import sys
from urllib.parse import urlsplit


class Report:
    def __init__(self) -> None:
        self.checks: list[dict[str, str]] = []

    def add(self, status: str, name: str, detail: str = "") -> None:
        self.checks.append({"status": status, "check": name, "detail": detail})

    def check(self, condition: bool, name: str, detail: str = "") -> bool:
        self.add("PASS" if condition else "FAIL", name, detail)
        return condition

    def section(self, name: str, function) -> None:
        try:
            function()
        except (OSError, ValueError, KeyError, TypeError, struct.error, subprocess.SubprocessError) as error:
            self.add("FAIL", name, f"{type(error).__name__}: {error}")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def plist(path: Path) -> dict:
    value = plistlib.loads(path.read_bytes())
    if not isinstance(value, dict):
        raise ValueError(f"Expected a plist dictionary: {path.name}")
    return value


def command(arguments: list[str], timeout: int = 45) -> subprocess.CompletedProcess:
    return subprocess.run(arguments, capture_output=True, text=True, timeout=timeout, check=False)


def build_settings(project: Path) -> dict[str, str]:
    text = project.read_text()
    names = ("PRODUCT_BUNDLE_IDENTIFIER", "MARKETING_VERSION", "CURRENT_PROJECT_VERSION",
             "DEVELOPMENT_TEAM", "IPHONEOS_DEPLOYMENT_TARGET")
    result = {}
    for name in names:
        values = {match.strip().strip('"') for match in re.findall(r"\b" + name + r"\s*=\s*([^;]+);", text)}
        if len(values) != 1:
            raise ValueError(f"Expected one consistent {name} in project, found {len(values)}")
        result[name] = values.pop()
    return result


def file_map(directory: Path) -> dict[str, str]:
    if not directory.is_dir():
        raise ValueError(f"Missing folder: {directory}")
    result = {}
    for path in directory.rglob("*"):
        if path.is_symlink():
            raise ValueError(f"Unexpected symbolic link: {path.relative_to(directory)}")
        if path.is_file():
            result[path.relative_to(directory).as_posix()] = sha256(path)
    return result


def selected_docs(directory: Path) -> dict[str, str]:
    # Mirrors prepare-ios.py's intentional omission of browser QA material.
    return {name: digest for name, digest in file_map(directory).items()
            if not name.split("/", 1)[0].startswith("qa-")
            and name.split("/", 1)[0] not in {".nojekyll", "research.html"}}


def compare_map(report: Report, name: str, actual: dict, expected: dict) -> None:
    missing = sorted(set(expected) - set(actual))
    extra = sorted(set(actual) - set(expected))
    changed = sorted(key for key in set(actual) & set(expected) if actual[key] != expected[key])
    detail = f"{len(actual)} files"
    for label, values in (("missing", missing), ("extra", extra), ("changed", changed)):
        if values:
            detail += f"; {label}: " + ", ".join(values[:12]) + (" …" if len(values) > 12 else "")
    report.check(not missing and not extra and not changed, name, detail)


class ResourceParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.resources: list[str] = []

    def handle_starttag(self, tag: str, attributes: list[tuple[str, str | None]]) -> None:
        attributes = dict(attributes)
        if tag in {"script", "img", "iframe", "audio", "video", "source"}:
            if attributes.get("src"):
                self.resources.append(attributes["src"])
        if tag == "link" and attributes.get("href") and attributes.get("rel") in {"stylesheet", "preload", "modulepreload"}:
            self.resources.append(attributes["href"])


def verify_sources(report: Report, root: Path, web: Path, manifest: dict) -> None:
    for relative, digest in manifest.items():
        if relative.startswith("assets/"):
            source = root / relative
        elif relative.endswith((".js", ".css")):
            source = root / "src" / relative
        elif relative in {"privacy.html", "support.html"}:
            source = root / "store" / "public" / relative
        else:
            continue
        report.check(source.is_file() and sha256(source) == digest, "Source sync: " + relative)

    build_tree = ast.parse((root / "build.py").read_text())
    lists = {}
    for node in build_tree.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id in {"styles", "files"}:
                    lists[target.id] = ast.literal_eval(node.value)
    styles, scripts = lists["styles"], lists["files"]
    report.check("native.js" in scripts and scripts.index("native.js") < scripts.index("sound.js") < scripts.index("app.js"),
                 "Native bridge script load order")
    html = (web / "index.html").read_text()
    match = re.search(r"<script>const ASSETS=(.*?);</script>", html, re.S)
    if match is None:
        raise ValueError("Generated ASSETS declaration is missing")
    assets = json.loads(match.group(1))
    sheets = {}
    for path in (root / "assets").glob("*.png"):
        data = path.read_bytes()
        if data[:8] != b"\x89PNG\r\n\x1a\n":
            raise ValueError(f"Invalid PNG: {path.name}")
        width, height = struct.unpack(">II", data[16:24])
        sheets[path.name] = {"url": "assets/" + path.name, "width": width, "height": height}
    expected_assets = {"collection0": "assets/collection-a-alpha.png", "collection1": "assets/collection-b-alpha.png", "sheets": sheets}
    report.check(assets == expected_assets, "Sprite sheet URLs and dimensions match source images")
    css = "".join(f'<link rel="stylesheet" href="{name}?v={manifest[name][:12]}">' for name in styles)
    js = "<script>const ASSETS=" + match.group(1) + ";</script>" + "".join(
        f'<script src="{name}?v={manifest[name][:12]}"></script>' for name in scripts)
    expected_html = (root / "src" / "shell.html").read_text().replace('<style>/*STYLE*/</style>', css).replace('<script>/*CODE*/</script>', js)
    report.check(html == expected_html, "Generated index matches current shell, script/style lists, and content revisions")
    parser = ResourceParser()
    parser.feed(html)
    missing = [resource for resource in parser.resources
               if urlsplit(resource).scheme or resource.startswith("//")
               or urlsplit(resource).path not in manifest]
    report.check(not missing, "Main game loads only bundled resources", ", ".join(missing))
    native = (web / "native.js").read_text()
    application = (web / "app.js").read_text()
    report.check("questNative" in native and all(action in native for action in
                 ("speak", "cancelSpeech", "haptic", "export", "import", "scheduleReminder", "clearReminders")),
                 "Bundled native bridge actions are present")
    report.check(all(value in application for value in ("quest-native-ready", "quest-native-import", "QuestNative.post('save'")),
                 "Web save, native-ready, and import integration is present")
    remote_calls = []
    pattern = re.compile(r"\b(?:fetch\s*\(|XMLHttpRequest\b|WebSocket\s*\(|EventSource\s*\(|sendBeacon\s*\(|importScripts\s*\()")
    for name in scripts:
        if pattern.search((web / name).read_text()):
            remote_calls.append(name)
    report.check(not remote_calls, "Game JavaScript has no direct remote-request API calls", ", ".join(remote_calls))


def verify_icon(report: Report, root: Path, app: Path) -> None:
    icon_folder = root / "ios/QuestForgeApp/Assets.xcassets/AppIcon.appiconset"
    entries = json.loads((icon_folder / "Contents.json").read_text())["images"]
    filenames = [entry.get("filename") for entry in entries if entry.get("size") == "1024x1024"]
    report.check(bool(filenames), "App icon catalog declares a 1024px icon")
    for filename in filenames:
        data = (icon_folder / filename).read_bytes()
        width, height = struct.unpack(">II", data[16:24])
        color_type = data[25]
        offset, transparency = 8, False
        while offset + 12 <= len(data):
            size = struct.unpack(">I", data[offset:offset + 4])[0]
            transparency |= data[offset + 4:offset + 8] == b"tRNS"
            offset += size + 12
        report.check(data[:8] == b"\x89PNG\r\n\x1a\n" and (width, height) == (1024, 1024)
                     and color_type not in {4, 6} and not transparency,
                     "Source App Store icon is 1024×1024 without an alpha channel", str(filename))
    car = app / "Assets.car"
    if not report.check(car.is_file(), "Compiled asset catalog is present"):
        return
    tool = shutil.which("assetutil")
    if tool is None:
        report.add("FAIL", "Compiled 1024px icon", "assetutil is unavailable")
        return
    result = command([tool, "--info", str(car)])
    if not report.check(result.returncode == 0, "Compiled asset catalog can be inspected", f"assetutil exit {result.returncode}"):
        return
    assets = json.loads(result.stdout)
    matching = [item for item in assets if item.get("Name") == "AppIcon" and item.get("PixelWidth") == 1024
                and item.get("PixelHeight") == 1024 and item.get("Opaque") is True]
    report.check(bool(matching), "Archived catalog contains an opaque 1024×1024 AppIcon")


def verify_privacy(report: Report, root: Path, app: Path, info: dict) -> None:
    source = root / "ios/QuestForgeApp/PrivacyInfo.xcprivacy"
    bundled = app / "PrivacyInfo.xcprivacy"
    report.check(bundled.is_file() and sha256(source) == sha256(bundled), "Privacy manifest matches source")
    privacy = plist(bundled)
    report.check(privacy.get("NSPrivacyTracking") is False and not privacy.get("NSPrivacyTrackingDomains")
                 and not privacy.get("NSPrivacyCollectedDataTypes"), "Privacy manifest declares no tracking or collected data")
    report.check(privacy.get("NSPrivacyAccessedAPITypes") == [], "No undeclared required-reason API additions in manifest")
    forbidden = {"NSUserTrackingUsageDescription", "SKAdNetworkItems", "NSAdvertisingAttributionReportEndpoint",
                 "UIBackgroundModes", "NSCameraUsageDescription", "NSMicrophoneUsageDescription",
                 "NSLocationWhenInUseUsageDescription", "NSLocationAlwaysAndWhenInUseUsageDescription"}
    unexpected = sorted(forbidden.intersection(info))
    report.check(not unexpected, "No advertising, tracking, microphone, camera, location, or background-mode declarations", ", ".join(unexpected))
    ats = info.get("NSAppTransportSecurity", {})
    report.check(not ats.get("NSAllowsArbitraryLoads") and not ats.get("NSAllowsArbitraryLoadsInWebContent")
                 and not ats.get("NSExceptionDomains"), "No arbitrary-network ATS exceptions")
    capabilities = info.get("UIRequiredDeviceCapabilities", [])
    names = {key for key, value in capabilities.items() if value} if isinstance(capabilities, dict) else set(capabilities)
    report.check(names <= {"arm64"}, "No unnecessary required device capabilities", ", ".join(sorted(names)) or "none")
    native = "\n".join(path.read_text() for path in (root / "ios/QuestForgeApp").glob("*.swift"))
    required_reason_patterns = (r"\b(?:NSUserDefaults|UserDefaults|AppStorage|SceneStorage)\b", r"\.systemUptime\b",
                                r"\b(?:mach_absolute_time|statfs|fstatfs|activeInputModes)\s*\(",
                                r"\.volumeAvailableCapacity\w*", r"\.attributesOfItem\s*\(",
                                r"\.(?:creationDate|modificationDate|contentModificationDate)(?:Key)?\b")
    found = [pattern for pattern in required_reason_patterns if re.search(pattern, native)]
    report.check(not found, "Native source has no direct required-reason API calls from the audited categories",
                 "Re-audit manifest if this check fails")
    ad_frameworks = [path.name for path in app.rglob("*.framework")
                     if re.search(r"(?:AdSupport|AdServices|AppTrackingTransparency|Analytics|Firebase)", path.name, re.I)]
    report.check(not ad_frameworks, "No advertising or analytics frameworks embedded", ", ".join(ad_frameworks))


def verify_signature(report: Report, app: Path, expected_team: str, require: bool) -> None:
    display = command(["/usr/bin/codesign", "--display", "--verbose=2", str(app)])
    verify = command(["/usr/bin/codesign", "--verify", "--deep", "--strict", str(app)])
    # Never echo codesign output: extract the one public identity field we need.
    match = re.search(r"^TeamIdentifier=([A-Z0-9]+)$", display.stderr, re.M)
    signed = display.returncode == 0
    report.check(signed or not require, "Signature presence", "signed" if signed else "unsigned")
    if not signed:
        if not require:
            report.add("WARN", "Unsigned archive is not submission-ready", f"codesign verify exit {verify.returncode}")
        return
    report.check(verify.returncode == 0, "Code signature verifies deeply and strictly", f"exit {verify.returncode}")
    team = match.group(1) if match else None
    report.check(team == expected_team, "Public signing TeamIdentifier matches project", team or "none / ad-hoc")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("source_root", type=Path)
    parser.add_argument("--require-signature", action="store_true")
    parser.add_argument("--expected-version")
    parser.add_argument("--expected-build")
    parser.add_argument("--expected-sdk", help="For example: iphoneos27.1")
    parser.add_argument("--expected-web-count", type=int, default=32)
    parser.add_argument("--json", action="store_true", dest="json_output")
    options = parser.parse_args()
    report = Report()
    archive, root = options.archive.resolve(), options.source_root.resolve()
    try:
        if not archive.is_dir() or archive.suffix != ".xcarchive":
            raise ValueError("Archive argument must be an existing .xcarchive folder")
        settings = build_settings(root / "ios/QuestForge.xcodeproj/project.pbxproj")
        applications = list((archive / "Products/Applications").glob("*.app"))
        if len(applications) != 1:
            raise ValueError(f"Expected one archived .app, found {len(applications)}")
        app = applications[0]
        info = plist(app / "Info.plist")
        expected = {"CFBundleIdentifier": settings["PRODUCT_BUNDLE_IDENTIFIER"],
                    "CFBundleShortVersionString": options.expected_version or settings["MARKETING_VERSION"],
                    "CFBundleVersion": options.expected_build or settings["CURRENT_PROJECT_VERSION"]}
        for key, value in expected.items():
            report.check(str(info.get(key)) == value, key, f"actual={info.get(key)}; expected={value}")
        report.check(info.get("DTPlatformName") == "iphoneos" and str(info.get("DTSDKName", "")).startswith("iphoneos")
                     and info.get("CFBundleSupportedPlatforms") == ["iPhoneOS"], "Device SDK and platform", str(info.get("DTSDKName")))
        if options.expected_sdk:
            report.check(info.get("DTSDKName") == options.expected_sdk, "Expected device SDK", options.expected_sdk)
        report.check(info.get("MinimumOSVersion") == settings["IPHONEOS_DEPLOYMENT_TARGET"], "Minimum iOS version", str(info.get("MinimumOSVersion")))
        report.check(info.get("UIDeviceFamily") == [1] and info.get("UISupportedInterfaceOrientations") == ["UIInterfaceOrientationPortrait"],
                     "iPhone-only portrait configuration")
        executable = app / str(info.get("CFBundleExecutable", ""))
        report.check(executable.is_file() and bool(executable.stat().st_mode & 0o111), "Main executable is present and executable")
        architectures = command(["/usr/bin/xcrun", "lipo", "-archs", str(executable)])
        report.check(architectures.returncode == 0 and architectures.stdout.strip().split() == ["arm64"], "Main executable is device arm64", architectures.stdout.strip())
        archive_info = plist(archive / "Info.plist").get("ApplicationProperties", {})
        report.check(archive_info.get("CFBundleIdentifier") == info.get("CFBundleIdentifier")
                     and str(archive_info.get("CFBundleVersion")) == str(info.get("CFBundleVersion")), "Archive metadata matches bundled app")
        manifest = json.loads((root / "ios/web-assets-manifest.json").read_text())
        if not isinstance(manifest, dict) or not all(isinstance(key, str) and isinstance(value, str)
                and not PurePosixPath(key).is_absolute() and ".." not in PurePosixPath(key).parts
                and re.fullmatch(r"[0-9a-f]{64}", value) for key, value in manifest.items()):
            raise ValueError("Invalid web asset hash manifest")
        report.check(len(manifest) == options.expected_web_count, "Expected offline web file count", str(len(manifest)))
        report.section("Production docs hash sync", lambda: compare_map(report, "Production docs match manifest", selected_docs(root / "docs"), manifest))
        report.section("Prepared web folder hash sync", lambda: compare_map(report, "Prepared Web matches manifest", file_map(root / "ios/QuestForgeApp/Web"), manifest))
        report.section("Archived web folder hash sync", lambda: compare_map(report, "Archived Web matches manifest", file_map(app / "Web"), manifest))
        required_web = {"index.html", "native.js", "privacy.html", "support.html"}
        report.check(required_web <= set(manifest) and all((app / "Web" / name).is_file() for name in required_web),
                     "Game, native bridge, privacy, and support are bundled")
        report.section("Current source sync", lambda: verify_sources(report, root, app / "Web", manifest))
        report.section("Icon validation", lambda: verify_icon(report, root, app))
        report.section("Privacy and capability audit", lambda: verify_privacy(report, root, app, info))
        report.section("Signature validation", lambda: verify_signature(report, app, settings["DEVELOPMENT_TEAM"], options.require_signature))
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as error:
        report.add("FAIL", "Package structure", f"{type(error).__name__}: {error}")

    failed = sum(check["status"] == "FAIL" for check in report.checks)
    warnings = sum(check["status"] == "WARN" for check in report.checks)
    result = {"archive": str(archive), "source_root": str(root), "passed": failed == 0,
              "failures": failed, "warnings": warnings, "checks": report.checks,
              "limits": "Does not verify App Store acceptance, provisioning suitability, keychain private keys, real-device behavior, or submission completion."}
    if options.json_output:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        for check in report.checks:
            print(f"{check['status']}: {check['check']}" + (f" — {check['detail']}" if check["detail"] else ""))
        print(f"\n{'PASS' if not failed else 'FAIL'}: {len(report.checks)} checks, {failed} failures, {warnings} warnings.")
        print(result["limits"])
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
