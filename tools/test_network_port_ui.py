import json
import os
import pathlib
import subprocess
import tempfile
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
PKG = ROOT / "package/be6500-local/luci-app-rejected-clients"
PATCHER = PKG / "root/usr/libexec/be6500-patch-luci-network"
OLD_MENU = PKG / "root/usr/share/luci/menu.d/be6500-network-ports.json"
MENU = PKG / "root/usr/share/luci/menu.d/luci-app-rejected-clients.json"
MAKEFILE = PKG / "Makefile"
CONTROLLER = PKG / "root/usr/lib/lua/luci/controller/be6500_oem_beta.lua"
PAGES = PKG / "root/www/be6500-oem/Native_JS/pages.js"
TEMPLATE = PKG / "root/usr/lib/lua/luci/view/be6500_oem_beta/index.htm"
GAME_PORT = PKG / "root/usr/libexec/be6500-game-port"
IPTV_PRIORITY = PKG / "root/usr/libexec/be6500-iptv-priority"
FULL_RADIO_DTS = ROOT / "target/linux/qualcommax/files/arch/arm64/boot/dts/qcom/ipq5332-jdcloud-be6500-full-radio-initramfs.dts"
PORTS_JS = PKG / "root/www/luci-static/resources/be6500/ports.js"
LUCI_PATCH_SERVICE = PKG / "root/etc/init.d/be6500-luci-patches"
KERNEL_CONFIGS = [
    ROOT / "target/linux/qualcommax/ipq53xx/config-default",
    ROOT / "target/linux/qualcommax/ipq53xx/config-default.qsdk14",
    ROOT / "native-6.6/kernel-overrides/target-ipq53xx/config-default",
]


