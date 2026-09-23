#!/usr/bin/env python3
"""Regression checks for the requested BE6500 default LED profile."""

from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
LUCI = ROOT / "package/be6500-local/luci-app-rejected-clients"
CONFIGS = (
    LUCI / "root/etc/config/be6500_oem",
    ROOT / "package/be6500-local/be6500-current-config/files/etc/config/be6500_oem",
)
MIGRATION = LUCI / "root/etc/uci-defaults/99-be6500-led-defaults"
PAGES = LUCI / "root/www/be6500-oem/Native_JS/pages.js"
REVISION = "20260924-1"
EXPECTED = [
    ("overheat", "red", "fast"),
    ("upgrading", "red+green", "fast"),
    ("booting", "green", "fast"),
    ("wifi_off", "red+blue", "slow"),
    ("plugin", "red+green", "steady"),
    ("usb", "green+blue", "steady"),
    ("offline", "green", "steady"),
    ("online", "blue", "fast"),
]


def parse_uci_rules(text: str):
    rules = []
    for block in re.findall(r"config led_rule\n(.*?)(?=\nconfig |\Z)", text, re.S):
        values = dict(re.findall(r"option (state|color|effect) '([^']+)'", block))
        rules.append((values["state"], values["color"], values["effect"]))
    return rules


class LedDefaultsTest(unittest.TestCase):
    def test_both_image_configs_match_requested_profile(self):
        for path in CONFIGS:
            with self.subTest(path=path):
                text = path.read_text()
                self.assertEqual(parse_uci_rules(text), EXPECTED)
                self.assertIn(f"option defaults_revision '{REVISION}'", text)

    def test_preserved_config_migration_matches(self):
        text = MIGRATION.read_text()
        rules = re.search(r"<<'RULES'\n(.*?)\nRULES", text, re.S).group(1)
        self.assertEqual(
            [tuple(line.split()) for line in rules.splitlines() if line.strip()],
            EXPECTED,
        )
        self.assertEqual(text.count(REVISION), 2)

    def test_web_fallback_matches(self):
        text = PAGES.read_text()
        match = re.search(
            r"var rules = result\.rules.*?: \[(.*?)\n\s*\];",
            text,
            re.S,
        )
        self.assertIsNotNone(match)
        rules = re.findall(
            r"state: '([^']+)', color: '([^']+)', mode: '([^']+)'",
            match.group(1),
        )
        self.assertEqual(rules, EXPECTED)


if __name__ == "__main__":
    unittest.main()
