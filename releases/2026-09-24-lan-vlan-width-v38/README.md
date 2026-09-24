# BE6500 LAN/VLAN and selectable Wi-Fi width v38

This build exposes the real QCA8386 switch ports in LuCI and restores the
Wi-Fi channel-width selector that was hidden by an earlier compatibility
patch.

## LAN ports and VLANs

The BE6500 uses a QCA8386 `swconfig` switch. LAN1–LAN3 are physical switch
ports behind the CPU-facing `eth1` device, so they cannot truthfully appear as
independent Linux devices on the normal Devices page.

LuCI now provides **网络 → LAN 端口与 VLAN** using the stock switch VLAN editor.
The physical mapping is:

- LAN1: switch port 3
- LAN2: switch port 2
- LAN3: switch port 1
- CPU/`eth1`: switch port 0

A physical LAN port can be assigned one untagged/PVID VLAN and any required
tagged VLANs. The resulting VLAN interface is selected elsewhere as
`eth1.<VLAN ID>`, so a port can still be used as a VLAN trunk.

Upgrading does not automatically modify the existing VLAN 1 membership, apply
a port reassignment, reload networking, or restart Wi-Fi. Only changes that the
user explicitly saves in the VLAN editor are applied.

## Wi-Fi width

The radio page once again offers 20, 40, 80, and 160 MHz widths. Existing
backend validation is retained: a channel/width combination unsupported by
the active radio personality or regulatory rules is normalized to a valid
width (for example, unsupported high-channel 160 MHz falls back to 80 MHz).

## Included fixes

This image also retains the v37 radio-personality/BDF synchronization, ECM/PPE
acceleration integration, Nikki and its Simplified Chinese package, guest
Wi-Fi and access-list hot updates, rejection records, SSID/band display, and
the custom LED defaults.

The complete project test suite passes all 132 tests. The built image contains
`luci-app-rejected-clients` release 36 and profile variant
`6.6 v75 LAN VLAN and selectable width`.

Verify the sysupgrade image against `SHA256SUMS` before flashing.
