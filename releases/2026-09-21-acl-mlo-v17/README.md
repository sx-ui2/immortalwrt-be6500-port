# JDCloud BE6500 ACL/MLO v17 firmware

This image contains the following verified fixes and packages:

- live allow/deny-list updates on every running MLO hostapd link without restarting Wi-Fi;
- the rejected-client page's global `normalizeMac()` helper;
- the missing QSDK `hostapd_set_sae()` runtime helper;
- Qualcomm PPE/ECM acceleration packages and runtime orchestration;
- Nikki, its LuCI application, its Simplified Chinese translation, and the official feed setup;
- clean-install defaults for hostname `JDCloud` and timezone `Asia/Shanghai` (`CST-8`).

The sysupgrade image is distributed as a GitHub Release asset rather than being committed to Git.
