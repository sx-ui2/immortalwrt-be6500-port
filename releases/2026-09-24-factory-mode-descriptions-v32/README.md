# BE6500 factory traffic mode descriptions v32

This build keeps the v31 factory traffic-mode implementation, ECM/PPE path,
Nikki integration, and corrected LED defaults. It changes the mode help text
to the original JDCOS `smartqos` wording and updates it immediately when the
selected mode changes:

- 性能优先：除了DNS不做任何优先
- 智能均衡：开启网页优先和游戏优先
- 上网优先：开启网页优先和小包优先

The final image manifest contains `be6500-current-config` 9,
`luci-app-rejected-clients` 32, ECM/PPE with its Wi-Fi plug-in, Nikki, its LuCI
app, and the Simplified Chinese translation. The sysupgrade image itself is
intentionally ignored by Git; verify the local copy with `SHA256SUMS` before
flashing.
