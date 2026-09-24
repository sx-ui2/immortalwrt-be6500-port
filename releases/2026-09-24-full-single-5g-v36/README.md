# BE6500 complete single-radio 5 GHz v36

This build supersedes v35. v35 restored the factory single-radio personality
but exposed only the primary low-5 GHz capability range, so LuCI listed only
channels 36-64 in dual-band mode.

## Correct dual-band behavior

Dual-band mode still uses one physical 5 GHz radio and one `5G` logical band.
The ath12k driver now merges the primary and extension regulatory capability
ranges reported by the QCN9224 firmware before registering channels with
cfg80211. The single radio therefore exposes the complete country-permitted
5 GHz channel list, including the upper 149-165 range where allowed.

This does not create separate 5.2G and 5.8G radios and does not issue the
optional runtime RF-path switching command. Channel selection remains a normal
operation on the same single 5 GHz device, matching the factory single-radio
personality.

Tri-band mode is unchanged: it boots the dual-MAC firmware/BDF personality and
continues to expose independent 5.2G and 5.8G radios.

## Verification

The production ath12k module was rebuilt and verified to contain:

```
BE6500 factory single-radio 5G range [%u, %u] MHz
```

The obsolete automatic RF-path-switch marker is absent. After flashing and
booting dual-band mode, this command should show the effective merged range:

```
logread -k | grep 'factory single-radio 5G range'
```

LuCI's channel selector should then show every channel allowed by the selected
country code, rather than stopping at channel 64.

The image retains the existing ECM/PPE acceleration configuration, Nikki and
its Simplified Chinese package, guest Wi-Fi fixes, access-list hot updates,
device SSID/band display, rejection records, and LED defaults.

Verify the sysupgrade image against `SHA256SUMS` before flashing.
