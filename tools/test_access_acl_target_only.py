#!/usr/bin/env python3
import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
PATCH = ROOT / "native-6.6/hostapd-acl-target-only.patch"
PREPARE = ROOT / "native-6.6/prepare-qsdk-wlan-open.sh"
CONTROLLER = ROOT / (
    "package/be6500-local/luci-app-rejected-clients/root/usr/lib/lua/luci/"
    "controller/be6500_oem_beta.lua"
)


class TargetOnlyAclTests(unittest.TestCase):
    def test_hostapd_exposes_non_disassociating_acl_mutations(self):
        patch = PATCH.read_text()
        self.assertEqual(patch.count('"ADD_MAC_NODISASSOC ", 19'), 2)
        self.assertEqual(patch.count('"DEL_MAC_NODISASSOC ", 19'), 2)
        for segment in patch.split("NODISASSOC")[1:]:
            branch = segment.split("} else if", 1)[0]
            self.assertNotIn("hostapd_disassoc_", branch)
            self.assertIn("hostapd_set_acl", branch)

    def test_prepare_patches_qsdk_source_that_overlays_openwrt_hostapd(self):
        prepare = PREPARE.read_text()
        self.assertIn("hostapd-acl-target-only.patch", prepare)
        self.assertIn("qca/src/network/services/hostapd", prepare)
        self.assertIn('patch --batch --forward -p1 -d "$hostapd_source"', prepare)

    def test_list_edits_use_safe_commands_and_targeted_disconnect(self):
        controller = CONTROLLER.read_text()
        self.assertIn('command_name == "deny_acl" and " ADD_MAC_NODISASSOC "', controller)
        self.assertIn('command_name == "accept_acl" and " DEL_MAC_NODISASSOC "', controller)
        self.assertIn('"deauthenticate " .. mac .. " reason=5"', controller)
        apply_policy = controller[controller.index("local function apply_mac_policy"):]
        apply_policy = apply_policy[:apply_policy.index("\nend", apply_policy.index("return true,")) + 4]
        self.assertNotIn("wifi reload", apply_policy)
        self.assertNotIn("encryption", apply_policy)


if __name__ == "__main__":
    unittest.main()
