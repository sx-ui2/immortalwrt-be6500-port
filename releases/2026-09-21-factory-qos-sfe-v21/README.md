# BE6500 factory-style QoS/SFE firmware v21

This build follows the JDCOS 4.5.2 acceleration and shaping policy:

- Without configured limits, ECM uses `auto` and selects PPE acceleration.
- When any per-device limit or guest-network limit is enabled, ECM switches to
  SFE and applies per-IP HTB classes on the WAN uplink and LAN/guest downlink.
- An explicit per-device limit overrides the guest-network limit for that client.
- List and rate changes are applied without restarting Wi-Fi; active ECM flows
  for affected addresses are invalidated so the new policy takes effect.
- Clearing all limits removes only the qdiscs created by this service and returns
  ECM to `auto`.

Included components verified in the final image manifest:

- `kmod-qca-nss-ecm` r5 with PPE and SFE front ends
- `kmod-qca-nss-sfe`
- `luci-app-rejected-clients` r21
- Nikki, its LuCI app, and Simplified Chinese translation

The sysupgrade image is intentionally ignored by Git. Use the accompanying
`SHA256SUMS` file to verify a locally copied image before flashing.
