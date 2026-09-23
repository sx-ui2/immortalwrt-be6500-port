# BE6500 dual-band personality and guest radio fix v33

This build keeps the v32 factory traffic modes, ECM/PPE acceleration path,
Nikki integration, and corrected LED defaults. It fixes the distinction
between the QCN9224 runtime hardware personalities:

- Dual-band mode selects the single-MAC, four-chain `0x2` BDF and displays
  wireless clients and rejection records as `SSID · 5G`.
- Tri-band mode selects the split dual-MAC `0x1008` BDF and displays the two
  5 GHz radios as `SSID · 5.2G` and `SSID · 5.8G`.
- An absent `cnss2.bdf_pci1` boot argument is now correctly treated as the
  device-tree default `0x1008`, so changing to dual-band cannot incorrectly
  skip the required reboot and driver-personality switch.

Guest Wi-Fi no longer exposes channel, channel width, or transmit-power
controls. Those are physical-radio settings shared with the main Wi-Fi. The
guest save API is also prevented from modifying them, including requests from
an older cached page.

The final image manifest contains `be6500-current-config` 9,
`luci-app-rejected-clients` 33, ECM/PPE with its Wi-Fi plug-in, Nikki, its LuCI
app, and the Simplified Chinese translation. The sysupgrade image itself is
intentionally ignored by Git; verify the local copy with `SHA256SUMS` before
flashing.
