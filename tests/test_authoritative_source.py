from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class AuthoritativeSourceTests(unittest.TestCase):
    def test_website_has_no_database_discovery_or_cache_backfill(self):
        source = (ROOT / "upload.py").read_text(encoding="utf-8")
        guard = (ROOT / "auto.sh").read_text(encoding="utf-8")
        combined = source + guard

        self.assertNotIn("/data3/dengz", combined)
        self.assertNotIn("/data/xuanrenSong", combined)
        self.assertNotIn("CM_POWER_DATABASE_ROOT", combined)
        self.assertNotIn("retain_cached_country_coverage", source)
        self.assertNotIn("retain_cached_comparison_coverage", source)
        self.assertNotIn("def process_data(", source)

    def test_direct_python_entrypoint_is_disabled(self):
        result = subprocess.run(
            [sys.executable, str(ROOT / "upload.py")],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Direct website data generation is disabled", result.stderr)

    def test_legacy_shell_entrypoint_is_disabled(self):
        result = subprocess.run(
            ["bash", str(ROOT / "auto.sh")],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertEqual(result.returncode, 2)
        self.assertIn("Direct CM Power Website updates are disabled", result.stderr)


if __name__ == "__main__":
    unittest.main()
