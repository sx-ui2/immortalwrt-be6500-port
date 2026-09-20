# JDCloud BE6500 PPE WAN cleanup v18 firmware

This image supersedes v17 and contains the following verified changes:

- no longer attaches a root `ppepfifo` qdisc automatically to the physical WAN device;
- safely removes the stale v17-owned PPE root qdisc when the WAN link is disconnected;
- retains Qualcomm PPE/ECM forwarding acceleration;
- retains SSDK hardware shaping when guest-network rate limiting is enabled;
- retains the v17 ACL, MLO/SAE, Nikki feed/translation, hostname and timezone fixes.

A disconnected WAN port or missing default route prevents Internet access even when the Wi-Fi radio link itself is healthy. The local management page remains available at `http://192.168.1.1`.

The sysupgrade image is distributed as a GitHub Release asset rather than being committed to Git.
