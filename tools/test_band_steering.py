#!/usr/bin/env python3

import os
import pathlib
import subprocess
import tempfile
import textwrap
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "package/be6500-local/luci-app-rejected-clients"
STEERING = PACKAGE / "root/usr/libexec/be6500-band-steering"
ACTION = PACKAGE / "root/usr/libexec/be6500-band-steering-action"
DEFAULTS = PACKAGE / "root/etc/uci-defaults/99-be6500-band-steering"


class BandSteeringTests(unittest.TestCase):
    def make_environment(
        self,
        directory: pathlib.Path,
        *,
        mlo=False,
        dual_band=True,
        rssi=-50,
        ifaces="link0 link1 link2",
        link1_load=0,
        link2_load=0,
    ):
        log = directory / "hostapd.log"
        logger_log = directory / "logger.log"
        uci = directory / "uci"
        hostapd = directory / "hostapd_cli"
        logger = directory / "logger"

        uci.write_text(
            textwrap.dedent(
                """\
                #!/bin/sh
                [ "$1" = -q ] && shift
                command="$1"; key="$2"
                [ "$command" = get ] || exit 1
                case "$key" in
                    be6500_oem.band_steering.enabled) echo 1 ;;
                    be6500_oem.band_steering.delay) echo 0 ;;
                    be6500_oem.band_steering.cooldown) echo 300 ;;
                    be6500_oem.band_steering.min_rssi) echo "$FAKE_MIN_RSSI" ;;
                    wireless.main.unified) echo 1 ;;
                    wireless.default_radio0.ssid) echo TP-LINK_A59A ;;
                    *) exit 1 ;;
                esac
                """
            )
        )
        hostapd.write_text(
            textwrap.dedent(
                """\
                #!/bin/sh
                iface=
                while [ "$#" -gt 0 ]; do
                    case "$1" in
                        -p) shift 2 ;;
                        -i) iface="$2"; shift 2 ;;
                        *) command="$1"; shift; break ;;
                    esac
                done
                case "$iface:$command" in
                    link0:status)
                        printf 'state=ENABLED\\nfreq=2437\\nchannel=6\\nbssid[0]=00:03:7f:12:01:01\\nssid[0]=TP-LINK_A59A\\n'
                        ;;
                    link1:status)
                        printf 'state=ENABLED\\nfreq=5240\\nchannel=48\\nhe_oper_chwidth=2\\nbssid[0]=00:03:7f:12:c6:33\\nssid[0]=TP-LINK_A59A\\nchan_util_avg=%s\\n' "$FAKE_LINK1_LOAD"
                        ;;
                    link2:status)
                        printf 'state=ENABLED\\nfreq=5540\\nchannel=108\\nhe_oper_chwidth=2\\nbssid[0]=00:03:7f:12:5a:17\\nssid[0]=TP-LINK_A59A\\nchan_util_avg=%s\\n' "$FAKE_LINK2_LOAD"
                        ;;
                    link0:sta)
                        echo "$1"
                        if [ "$FAKE_MLO" = 1 ]; then echo MLO=yes; else echo MLO=no; fi
                        [ "$FAKE_DUAL_BAND" = 0 ] && echo 'supp_op_classes=5151' || echo 'supp_op_classes=515173'
                        echo ext_capab=000008
                        echo "max_rssi=$FAKE_RSSI"
                        ;;
                    link1:sta|link2:sta) echo FAIL ;;
                    link0:bss_tm_req)
                        printf '%s %s %s\\n' "$iface" "$command" "$*" >> "$FAKE_LOG"
                        echo OK
                        ;;
                    *) echo FAIL ;;
                esac
                """
            )
        )
        logger.write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$FAKE_LOGGER_LOG"\n')
        for executable in (uci, hostapd, logger):
            executable.chmod(0o755)

        env = os.environ.copy()
        env.update(
            {
                "BE6500_UCI": str(uci),
                "BE6500_HOSTAPD_CLI": str(hostapd),
                "BE6500_HOSTAPD_CTRL": str(directory / "ctrl"),
                "BE6500_HOSTAPD_IFACES": ifaces,
                "BE6500_STEERING_STATE_DIR": str(directory / "state"),
                "BE6500_LOGGER": str(logger),
                "FAKE_LOG": str(log),
                "FAKE_LOGGER_LOG": str(logger_log),
                "FAKE_MLO": "1" if mlo else "0",
                "FAKE_DUAL_BAND": "1" if dual_band else "0",
                "FAKE_RSSI": str(rssi),
                "FAKE_MIN_RSSI": "-65",
                "FAKE_LINK1_LOAD": str(link1_load),
                "FAKE_LINK2_LOAD": str(link2_load),
            }
        )
        return env, log, logger_log

    def run_steering(self, env):
        subprocess.run(
            ["/bin/sh", str(STEERING), "steer", "FC:D9:08:9A:49:C5", "link0"],
            check=True,
            env=env,
            capture_output=True,
            text=True,
        )

    def test_dual_band_legacy_station_gets_advisory_5g_transition(self):
        with tempfile.TemporaryDirectory() as tmp:
            env, log, logger_log = self.make_environment(pathlib.Path(tmp))
            self.run_steering(env)
            request = log.read_text()
            self.assertIn("link0 bss_tm_req fc:d9:08:9a:49:c5", request)
            self.assertIn("pref=1 abridged=1 valid_int=10", request)
            self.assertIn(
                "neighbor=00:03:7f:12:c6:33,0x00000000,129,48,9,0301ff",
                request,
            )
            self.assertNotIn("disassoc_imminent", request)
            self.assertIn("no forced disconnect", logger_log.read_text())

    def test_mlo_station_is_not_steered(self):
        with tempfile.TemporaryDirectory() as tmp:
            env, log, _ = self.make_environment(pathlib.Path(tmp), mlo=True)
            self.run_steering(env)
            self.assertFalse(log.exists())

    def test_tri_band_chooses_less_busy_5g_radio(self):
        with tempfile.TemporaryDirectory() as tmp:
            env, log, _ = self.make_environment(
                pathlib.Path(tmp), link1_load=90, link2_load=20
            )
            self.run_steering(env)
            request = log.read_text()
            self.assertIn(
                "neighbor=00:03:7f:12:5a:17,0x00000000,129,108,9,0301ff",
                request,
            )

    def test_dual_band_uses_the_only_active_5g_radio(self):
        with tempfile.TemporaryDirectory() as tmp:
            env, log, _ = self.make_environment(
                pathlib.Path(tmp), ifaces="link0 link1"
            )
            self.run_steering(env)
            self.assertIn("neighbor=00:03:7f:12:c6:33", log.read_text())

    def test_24g_only_station_is_not_steered(self):
        with tempfile.TemporaryDirectory() as tmp:
            env, log, _ = self.make_environment(pathlib.Path(tmp), dual_band=False)
            self.run_steering(env)
            self.assertFalse(log.exists())

    def test_weak_dual_band_station_stays_on_24g(self):
        with tempfile.TemporaryDirectory() as tmp:
            env, log, _ = self.make_environment(pathlib.Path(tmp), rssi=-78)
            self.run_steering(env)
            self.assertFalse(log.exists())

    def test_cooldown_prevents_repeated_requests(self):
        with tempfile.TemporaryDirectory() as tmp:
            env, log, _ = self.make_environment(pathlib.Path(tmp))
            self.run_steering(env)
            self.run_steering(env)
            self.assertEqual(1, len(log.read_text().splitlines()))

    def test_package_enables_11k_11v_and_event_service(self):
        controller = (PACKAGE / "root/usr/lib/lua/luci/controller/be6500_oem_beta.lua").read_text()
        defaults = DEFAULTS.read_text()
        makefile = (PACKAGE / "Makefile").read_text()
        service = (PACKAGE / "root/etc/init.d/be6500-band-steering").read_text()
        self.assertIn('set_value(section, "bss_transition", "1", device)', controller)
        self.assertIn('set_value(section, "ieee80211k", "1", device)', controller)
        for option in ("bss_transition", "ieee80211k", "rrm_neighbor_report", "rrm_beacon_report"):
            self.assertIn(option, defaults)
        self.assertIn("be6500-band-steering-action", makefile)
        self.assertIn("procd_add_reload_trigger be6500_oem wireless", service)
        self.assertIn("AP-STA-CONNECTED", ACTION.read_text())
        self.assertIn("printf '%s_link%s", STEERING.read_text())


if __name__ == "__main__":
    unittest.main()
