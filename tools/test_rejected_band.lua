-- Run with: luajit tools/test_rejected_band.lua
dofile("package/be6500-local/luci-app-rejected-clients/root/usr/lib/lua/luci/controller/be6500_oem_beta.lua")
luci.sys = luci.sys or {}

local function upvalue(fn, wanted)
    for index = 1, 150 do
        local name, value = debug.getupvalue(fn, index)
        if not name then break end
        if name == wanted then return value end
    end
    error("missing upvalue: " .. wanted)
end

local controller = luci.controller.be6500_oem_beta
local dispatch = upvalue(controller.action_jdcapi, "extended_jdcapi")
local rows = upvalue(dispatch, "wifi_reject_rows")
local band = upvalue(rows, "wifi_reject_band")
local radio = { radio0 = "0", radio1 = "1", radio2 = "2" }
local uci = {
    get = function(_, config, section, option)
        if config ~= "wireless" then return nil end
        if option == "radio" then return radio[section] end
        if option == nil and radio[section] then return {} end
    end
}
local original_exec = luci.sys.exec
local runtime_bdf = "0x1008"
luci.sys.exec = function(command)
    if command:find("/proc/cmdline", 1, true) then
        return runtime_bdf .. "\n"
    end
    return ""
end

assert(band(uci, { phy = "phy00.0", ifname = "phy00.0-ap0" }) == "2.4G")
assert(band(uci, { phy = "phy00.1", ifname = "phy00.1-ap0" }) == "5.2G")
assert(band(uci, { phy = "phy00.2", ifname = "phy00.2-ap0" }) == "5.8G")
assert(band(uci, { phy = "phy00.2", ifname = "be6500-mld0" }) == "5.8G")
assert(band(uci, { ifname = "phy00.1-ap0" }) == "5.2G")
assert(band(uci, { ifname = "be6500-mld0" }) == "未知频段")
runtime_bdf = "0x2"
assert(band(uci, { phy = "phy00.1" }) == "5G")
assert(band(uci, { phy = "phy00.2" }) == "5G")
assert(band(uci, { freq = 5745 }) == "5G")
luci.sys.exec = original_exec
print("rejected Wi-Fi band checks passed")
