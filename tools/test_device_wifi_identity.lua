-- Run with: luajit tools/test_device_wifi_identity.lua
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
local build = upvalue(dispatch, "build_device_list")
local clients = upvalue(build, "known_wireless_clients")
local A, B, C = "AA:AA:AA:AA:AA:AA", "BB:BB:BB:BB:BB:BB", "CC:CC:CC:CC:CC:CC"
local statuses = {
    ["hostapd.phy00.0-ap0"] = { ssid = "TP-LINK_A59A", phy = "phy00.0", freq = 2437 },
    -- QSDK sometimes omits the SSID from get_status on a live BSS.
    ["hostapd.phy00.1-ap0"] = { phy = "phy00.1", freq = 5180 },
    ["hostapd.phy00.2-ap0"] = { ssid = "TP-LINK_A59A", phy = "phy00.2", freq = 5540 },
    ["hostapd.phy00.1-ap1"] = { phy = "phy00.1", freq = 5180 }
}
local client_sets = {
    ["hostapd.phy00.0-ap0"] = { [A] = { authorized = true } },
    ["hostapd.phy00.1-ap0"] = { [B] = { authorized = true } },
    ["hostapd.phy00.2-ap0"] = { [B] = { authorized = true } },
    ["hostapd.phy00.1-ap1"] = { [C] = { authorized = true } }
}
local control_missing = false
local network_status_missing = false
package.loaded.ubus = {
    connect = function()
        return {
            call = function(_, object, method)
                if object == "network.wireless" and method == "status" then
                    if network_status_missing then return nil end
                    return { radio1 = { interfaces = {
                        { ifname = "phy00.1-ap0", section = "default_radio1" }
                    } } }
                end
                if method == "get_status" then return statuses[object] end
                if method == "get_clients" then
                    return { freq = statuses[object].freq, clients = client_sets[object] }
                end
            end,
            close = function() end
        }
    end
}
local original_exec = luci.sys.exec
luci.sys.exec = function(command)
    if command:find("ubus list", 1, true) then
        return "hostapd.phy00.0-ap0\nhostapd.phy00.1-ap0\nhostapd.phy00.2-ap0\nhostapd.phy00.1-ap1\n"
    end
    if not control_missing and command:find("hostapd_cli", 1, true)
        and command:find("phy00.1-ap0", 1, true) then
        return "bssid=00:11:22:33:44:55\nssid=TP-LINK_A59A\n"
    end
    return ""
end
local radio = { radio0 = "0", radio1 = "1", radio2 = "2" }
local uci = {
    get = function(_, config, section, option)
        if config ~= "wireless" then return nil end
        if section == "main" and option == "freq_mode" then return "1" end
        if option == "radio" then return radio[section] end
        if section == "default_radio1" and option == "ssid" then return "TP-LINK_A59A" end
        if option == nil and radio[section] then return {} end
    end,
    foreach = function(_, config, kind, callback)
        assert(config == "wireless" and kind == "wifi-iface")
        for _, section in ipairs({
            { [".name"] = "main0", device = "radio0", network = "lan", ssid = "TP-LINK_A59A" },
            { [".name"] = "default_radio1", device = "radio1", network = "lan", ssid = "TP-LINK_A59A" },
            { [".name"] = "guest1", device = "radio1", network = "guest", ssid = "Guest-WiFi" },
            { [".name"] = "main2", device = "radio2", network = "lan", ssid = "TP-LINK_A59A" }
        }) do
            if callback(section) == false then break end
        end
    end
}
local result = clients(uci)
assert(result[A].ssid == "TP-LINK_A59A" and result[A].band == "2.4G")
assert(result[B].ssid == "TP-LINK_A59A" and result[B].band == "5.2G / 5.8G")
assert(result[C].ssid == "Guest-WiFi" and result[C].band == "5.2G")
control_missing = true
result = clients(uci)
assert(result[B].ssid == "TP-LINK_A59A")
network_status_missing = true
result = clients(uci)
luci.sys.exec = original_exec
assert(result[A].ssid == "TP-LINK_A59A" and result[A].band == "2.4G")
assert(result[B].ssid == "TP-LINK_A59A" and result[B].band == "5.2G / 5.8G")
assert(result[C].ssid == "Guest-WiFi" and result[C].band == "5.2G")
print("device Wi-Fi SSID/band checks passed")
