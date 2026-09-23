#!/usr/bin/env python3
"""Regression checks for the BE6500 factory smartqos mode mapping."""

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
QOS_APPLY = ROOT / "package/be6500-local/luci-app-rejected-clients/root/usr/sbin/be6500-qos-apply"
CONTROLLER = ROOT / "package/be6500-local/luci-app-rejected-clients/root/usr/lib/lua/luci/controller/be6500_oem_beta.lua"
PAGES = ROOT / "package/be6500-local/luci-app-rejected-clients/root/www/be6500-oem/Native_JS/pages.js"
DEFAULTS = (
    ROOT / "package/be6500-local/luci-app-rejected-clients/root/etc/config/be6500_oem",
    ROOT / "package/be6500-local/be6500-current-config/files/etc/config/be6500_oem",
)


class FactoryQosModesTest(unittest.TestCase):
    def test_factory_classes_are_preserved(self):
        source = QOS_APPLY.read_text()
        self.assertIn("MODE_DOWN", source)
        self.assertIn("MODE_DEFAULT", source)
        self.assertIn("MODE_WEB", source)
        self.assertIn("ct mark 801 ip dscp set cs6 meta priority set 1:300", source)
        self.assertIn("meta mark 255 ip dscp set cs1 meta priority set 1:200", source)
        self.assertIn("udp dport 53 ip dscp set cs5 meta priority set 1:400", source)
        self.assertIn("tcp dport 2002 ct mark set 801", source)

    def test_no_guessed_application_ports(self):
        source = QOS_APPLY.read_text()
        for guessed in ("3074", "3478-3481", "3659", "27000-27200"):
            self.assertNotIn(guessed, source)

    def test_switch_is_live_and_does_not_restart_wifi(self):
        source = QOS_APPLY.read_text()
        self.assertIn("defunct_all", source)
        self.assertNotIn("wifi reload", source)
        controller = CONTROLLER.read_text()
        self.assertIn('/usr/sbin/be6500-qos-apply reload 2>&1', controller)

    def test_smart_balance_is_the_image_default(self):
        for config in DEFAULTS:
            self.assertIn("config settings 'qos'\n\toption mode '1'", config.read_text())
        controller = CONTROLLER.read_text()
        self.assertIn('qos", "mode") or "1"', controller)

    def test_ui_explains_all_three_factory_modes(self):
        source = PAGES.read_text()
        for label in ("性能优先", "智能均衡", "上网优先"):
            self.assertIn(label, source)
        self.assertIn("按原厂 smartqos 逻辑", source)


if __name__ == "__main__":
    unittest.main()
