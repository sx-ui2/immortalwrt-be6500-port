# BE6500 factory-aligned single-radio 5 GHz v35

This build supersedes v34 and restores the JDCloud factory wireless-driver
model verified from the original `4.5.2` firmware.

## Factory behavior

Dual-band mode uses one complete 5 GHz radio, not separate low-band and
high-band radios:

- firmware: `amss.bin`
- board data: `board-single.bin`
- BDF: `0x2`
- `radio2` is disabled
- the remaining 5 GHz radio owns the complete supported 5 GHz channel set
- LuCI and client records display this radio simply as `5G`

The Qualcomm driver still contains an explicit RF-path control command, but
the factory scripts and driver do not call it automatically when the channel
changes. v35 therefore removes the v34 channel-triggered RF-path patch.

Tri-band mode continues to use the factory split personality:

- firmware: `amss_dualmac.bin`
- BDF: `0x1008`
- two independent 5 GHz radios are enabled
- LuCI and client records distinguish them as `5.2G` and `5.8G`

Changing between dual-band and tri-band changes the QCN9224 firmware/BDF
personality and therefore still requires a reboot. Changing a channel inside
dual-band mode does not switch driver personalities or RF paths.

The build retains the v33 guest-radio fix, factory traffic-mode descriptions,
ECM/PPE acceleration, Nikki with Simplified Chinese translation, access-list
hot updates, rejection records, device SSID/band display, and corrected LED
defaults.

Do not flash v34. It is marked as a superseded prerelease because its automatic
low/high RF-path switching did not match the factory implementation.

The sysupgrade image is intentionally ignored by Git and attached to the
GitHub release. Verify it against `SHA256SUMS` before flashing.
