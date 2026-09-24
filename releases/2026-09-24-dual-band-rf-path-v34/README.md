# BE6500 dual-band automatic RF-path switching v34

This build keeps the v33 dual-band/tri-band driver-personality selection,
factory traffic modes, ECM/PPE acceleration, Nikki integration, access-control
hot updates, guest-radio isolation, and corrected LED defaults.

The dual-band personality still uses the factory single-MAC path:

- firmware: `amss.bin`
- board data: `board-single.bin`
- BDF: `0x2`

It now exposes the combined low-band and high-band 5 GHz capabilities to
cfg80211 and LuCI. When an AP channel is created, ath12k selects the matching
hardware RF path through the existing Qualcomm WMI RF-path command:

- 5.2 GHz channels use the primary/low 5 GHz RF path (index `0`).
- 5.8 GHz channels use the secondary/high 5 GHz RF path (index `1`).

The active WMI scan range follows the selected RF path while cfg80211 keeps the
full 5 GHz channel union visible. Tri-band mode continues to use the split
dual-MAC `amss_dualmac.bin` / `0x1008` personality and is not changed by this
automatic single-MAC path selection.

After flashing and selecting a 5 GHz channel, verify the actual driver action
with:

```sh
logread -k | grep 'JDC-BE6500 channel'
```

The expected message reports the channel frequency, `low` or `high`, and RF
path index. Runtime verification on the router is still required after
flashing because the build host cannot exercise the physical front-end.

The sysupgrade image is intentionally ignored by Git; it is attached to the
GitHub release. Verify it against `SHA256SUMS` before flashing.