class NetworkPortUiTests(unittest.TestCase):
    def test_duplicate_network_menu_is_removed(self):
        self.assertFalse(OLD_MENU.exists())
        makefile = MAKEFILE.read_text()
        self.assertNotIn("be6500-network-ports.json", makefile)

    def test_router_settings_exposes_port_settings(self):
        menu = json.loads(MENU.read_text())
        entry = menu["admin/router_settings/ports"]
        self.assertEqual("端口设置", entry["title"])
        self.assertEqual("template", entry["action"]["type"])
        self.assertIn("ports:'routerSet/ports.html'", TEMPLATE.read_text())

    def test_physical_chassis_mapping_and_factory_port_roles(self):
        source = CONTROLLER.read_text()
        self.assertIn('local iptv_ports = { lan1 = "3", lan2 = "2", lan3 = "1" }', source)
        self.assertIn('method == "get_port_settings"', source)
        self.assertIn('method == "get_game_info"', source)
        self.assertIn('method == "set_game_info"', source)
        self.assertNotIn('method == "set_port_settings"', source)
        self.assertNotIn('name = "PortPoweroff"', source)

    def test_game_port_matches_factory_qca8386_qos_path(self):
        source = GAME_PORT.read_text()
        self.assertIn("lan1) port=3", source)
        self.assertIn("lan2) port=2", source)
        self.assertIn("lan3) port=1", source)
        self.assertIn("ssdk acl list bind 1 0 0", source)
        self.assertIn("ssdk qos ptpriprece set", source)
        self.assertIn("ssdk qos dscpmap set", source)
        self.assertIn("ssdk servcode config set", source)
        self.assertNotIn("wifi", source)
        self.assertNotIn("network reload", source)

    def test_frontend_exposes_factory_port_status_iptv_and_game_controls(self):
        source = PAGES.read_text()
        self.assertIn("function portsPage()", source)
        self.assertIn("网口信息", source)
        self.assertIn("自定义 IPTV 口", source)
        self.assertIn("自定义游戏网口", source)
        self.assertIn("游戏口传输的数据会被优先转发，延迟更低，适用于游戏和语音场景", source)
        self.assertIn("rpc('set_iptv_info'", source)
        self.assertIn("rpc('set_game_info'", source)
        self.assertNotIn("rpc('set_port_settings'", source)
        self.assertNotIn("eth1.<VLAN ID>", source)

    def test_iptv_vlan_priority_is_saved_and_applied(self):
        controller = CONTROLLER.read_text()
        frontend = PAGES.read_text()
        helper = IPTV_PRIORITY.read_text()
        self.assertIn("be6500_vlan_priority", controller)
        self.assertIn("vlan_priority", frontend)
        self.assertIn("egress-qos-map", helper)

    def test_persistent_radio_dts_reenables_usb_controller_and_phys(self):
        source = FULL_RADIO_DTS.read_text()
        self.assertIn("&hs_m31phy_0", source)
        self.assertIn("&ssuniphy_0", source)
        self.assertIn("&usb3", source)
        self.assertGreaterEqual(source.count('status = "okay";'), 3)

    def test_ipq5332_usb_phy_drivers_are_built_in(self):
        for path in KERNEL_CONFIGS:
            source = path.read_text()
            self.assertIn("CONFIG_PHY_QCOM_M31_USB=y", source, path)
            self.assertIn("CONFIG_PHY_IPQ_UNIPHY_USB=y", source, path)
            self.assertNotIn("# CONFIG_PHY_QCOM_M31_USB is not set", source, path)
            self.assertNotIn("# CONFIG_PHY_IPQ_UNIPHY_USB is not set", source, path)

    def test_patcher_adds_physical_cards_to_unminified_luci_idempotently(self):
        with tempfile.TemporaryDirectory() as td:
            temp = pathlib.Path(td)
            interfaces = temp / "interfaces.js"
            switch_view = temp / "switch.js"
            old_menu = temp / "be6500-network-ports.json"
            header = temp / "header.ut"
            cache = temp / "cache"
            (cache / "luci-modulecache").mkdir(parents=True)
            interfaces.write_text(
                "'require network';\n"
                "var isReadonlyView = null;\n"
                "return { load: function() { return Promise.all([\n"
                "\t\t\tuci.changes()\n"
                "]); }, render: function(data) {\n"
                "\t\tvar dslModemType = data[0], netDevs = data[1], m, s;\n"
                "\t\ts = m.section(form.GridSection, 'device', _('Devices'));\n"
                "} };\n"
            )
            switch_view.write_text(
                "m = new form.Map('network', 'LAN 端口与 VLAN', /* be6500PhysicalPortTitle */ _('description'));\n"
            )
            old_menu.write_text("{}\n")
            header.write_text(
                "luci.js?v=26.236.50592~9b8ee64-{{ pkgs_update_time }}\n"
            )
            env = os.environ.copy()
            env.update({
                "BE6500_LUCI_INTERFACES_VIEW": str(interfaces),
                "BE6500_LUCI_SWITCH_VIEW": str(switch_view),
                "BE6500_LUCI_OLD_PORT_MENU": str(old_menu),
                "BE6500_LUCI_HEADERS": str(header),
                "BE6500_LUCI_CACHE_ROOT": str(cache),
            })
            for _ in range(2):
                subprocess.run(["sh", str(PATCHER)], env=env, check=True)

            interface_source = interfaces.read_text()
            switch_source = switch_view.read_text()
            self.assertEqual(1, interface_source.count("be6500PhysicalPortCards"))
            self.assertIn("be6500ports.load()", interface_source)
            self.assertIn("be6500ports.render(be6500SwitchPorts)", interface_source)
            self.assertIn("require be6500.ports as be6500ports", interface_source)
            self.assertIn("new form.Map('network', _('Switch'), _('description'))", switch_source)
            self.assertFalse(old_menu.exists())
            self.assertIn("be6500v24", header.read_text())

    def test_patcher_adds_physical_cards_to_minified_release_luci(self):
        with tempfile.TemporaryDirectory() as td:
            temp = pathlib.Path(td)
            interfaces = temp / "interfaces.js"
            interfaces.write_text(
                "'use strict';'require network';var isReadonlyView=null;"
                "return view.extend({load:function(){return Promise.all(["
                "network.getDSLModemType(),network.getDevices(),fs.lines('/etc/iproute2/rt_tables'),uci.changes()]);},"
                "render:function(data){var dslModemType=data[0],netDevs=data[1],m,s,o;"
                "s=m.section(form.GridSection,'device',_('Devices'));return m.render();}});"
            )
            env = os.environ.copy()
            env.update({
                "BE6500_LUCI_INTERFACES_VIEW": str(interfaces),
                "BE6500_LUCI_SWITCH_VIEW": str(temp / "missing-switch.js"),
                "BE6500_LUCI_OLD_PORT_MENU": str(temp / "old-menu.json"),
                "BE6500_LUCI_HEADERS": str(temp / "missing-header.ut"),
                "BE6500_LUCI_CACHE_ROOT": str(temp),
            })
            for _ in range(2):
                subprocess.run(["sh", str(PATCHER)], env=env, check=True)

            source = interfaces.read_text()
            self.assertEqual(1, source.count("require be6500.ports as be6500ports"))
            self.assertEqual(1, source.count("be6500ports.load()"))
            self.assertEqual(1, source.count("be6500PhysicalPortCards"))
            self.assertIn("be6500SwitchPorts=data[4]", source)

    def test_physical_port_helper_uses_live_qca8386_state(self):
        source = PORTS_JS.read_text()
        self.assertIn("getSwconfigPortState", source)
        self.assertIn("callSwitchPorts('switch1')", source)
        self.assertIn("portCard('LAN1', 3", source)
        self.assertIn("portCard('LAN2', 2", source)
        self.assertIn("portCard('LAN3', 1", source)
        self.assertIn("admin/router_settings/ports", source)

    def test_luci_patch_service_rechecks_assets_without_network_reload(self):
        source = LUCI_PATCH_SERVICE.read_text()
        self.assertIn("be6500-patch-luci-network", source)
        self.assertNotIn("wifi reload", source)
        self.assertNotIn("network restart", source)

    def test_package_installs_factory_port_helpers_and_network_patcher(self):
        makefile = MAKEFILE.read_text()
        self.assertIn("PKG_RELEASE:=39", makefile)
        self.assertIn("be6500-patch-luci-network", makefile)
        self.assertIn("be6500-luci-patches", makefile)
        self.assertIn("luci-static/resources/be6500/ports.js", makefile)
        self.assertIn("be6500-game-port", makefile)
        self.assertIn("be6500-iptv-priority", makefile)
        self.assertNotIn("be6500-port-control $(1)", makefile)


if __name__ == "__main__":
    unittest.main()
