# JDCloud BE6500 Wi-Fi local-access v19 firmware

This image supersedes v18 and contains the following verified changes:

- explicitly disables client isolation on all three main LAN APs;
- keeps client isolation enabled when a guest AP is created;
- applies the main/guest isolation policy in the factory snapshot, first-boot migration and LuCI interface creation path;
- retains the v18 fix that removes the stale v17 PPE root qdisc without disabling Qualcomm PPE/ECM acceleration;
- retains SSDK hardware shaping when guest-network rate limiting is enabled;
- retains the ACL, MLO/SAE, Nikki feed/translation, hostname and timezone fixes.

The live router received the same main-AP isolation change without restarting Wi-Fi. Local management is served at `http://192.168.1.1/`.

The sysupgrade image is distributed as a GitHub Release asset rather than being committed to Git.
