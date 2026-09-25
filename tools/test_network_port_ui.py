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
LUCI_PATCH_SERVICE = PKG / "root/etc/init.d/be6500-luci-patches"
PHYSICAL_PORTS = PKG / "root/www/luci-static/resources/be6500/physicalports_v45.js"
STORAGE = PKG / "htdocs/luci-static/resources/view/status/include/25_storage.js"
CURRENT_CONFIG = ROOT / "package/be6500-local/be6500-current-config"
IFNAME_MIGRATOR = CURRENT_CONFIG / "files/be6500-migrate-network-ifname"
IFNAME_DEFAULT = CURRENT_CONFIG / "files/97-be6500-migrate-network-ifname"
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

    def test_unvalidated_usb_phys_stay_out_of_persistent_boot_path(self):
        for path in KERNEL_CONFIGS:
            source = path.read_text()
            self.assertIn("# CONFIG_PHY_QCOM_M31_USB is not set", source, path)
            self.assertIn("# CONFIG_PHY_IPQ_UNIPHY_USB is not set", source, path)
            self.assertNotIn("CONFIG_PHY_QCOM_M31_USB=y", source, path)
            self.assertNotIn("CONFIG_PHY_IPQ_UNIPHY_USB=y", source, path)

    def test_boot_validated_v39_kernel_settings_are_preserved(self):
        for path in KERNEL_CONFIGS:
            source = path.read_text()
            self.assertIn("CONFIG_MDIO_IPQ4019=m", source, path)
            self.assertIn("CONFIG_REGULATOR_CPR3_NPU=y", source, path)
            self.assertIn("CONFIG_PSTORE=y", source, path)
            self.assertIn("CONFIG_PSTORE_RAM=y", source, path)
            self.assertIn("CONFIG_REED_SOLOMON=y", source, path)

    def test_patcher_replaces_old_physical_cards_in_unminified_luci_idempotently(self):
        with tempfile.TemporaryDirectory() as td:
            temp = pathlib.Path(td)
            interfaces = temp / "interfaces.js"
            switch_view = temp / "switch.js"
            old_menu = temp / "be6500-network-ports.json"
            header = temp / "header.ut"
            cache = temp / "cache"
            (cache / "luci-modulecache").mkdir(parents=True)
            interfaces.write_text(
                "'require network';'require be6500.ports as be6500ports';\n"
                "var isReadonlyView = null;\n"
                "return { load: function() { return Promise.all([\n"
                "\t\t\tuci.changes(),\n"
                "\t\t\tL.resolveDefault(be6500ports.load(), [])\n"
                "]); }, render: function(data) {\n"
                "\t\tvar be6500SwitchPorts = data[4] || [],\n"
                "\t\t    dslModemType = data[0], netDevs = data[1], m, s;\n"
                "\t\ts = m.section(form.GridSection, 'device', _('Devices'), be6500ports.render(be6500SwitchPorts)); /* be6500PhysicalPortCards */\n"
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
            self.assertNotIn("require be6500.ports as be6500ports", interface_source)
            self.assertEqual(1, interface_source.count("require be6500.physicalports_v45 as be6500ports"))
            self.assertEqual(1, interface_source.count("be6500ports.load()"))
            self.assertEqual(1, interface_source.count("be6500PhysicalPortCards"))
            self.assertIn("be6500SwitchPorts = data[4]", interface_source)
            self.assertIn("be6500ports.render(be6500SwitchPorts)", interface_source)
            self.assertIn("new form.Map('network', _('Switch'), _('description'))", switch_source)
            self.assertFalse(old_menu.exists())
            self.assertIn("be6500v27", header.read_text())

    def test_patcher_replaces_old_physical_cards_in_minified_release_luci(self):
        with tempfile.TemporaryDirectory() as td:
            temp = pathlib.Path(td)
            interfaces = temp / "interfaces.js"
            interfaces.write_text(
                "'use strict';'require network';'require be6500.ports as be6500ports';var isReadonlyView=null;"
                "return view.extend({load:function(){return Promise.all(["
                "network.getDSLModemType(),network.getDevices(),fs.lines('/etc/iproute2/rt_tables'),uci.changes(),L.resolveDefault(be6500ports.load(),[])]);},"
                "render:function(data){var be6500SwitchPorts=data[4]||[],dslModemType=data[0],netDevs=data[1],m,s,o;"
                "s=m.section(form.GridSection,'device',_('Devices'),be6500ports.render(be6500SwitchPorts));/* be6500PhysicalPortCards */return m.render();}});"
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
            self.assertNotIn("require be6500.ports as be6500ports", source)
            self.assertEqual(1, source.count("require be6500.physicalports_v45 as be6500ports"))
            self.assertEqual(1, source.count("be6500ports.load()"))
            self.assertEqual(1, source.count("be6500PhysicalPortCards"))
            self.assertIn("be6500SwitchPorts=data[4]", source)
            self.assertIn("be6500ports.render(be6500SwitchPorts)", source)

    def test_versioned_physical_port_module_is_a_valid_luci_constructor(self):
        source = PHYSICAL_PORTS.read_text()
        self.assertIn("'require baseclass';", source)
        self.assertIn("return baseclass.extend({", source)
        self.assertIn("getSwconfigPortState", source)
        self.assertIn("portCard('LAN1', 3", source)
        self.assertIn("portCard('LAN2', 2", source)
        self.assertIn("portCard('LAN3', 1", source)
        self.assertIn("admin/router_settings/ports", source)

    def test_storage_uses_emmc_mounts_and_detects_ram_root(self):
        source = STORAGE.read_text()
        self.assertIn("getMountPoints", source)
        self.assertIn("getBlockDevices", source)
        self.assertIn("/^mmcblk\\d+$/", source)
        self.assertIn("物理 eMMC 容量", source)
        self.assertIn("mounts[i].mount == '/overlay'", source)
        self.assertIn("根目录（RAM，持久化存储未挂载）", source)

    def test_preserved_ifname_is_migrated_without_network_restart(self):
        source = IFNAME_MIGRATOR.read_text()
        default = IFNAME_DEFAULT.read_text()
        makefile = (CURRENT_CONFIG / "Makefile").read_text()

        self.assertIn("PKG_RELEASE:=10", makefile)
        self.assertIn("be6500-migrate-network-ifname", makefile)
        self.assertIn("Package/be6500-current-config/postinst", makefile)
        self.assertIn("migrate_bridge_interfaces", source)
        self.assertIn("migrate_bridge_devices", source)
        self.assertIn("migrate_plain_interfaces", source)
        self.assertIn("network.$section.ports=$port", source)
        self.assertIn("network.$section.device=$ifname", source)
        self.assertIn("uci_call commit network", source)
        self.assertIn("/usr/libexec/be6500-migrate-network-ifname", default)
        self.assertNotIn("network restart", source)
        self.assertNotIn("network reload", source)
        self.assertNotIn("wifi reload", source)
        self.assertFalse((CURRENT_CONFIG / "files/97-be6500-remove-ifname-migration").exists())

    def test_luci_patch_service_rechecks_assets_without_network_reload(self):
        source = LUCI_PATCH_SERVICE.read_text()
        self.assertIn("be6500-patch-luci-network", source)
        self.assertIn("be6500-luci-overrides/status/include", source)
        self.assertNotIn("wifi reload", source)
        self.assertNotIn("network restart", source)

    def test_package_installs_factory_port_helpers_and_network_patcher(self):
        makefile = MAKEFILE.read_text()
        self.assertIn("PKG_RELEASE:=43", makefile)
        self.assertIn("be6500-patch-luci-network", makefile)
        self.assertIn("be6500-luci-patches", makefile)
        self.assertIn("Package/luci-app-rejected-clients/postinst", makefile)
        self.assertIn('BE6500_LUCI_INTERFACES_VIEW="$$interfaces"', makefile)
        self.assertIn('status_source="$$root/usr/share/be6500-luci-overrides/status/include"', makefile)
        self.assertNotIn("luci-static/resources/be6500/ports.js", makefile)
        self.assertIn("luci-static/resources/be6500/physicalports_v45.js", makefile)
        self.assertIn("be6500-game-port", makefile)
        self.assertIn("be6500-iptv-priority", makefile)
        self.assertNotIn("be6500-port-control $(1)", makefile)


if __name__ == "__main__":
    unittest.main()
