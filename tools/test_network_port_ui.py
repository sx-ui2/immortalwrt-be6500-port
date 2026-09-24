import json
import os
import pathlib
import subprocess
import tempfile
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
PKG = ROOT / "package/be6500-local/luci-app-rejected-clients"
PATCHER = PKG / "root/usr/libexec/be6500-patch-luci-network"
MENU = PKG / "root/usr/share/luci/menu.d/be6500-network-ports.json"
MAKEFILE = PKG / "Makefile"
CONTROLLER = PKG / "root/usr/lib/lua/luci/controller/be6500_oem_beta.lua"


class NetworkPortUiTests(unittest.TestCase):
    def test_menu_exposes_stock_switch_vlan_editor(self):
        menu = json.loads(MENU.read_text())
        entry = menu["admin/network/ports"]
        self.assertEqual("LAN 端口与 VLAN", entry["title"])
        self.assertEqual("view", entry["action"]["type"])
        self.assertEqual("network/switch", entry["action"]["path"])

    def test_physical_chassis_mapping_matches_switch_ports(self):
        source = CONTROLLER.read_text()
        self.assertIn('local iptv_ports = { lan1 = "3", lan2 = "2", lan3 = "1" }', source)

    def test_patcher_links_devices_to_vlan_editor_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as td:
            temp = pathlib.Path(td)
            interfaces = temp / "interfaces.js"
            switch_view = temp / "switch.js"
            header = temp / "header.ut"
            cache = temp / "cache"
            (cache / "luci-modulecache").mkdir(parents=True)
            interfaces.write_text(
                "s = m.section(form.GridSection, 'device', _('Devices'));\n"
            )
            switch_view.write_text(
                "m = new form.Map('network', _('Switch'), _('description'));\n"
            )
            header.write_text(
                "luci.js?v=26.236.50592~9b8ee64-{{ pkgs_update_time }}\n"
            )
            env = os.environ.copy()
            env.update({
                "BE6500_LUCI_INTERFACES_VIEW": str(interfaces),
                "BE6500_LUCI_SWITCH_VIEW": str(switch_view),
                "BE6500_LUCI_HEADERS": str(header),
                "BE6500_LUCI_CACHE_ROOT": str(cache),
            })
            for _ in range(2):
                subprocess.run(["sh", str(PATCHER)], env=env, check=True)

            interface_source = interfaces.read_text()
            switch_source = switch_view.read_text()
            self.assertEqual(1, interface_source.count("be6500PhysicalPortLink"))
            self.assertIn("admin/network/ports", interface_source)
            self.assertIn("eth1.<VLAN ID>", interface_source)
            self.assertEqual(1, switch_source.count("be6500PhysicalPortTitle"))
            self.assertIn("LAN 端口与 VLAN", switch_source)
            self.assertIn("be6500v21", header.read_text())

    def test_package_installs_network_patcher_and_menu(self):
        makefile = MAKEFILE.read_text()
        self.assertIn("PKG_RELEASE:=36", makefile)
        self.assertIn("be6500-patch-luci-network", makefile)
        self.assertIn("be6500-network-ports.json", makefile)


if __name__ == "__main__":
    unittest.main()
