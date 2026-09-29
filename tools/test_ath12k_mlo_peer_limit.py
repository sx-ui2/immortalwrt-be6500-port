#!/usr/bin/env python3
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATCH = ROOT / "package/kernel/mac80211/patches/ath12k/1002-d-BE6500-fallback-zero-ML-peer-limit.patch"
MAKEFILE = ROOT / "package/kernel/mac80211/Makefile"
PINNED_WMI = Path("/tmp/be6500-ath12k-r9/wmi.c")


class Ath12kMloPeerLimitTest(unittest.TestCase):
    def test_patch_is_applied_by_mac80211_build(self):
        self.assertIn(PATCH.name, MAKEFILE.read_text())

    def test_fallback_is_board_local_and_only_replaces_invalid_limits(self):
        source = PATCH.read_text()
        self.assertIn('of_machine_is_compatible("jdcloud,be6500")', source)
        self.assertIn("!ab->max_ml_peer_supported", source)
        self.assertIn("ab->max_ml_peer_supported > ATH12K_MAX_MLO_PEERS", source)
        self.assertIn("ab->max_ml_peer_supported = 256;", source)
        self.assertIn("le32_to_cpu(fixed_param.max_num_ml_peers)", source)
        self.assertNotIn("ab->max_ml_peer_supported = 512", source)

    def test_patch_applies_to_pinned_qsdk_source(self):
        if not PINNED_WMI.exists():
            self.skipTest("pinned QSDK wmi.c audit copy is not present")
        subprocess.run(
            ["patch", "--dry-run", "--silent", "-p6", "-i", str(PATCH)],
            cwd=PINNED_WMI.parent,
            check=True,
        )


if __name__ == "__main__":
    unittest.main()
