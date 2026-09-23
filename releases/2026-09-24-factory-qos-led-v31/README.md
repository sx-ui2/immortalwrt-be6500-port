# BE6500 factory traffic modes and LED defaults v31

This build adds the three JDCOS `smartqos` traffic modes to the existing
ECM/PPE acceleration path and selects **智能均衡** by default.  The original
factory class identifiers and marks are retained (`1:400`, `1:300`, `1:200`,
connection mark `801`, packet mark `255`) while nftables mirrors the classes to
DSCP metadata so changing modes does not install a global software HTB qdisc or
restart Wi-Fi.  Existing accelerated flows are invalidated only when the mode
changes.

The default custom LED profile is:

- Overheat: red, fast blink
- Firmware upgrade: yellow (red + green), fast blink
- System boot: green, fast blink
- All Wi-Fi off: purple (red + blue), slow blink
- QWRT edge service: yellow (red + green), steady
- USB attached: cyan (green + blue), steady
- WAN offline: green, steady
- WAN online: blue, fast blink

The LED default revision is `20260924-1`, so the profile is also applied once
when upgrading with settings preserved.

The final image manifest contains `be6500-current-config` 9,
`luci-app-rejected-clients` 31, ECM/PPE with its Wi-Fi plug-in, Nikki, its LuCI
app, and the Simplified Chinese translation.  The sysupgrade image itself is
intentionally ignored by Git; verify the local copy with `SHA256SUMS` before
flashing.
