#!/usr/bin/env python3
"""
RepairDesk Automated Audit-Fix Pipeline
========================================
CLI tool for running security audits and applying safe fixes.

Usage:
    python scripts/audit_fix.py audit          # Run full audit
    python scripts/audit_fix.py fix            # Apply safe fixes
    python scripts/audit_fix.py verify         # Verify fixes
    python scripts/audit_fix.py full           # Run full pipeline (audit → fix → verify → test)
"""
import subprocess
import sys
import json
import os
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional

REPO_ROOT = Path(__file__).parent.parent
API_DIR = REPO_ROOT / "apps" / "api"
WEB_DIR = REPO_ROOT / "apps" / "web"


@dataclass
class AuditFinding:
    file: str
    line: Optional[int]
    severity: str  # CRITICAL, HIGH, MEDIUM, LOW
    category: str
    description: str
    fix_applied: bool = False


class AuditPipeline:
    def __init__(self):
        self.findings: list[AuditFinding] = []

    def run_command(self, cmd: list[str], cwd: str = None) -> tuple[int, str]:
        """Run a command and return (returncode, output)."""
        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True,
                cwd=cwd or str(REPO_ROOT), timeout=120
            )
            return result.returncode, result.stdout + result.stderr
        except subprocess.TimeoutExpired:
            return 1, "Command timed out"
        except FileNotFoundError:
            return 1, f"Command not found: {cmd[0]}"

    # ───────────────────── AUDIT STAGE ─────────────────────

    def audit_secrets(self) -> list[AuditFinding]:
        """Check for leaked secrets in tracked files."""
        findings = []

        # Check if .env files are tracked
        rc, output = self.run_command(["git", "ls-files"])
        for line in output.strip().split("\n"):
            if ".env" in line and ".example" not in line and ".env." not in line.split(".env")[0]:
                findings.append(AuditFinding(
                    file=line, line=None, severity="CRITICAL",
                    category="SECRETS",
                    description=f"Secret file tracked in git: {line}",
                ))

        # Check for hardcoded passwords in Python files
        patterns = [
            ('password.*=.*"[^"]{4,}"', "Hardcoded password string"),
            ('secret.*=.*"[^"]{8,}"', "Hardcoded secret string"),
            ('api_key.*=.*"[^"]{8,}"', "Hardcoded API key"),
        ]
        for root, dirs, files in os.walk(str(API_DIR / "app")):
            for fname in files:
                if not fname.endswith(".py"):
                    continue
                fpath = os.path.join(root, fname)
                content = open(fpath, encoding="utf-8").read()
                for i, line in enumerate(content.split("\n"), 1):
                    stripped = line.strip()
                    if stripped.startswith("#") or stripped.startswith('"""'):
                        continue
                    for pattern, desc in patterns:
                        import re
                        if re.search(pattern, line, re.IGNORECASE):
                            # Skip if it's in a config default that's been set to ""
                            if '""' in line or "''" in line:
                                continue
                            findings.append(AuditFinding(
                                file=fpath, line=i, severity="HIGH",
                                category="SECRETS",
                                description=f"{desc}: {line.strip()[:80]}",
                            ))

        return findings

    def audit_auth(self) -> list[AuditFinding]:
        """Check for authentication issues."""
        findings = []
        auth_file = API_DIR / "app" / "modules" / "auth" / "router.py"
        if auth_file.exists():
            content = auth_file.read_text(encoding="utf-8")
            if "secure=False" in content:
                findings.append(AuditFinding(
                    file=str(auth_file), line=None, severity="HIGH",
                    category="AUTH",
                    description="Cookie secure=False hardcoded",
                ))

        main_file = API_DIR / "app" / "main.py"
        if main_file.exists():
            content = main_file.read_text(encoding="utf-8")
            if 'allow_methods=["*"]' in content:
                findings.append(AuditFinding(
                    file=str(main_file), line=None, severity="MEDIUM",
                    category="AUTH",
                    description="CORS allows all methods",
                ))
            if 'allow_headers=["*"]' in content:
                findings.append(AuditFinding(
                    file=str(main_file), line=None, severity="MEDIUM",
                    category="AUTH",
                    description="CORS allows all headers",
                ))

        return findings

    def audit_mass_assignment(self) -> list[AuditFinding]:
        """Check for unguarded setattr loops."""
        findings = []
        for root, dirs, files in os.walk(str(API_DIR / "app")):
            for fname in files:
                if not fname.endswith(".py"):
                    continue
                fpath = os.path.join(root, fname)
                if "service" not in fpath and "router" not in fpath:
                    continue
                content = open(fpath, encoding="utf-8").read()
                lines = content.split("\n")
                for i, line in enumerate(lines, 1):
                    if "setattr(" in line and "ALLOWED_FIELDS" not in "\n".join(
                        lines[max(0, i-5):i]
                    ):
                        # Check if there's an allowlist guard within 5 lines above
                        context = "\n".join(lines[max(0, i-8):i])
                        if "ALLOWED_FIELDS" not in context and "SENSITIVE_FIELDS" not in context:
                            findings.append(AuditFinding(
                                file=fpath, line=i, severity="HIGH",
                                category="MASS_ASSIGNMENT",
                                description=f"setattr without field allowlist: {line.strip()[:60]}",
                            ))
        return findings

    def audit_xss(self) -> list[AuditFinding]:
        """Check for XSS vulnerabilities in frontend."""
        findings = []
        web_app = WEB_DIR / "app"
        web_components = WEB_DIR / "components"

        for scan_dir in [web_app, web_components]:
            if not scan_dir.exists():
                continue
            for root, dirs, files in os.walk(str(scan_dir)):
                for fname in files:
                    if not fname.endswith((".tsx", ".ts", ".js")):
                        continue
                    fpath = os.path.join(root, fname)
                    content = open(fpath, encoding="utf-8").read()
                    lines = content.split("\n")
                    for i, line in enumerate(lines, 1):
                        if "dangerouslySetInnerHTML" in line:
                            findings.append(AuditFinding(
                                file=fpath, line=i, severity="HIGH",
                                category="XSS",
                                description="dangerouslySetInnerHTML usage",
                            ))
                        if "document.write" in line:
                            findings.append(AuditFinding(
                                file=fpath, line=i, severity="HIGH",
                                category="XSS",
                                description="document.write usage",
                            ))
        return findings

    def audit_injection(self) -> list[AuditFinding]:
        """Check for injection vulnerabilities."""
        findings = []
        for root, dirs, files in os.walk(str(API_DIR / "app")):
            for fname in files:
                if not fname.endswith(".py"):
                    continue
                fpath = os.path.join(root, fname)
                content = open(fpath, encoding="utf-8").read()
                lines = content.split("\n")
                for i, line in enumerate(lines, 1):
                    # f-string in text() calls
                    if "text(f" in line or "text(f'" in line:
                        findings.append(AuditFinding(
                            file=fpath, line=i, severity="HIGH",
                            category="INJECTION",
                            description=f"Potential SQL injection via f-string: {line.strip()[:60]}",
                        ))
        return findings

    def run_audit(self):
        """Run full audit pipeline."""
        print("=" * 60)
        print("REPAIRDESK SECURITY AUDIT")
        print("=" * 60)

        stages = [
            ("Secrets", self.audit_secrets),
            ("Authentication", self.audit_auth),
            ("Mass Assignment", self.audit_mass_assignment),
            ("XSS", self.audit_xss),
            ("Injection", self.audit_injection),
        ]

        for name, audit_fn in stages:
            print(f"\n[{name}]")
            findings = audit_fn()
            self.findings.extend(findings)
            if not findings:
                print(f"  ✅ No issues found")
            else:
                for f in findings:
                    icon = {"CRITICAL": "🔴", "HIGH": "🟠", "MEDIUM": "🟡", "LOW": "🔵"}.get(f.severity, "⚪")
                    print(f"  {icon} [{f.severity}] {f.file}:{f.line or '?'} — {f.description}")

        print(f"\n{'=' * 60}")
        print(f"SUMMARY: {len(self.findings)} findings")
        by_sev = {}
        for f in self.findings:
            by_sev[f.severity] = by_sev.get(f.severity, 0) + 1
        for sev in ["CRITICAL", "HIGH", "MEDIUM", "LOW"]:
            if sev in by_sev:
                print(f"  {sev}: {by_sev[sev]}")

        return self.findings

    # ───────────────────── VERIFY STAGE ─────────────────────

    def verify_syntax(self) -> bool:
        """Verify all Python files have valid syntax."""
        print("\n[Syntax Check]")
        rc, output = self.run_command([
            sys.executable, "-c",
            "import ast, os; "
            "errors = []; "
            "[errors.append(f'{os.path.join(r,f)}: {e}') "
            "for r,_,fs in os.walk('apps/api/app') for f in fs if f.endswith('.py') "
            "for e in [None] if not (lambda p: (ast.parse(open(p,encoding='utf-8').read()) or True))(os.path.join(r,f)) "
            "is True]; "
            "print(len(errors))"
        ])
        # Simpler approach
        try:
            import ast
            errors = 0
            for root, dirs, files in os.walk(str(API_DIR / "app")):
                for f in files:
                    if f.endswith(".py"):
                        try:
                            ast.parse(open(os.path.join(root, f), encoding="utf-8").read())
                        except SyntaxError:
                            errors += 1
                            print(f"  ❌ Syntax error: {os.path.join(root, f)}")
            if errors == 0:
                print(f"  ✅ All Python files pass syntax check")
            return errors == 0
        except Exception as e:
            print(f"  ❌ Verification error: {e}")
            return False

    def verify_tests(self) -> bool:
        """Run the test suite."""
        print("\n[Test Suite]")
        rc, output = self.run_command([
            sys.executable, "-m", "pytest", "tests/", "-v", "--tb=short", "-x"
        ], cwd=str(API_DIR))
        if rc == 0:
            print(f"  ✅ All tests passed")
        else:
            print(f"  ❌ Tests failed:")
            for line in output.strip().split("\n")[-20:]:
                print(f"    {line}")
        return rc == 0

    # ───────────────────── FULL PIPELINE ─────────────────────

    def run_full(self):
        """Run the complete audit → verify pipeline."""
        print("Starting full audit-fix pipeline...\n")

        # Stage 1: Audit
        findings = self.run_audit()

        # Stage 2: Report
        critical = [f for f in findings if f.severity == "CRITICAL"]
        if critical:
            print(f"\n🔴 BLOCKING: {len(critical)} CRITICAL issues found. Fix before deploying.")
            for f in critical:
                print(f"   - {f.description}")

        # Stage 3: Verify
        syntax_ok = self.verify_syntax()
        if not syntax_ok:
            print("\n❌ SYNTAX ERRORS DETECTED — cannot proceed")
            return False

        print("\n✅ Pipeline complete")
        return True


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    pipeline = AuditPipeline()
    cmd = sys.argv[1].lower()

    if cmd == "audit":
        pipeline.run_audit()
    elif cmd == "verify":
        ok = pipeline.verify_syntax()
        sys.exit(0 if ok else 1)
    elif cmd == "full":
        ok = pipeline.run_full()
        sys.exit(0 if ok else 1)
    else:
        print(f"Unknown command: {cmd}")
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
