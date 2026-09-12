# 官方 QSDK 14.0.r9 清单核对

2026-08-31 取得官方公开仓库中的
[NHSS.QSDK.14.0.r9-00040-O.xml](https://git.codelinaro.org/clo/qsdk/releases/manifest/qstak/-/blob/fe45bf6cdc84336fd0513dde5c243e33e9da8c1f/NHSS.QSDK.14.0.r9-00040-O.xml)。

- 仓库：`clo/qsdk/releases/manifest/qstak`，GitLab project 29173。
- 固定读取版本：`fe45bf6cdc84336fd0513dde5c243e33e9da8c1f`。
- 本地 XML SHA256：`3ae358403f849e30ec6f391fb8fd474c45c601b2d4de9adfb4ea79ab45471076`。
- XML 含 83 个 project；没有执行 repo sync 或替换现用编译树。
- 通过公开 GitLab file API 读取，未使用登录凭据。

## 已核验

`source-pins.env` 中 kernel、kernel-files、NSS-DP、SSDK、qca-wifi-oss、
wlan-open、wlan-open feed 与 wlan-open extensions 提交均与官方同一发布
清单一致。此前直接猜测
`.../system/openwrt/feeds/qca.git` 的空目录不能作为源码获取成功的证据。

尤其是清单将 `wifi/qca-wifi-oss` 放在
`qsdk/qca/src/qca-wifi/component_dev`，进一步确认它是组件子树，
不是 `qca-wifi` 根构建树。不能拿它替代完整的厂商无线驱动。

本清单同时列出了公开无线方案入口：

| 项目 | 固定提交 |
| --- | --- |
| `oss/src/mac80211/wlan-open` | `cc4cc0e38e4cd169220dd8c54165dcf43f9fea71` |
| `oss/system/feeds/wlan-open` | `1ee3a4ab7c59ceaff347c4668fc6c7604a04c323` |
| `oss/src/mac80211/wlan-open-extns` | `c69fefae1eb16d0434caf5fd10ff41e37836a959` |
| `oss/src/network/services/hostapd` | `12a8194530a9733518c153bf2e94267eddfd121e` |
| `oss/system/feeds/wlan-hostapd` | `da760301968e4c2f236a6abb1dac97fef6871106` |
| `oss/system/feeds/wlan/utils` | `dbff3ed98b8698745f9b26d866ed367406360e6f` |

这些是有证据的后续入口，但**本轮没有切换成开放无线方案**，也没有
声称它们已在 BE6500 启动、支持原厂三频/MLO，或等价于完整 QWRT 栈。
这份公开清单未提供完整 unified-profile 主驱动的项目，不能据此断言
其他发布渠道绝对不存在源码；目前“原厂无线尽量全套”的依赖仍未解决。
