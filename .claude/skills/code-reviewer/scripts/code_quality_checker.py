#!/usr/bin/env python3
"""
Comprehensive Code Quality Checker & Security Audit Engine
for TypeScript, JavaScript, Python (RepairDesk Architecture).
"""

import os
import sys
import re
import ast
import json
import argparse
from pathlib import Path
from typing import Dict, List, Any

class CodeQualityChecker:
    """Production-grade static analyzer for code review and security auditing."""
    
    def __init__(self, target_path: str, verbose: bool = False):
        self.target_path = Path(target_path)
        self.verbose = verbose
        self.results: Dict[str, Any] = {
            "status": "pending",
            "target": str(self.target_path),
            "files_scanned": 0,
            "findings": [],
            "summary": {
                "critical": 0,
                "high": 0,
                "medium": 0,
                "low": 0,
                "info": 0,
                "total": 0,
            }
        }

    def run(self) -> Dict[str, Any]:
        """Execute static code analysis."""
        print(f"🚀 Running Code Quality Checker & Security Analyzer...")
        print(f"📁 Target: {self.target_path.resolve()}")
        
        try:
            self.validate_target()
            self.analyze()
            self.generate_report()
            self.results["status"] = "success"
            return self.results
        except Exception as e:
            print(f"❌ Error during analysis: {e}")
            self.results["status"] = "error"
            self.results["error"] = str(e)
            return self.results

    def validate_target(self):
        if not self.target_path.exists():
            raise ValueError(f"Target path does not exist: {self.target_path}")

    def add_finding(self, severity: str, file_path: Path, line_no: int, rule_id: str, message: str, suggestion: str):
        rel_path = file_path.relative_to(self.target_path) if file_path.is_relative_to(self.target_path) else file_path
        severity_lower = severity.lower()
        if severity_lower in self.results["summary"]:
            self.results["summary"][severity_lower] += 1
            self.results["summary"]["total"] += 1
        
        self.results["findings"].append({
            "severity": severity.upper(),
            "rule_id": rule_id,
            "file": str(rel_path).replace("\\", "/"),
            "line": line_no,
            "message": message,
            "suggestion": suggestion,
        })

    def analyze(self):
        # Walk directories ignoring node_modules, .venv, .git, build artifacts
        ignore_dirs = {
            "node_modules", ".venv", "venv", ".git", ".next", "dist",
            "build", "__pycache__", ".pytest_cache", ".agent", ".claude"
        }

        files_to_scan = []
        for root, dirs, files in os.walk(self.target_path):
            dirs[:] = [d for d in dirs if d not in ignore_dirs]
            for file in files:
                ext = Path(file).suffix.lower()
                if ext in {".py", ".ts", ".tsx", ".js", ".jsx"}:
                    files_to_scan.append(Path(root) / file)

        self.results["files_scanned"] = len(files_to_scan)
        if self.verbose:
            print(f"🔍 Discovered {len(files_to_scan)} source files to analyze.")

        for file_path in files_to_scan:
            self.scan_file(file_path)

    def scan_file(self, file_path: Path):
        ext = file_path.suffix.lower()
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
                lines = content.splitlines()
        except Exception:
            return

        if ext == ".py":
            self.scan_python(file_path, content, lines)
        elif ext in {".ts", ".tsx", ".js", ".jsx"}:
            self.scan_typescript(file_path, content, lines)

    def scan_python(self, file_path: Path, content: str, lines: List[str]):
        # 1. Regex checks
        for i, line in enumerate(lines, start=1):
            # Check for silent exception swallow
            if re.search(r"except\s+Exception:\s*pass", line) or re.search(r"except:\s*pass", line):
                self.add_finding(
                    "High", file_path, i, "PY-ERR-01",
                    "Silent exception swallow detected (`except Exception: pass`).",
                    "Log the error or re-raise; fail-closed rather than continuing with corrupted state."
                )

            # Check for hardcoded private keys / tokens
            if re.search(r"(?:api_key|secret_key|private_key|jwt_secret)\s*=\s*['\"][A-Za-z0-9_\-]{16,}['\"]", line, re.I):
                if "test" not in str(file_path).lower() and "example" not in str(file_path).lower():
                    self.add_finding(
                        "Critical", file_path, i, "PY-SEC-01",
                        "Potential hardcoded secret or API key.",
                        "Move secrets to environment variables via Pydantic BaseSettings."
                    )

            # Check for raw SQL interpolation (f-string in execute/text)
            if re.search(r"\b(?:execute|select_from)\s*\(\s*f['\"].*\{.*\}", line):
                self.add_finding(
                    "Critical", file_path, i, "PY-SEC-02",
                    "Possible SQL injection: f-string used in database execution.",
                    "Use parameterized queries with SQLAlchemy bind parameters (`bindparams`)."
                )

            # Check for blocking calls in async modules
            if "async def" in content:
                if re.search(r"\btime\.sleep\(", line):
                    self.add_finding(
                        "Medium", file_path, i, "PY-PERF-01",
                        "Synchronous `time.sleep` called in async file, blocking event loop.",
                        "Use `await asyncio.sleep(...)` instead."
                    )
                if re.search(r"\brequests\.(?:get|post|put|delete)\(", line):
                    self.add_finding(
                        "High", file_path, i, "PY-PERF-02",
                        "Synchronous `requests` call in async module blocks the asyncio event loop.",
                        "Use `httpx.AsyncClient` or run inside `loop.run_in_executor`."
                    )

        # 2. AST checks for Python
        try:
            tree = ast.parse(content, filename=str(file_path))
            for node in ast.walk(tree):
                # Detect queries inside for-loops (potential N+1)
                if isinstance(node, (ast.For, ast.AsyncFor)):
                    for child in ast.walk(node):
                        if isinstance(child, ast.Call):
                            call_name = ""
                            if isinstance(child.func, ast.Attribute):
                                call_name = child.func.attr
                            elif isinstance(child.func, ast.Name):
                                call_name = child.func.id
                            if call_name in {"execute"} and hasattr(child, "lineno"):
                                # Check if it executes a select query
                                self.add_finding(
                                    "Low", file_path, child.lineno, "PY-PERF-03",
                                    "Database query executed inside a loop (potential N+1 pattern).",
                                    "Consider batch querying with `IN` clause before the loop."
                                )
        except Exception:
            pass

    def scan_typescript(self, file_path: Path, content: str, lines: List[str]):
        for i, line in enumerate(lines, start=1):
            # Check for token storage in localStorage
            if re.search(r"localStorage\.setItem\s*\(\s*['\"](?:accessToken|refreshToken|token|jwt)['\"]", line, re.I):
                self.add_finding(
                    "High", file_path, i, "TS-SEC-01",
                    "Auth token stored in `localStorage` — vulnerable to XSS token theft.",
                    "Store tokens in `httpOnly` secure cookies."
                )

            # Check for dangerouslySetInnerHTML
            if "dangerouslySetInnerHTML" in line:
                self.add_finding(
                    "Medium", file_path, i, "TS-SEC-02",
                    "Use of `dangerouslySetInnerHTML` — potential DOM XSS vulnerability.",
                    "Ensure content is strictly sanitized using DOMPurify before rendering."
                )

            # Check for hardcoded localhost without environment fallback in client
            if re.search(r"fetch\s*\(\s*['\"]http://localhost", line):
                self.add_finding(
                    "Medium", file_path, i, "TS-CFG-01",
                    "Hardcoded `http://localhost` URL in fetch call.",
                    "Use `process.env.NEXT_PUBLIC_API_URL` environment variable."
                )

            # Check for any cast overload
            if re.search(r":\s*any\b", line) and "node_modules" not in str(file_path):
                # Count as Info
                pass

    def generate_report(self):
        s = self.results["summary"]
        print("\n" + "="*70)
        print("🔍 CODE REVIEW & STATIC ANALYSIS REPORT")
        print("="*70)
        print(f"📂 Target: {self.results['target']}")
        print(f"📄 Files Scanned: {self.results['files_scanned']}")
        print(f"🚨 Summary: {s['critical']} Critical | {s['high']} High | {s['medium']} Medium | {s['low']} Low | {s['info']} Info")
        print("="*70)

        if not self.results["findings"]:
            print("✨ Clean bill of health! No critical issues or anti-patterns detected.")
        else:
            print("\nFindings Detail:")
            for idx, f in enumerate(self.results["findings"][:20], start=1):
                icon = "🔴" if f["severity"] == "CRITICAL" else "🟠" if f["severity"] == "HIGH" else "🟡" if f["severity"] == "MEDIUM" else "🔵"
                print(f"\n{idx}. {icon} [{f['severity']}] {f['rule_id']} in {f['file']}:{f['line']}")
                print(f"   Issue: {f['message']}")
                print(f"   Fix:   {f['suggestion']}")
            
            if len(self.results["findings"]) > 20:
                print(f"\n... and {len(self.results['findings']) - 20} more findings.")
        print("\n" + "="*70 + "\n")

def main():
    parser = argparse.ArgumentParser(description="Code Quality Checker")
    parser.add_argument("target", help="Target path to analyze")
    parser.add_argument("--verbose", "-v", action="store_true", help="Enable verbose output")
    parser.add_argument("--json", action="store_true", help="Output results as JSON")
    parser.add_argument("--output", "-o", help="Output file path")
    args = parser.parse_args()

    checker = CodeQualityChecker(args.target, verbose=args.verbose)
    results = checker.run()

    if args.json:
        formatted = json.dumps(results, indent=2)
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(formatted)
            print(f"Report written to {args.output}")
        else:
            print(formatted)

if __name__ == "__main__":
    main()
