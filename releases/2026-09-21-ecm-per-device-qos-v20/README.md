# JDCloud BE6500 ECM per-device QoS v20 firmware

This image supersedes v19 and keeps Qualcomm PPE/ECM acceleration enabled for
normal clients while enforcing a configured upload or download limit on only
the selected client.

- adds the QSDK external ECM acceleration-engine selector;
- sends only limited client IPv4/IPv6 flows to the software path used by the
  per-device nftables policer;
- invalidates only the affected client's existing ECM flows when a limit is
  changed, so the new setting takes effect without restarting Wi-Fi;
- keeps unrelated clients on the PPE fast path;
- removes the obsolete global acceleration controller and PPE root qdisc from
  the installed image;
- keeps the v19 Wi-Fi local-access fix, SSDK guest shaping, ACL/MLO/SAE fixes,
  Nikki official feed and Chinese translation, hostname, and timezone fixes.

The built image was checksum-verified and its root filesystem was inspected to
confirm that `ecm_ae_select.ko`, the device-limit hook, Nikki, and the Chinese
translation are present, while the obsolete acceleration scripts and PPE qdisc
autoload entry are absent.

The sysupgrade image is distributed as a GitHub Release asset rather than being
committed to Git.
