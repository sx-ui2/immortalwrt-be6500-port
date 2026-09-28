-- Run with: luajit tools/test_device_fast_identity.lua
-- The quick device endpoint must resolve hostnames and local identity without
-- waiting for the full hostapd fingerprint inventory.
dofile("package/be6500-local/luci-app-rejected-clients/root/usr/lib/lua/luci/controller/be6500_oem_beta.lua")
luci.sys = luci.sys or {}
package.preload["luci.jsonc"] = function()
    return {
        parse = function(raw)
            if tostring(raw):find("hint%-host", 1, false) then
                return { ["AA:AA:AA:AA:AA:AA"] = { name = "hint-host.lan" } }
            end
            return {}
        end
    }
end

local function upvalue(fn, wanted)
    for index = 1, 180 do
        local name, value = debug.getupvalue(fn, index)
        if not name then break end
        if name == wanted then return value, index end
    end
    error("missing upvalue: " .. wanted)
end

local controller = luci.controller.be6500_oem_beta
local dispatch = upvalue(controller.action_jdcapi, "extended_jdcapi")
local build = upvalue(dispatch, "build_device_list")
local _, fast_clients_index = upvalue(build, "known_wireless_clients_fast")
local _, identity_index = upvalue(build, "device_identity")
local generated_name, generated_name_index = upvalue(build, "generated_device_name")

local A = "AA:AA:AA:AA:AA:AA"
local B = "B8:14:4D:50:8E:82"
local C = "FC:31:5D:AE:A4:1D"
assert(generated_name("5.8G 无线设备-A41D", C), "generated band label was not recognized")
local generated_calls = {}
debug.setupvalue(build, generated_name_index, function(name, mac)
    local result = generated_name(name, mac)
    generated_calls[#generated_calls + 1] = { name = name, mac = mac, result = result }
    return result
end)
debug.setupvalue(build, fast_clients_index, function()
    return {
        [A] = { ssid = "Example", band = "5.8G", signature = "" },
        [B] = { ssid = "Example", band = "5.8G", signature = "" },
        [C] = { ssid = "Example", band = "5.8G", signature = "" }
    }
end)
debug.setupvalue(build, identity_index, function(name, mac)
    return "类型:" .. name, "厂商:" .. mac:sub(1, 8)
end)

local original_open = io.open
io.open = function(path, mode)
    if path == "/tmp/dhcp.leases" then
        local file = assert(io.tmpfile())
        file:write("1 ", B, " 192.168.1.20 lease-host *\n")
        file:write("1 ", C, " 192.168.1.30 current-host *\n")
        file:seek("set", 0)
        return file
    end
    return original_open(path, mode)
end

local commands = {}
local original_exec = luci.sys.exec
luci.sys.exec = function(command)
    commands[#commands + 1] = command
    if command:find("getHostHints", 1, true) then
        return '{"' .. A .. '":{"name":"hint-host.lan"}}'
    end
    if command:find("ip neigh show", 1, true) then return "" end
    return ""
end

local saved = {
    ["device_" .. B:lower():gsub(":", "")] = { name = "手动名称", name_manual = "1" },
    ["device_" .. C:lower():gsub(":", "")] = { name = "5.8G 无线设备-A41D" }
}
local uci = {
    get = function(_, config, section, option)
        if config == "network" and section == "guest" and option == "ipaddr" then return "192.168.4.1" end
        if config == "be6500_oem" and section == "access" and option == "policy" then return "deny" end
        if config == "be6500_oem" and section == "access" and option == "enabled" then return "1" end
        if config == "be6500_oem" and saved[section] then return saved[section][option] end
        return nil
    end,
    foreach = function(_, config, section_type, callback)
        if config == "dhcp" and section_type == "host" then
            callback({ mac = A, name = "static-host" })
        end
    end
}

local rows = build(uci, true)
local by_mac = {}
for _, row in ipairs(rows) do by_mac[row.uid] = row end

assert(by_mac[A].name == "static-host", "static hostname must be used on first paint")
assert(by_mac[A].vendor == "厂商:AA:AA:AA", "identity must run on the fast path")
assert(by_mac[B].name == "手动名称", "manual alias must override a lease hostname")
local generated_debug = {}
for _, call in ipairs(generated_calls) do
    generated_debug[#generated_debug + 1] = tostring(call.mac) .. "=" .. tostring(call.name) .. ":" .. tostring(call.result)
end
assert(by_mac[C].name == "current-host", "generated old name must not override hostname: "
    .. tostring(by_mac[C].name) .. " / ip=" .. tostring(by_mac[C].ip) .. " / " .. tostring(by_mac[C].device_type)
    .. " / generated=" .. table.concat(generated_debug, ","))
assert(by_mac[C].device_type == "类型:current-host")
assert(by_mac[A].type == "Wi-Fi", "fast wireless client lost its Wi-Fi type")

-- A live neighbour absent from the bounded wireless inventory must be marked
-- wired on the first response instead of waiting for slow enrichment.
local W = "00:D8:61:18:D2:D0"
luci.sys.exec = function(command)
    commands[#commands + 1] = command
    if command:find("getHostHints", 1, true) then return "{}" end
    if command:find("ip neigh show", 1, true) then
        return "192.168.1.141 dev br-lan lladdr " .. W .. " REACHABLE\n"
    end
    return ""
end
local wired_rows = build(uci, true)
local wired_by_mac = {}
for _, row in ipairs(wired_rows) do wired_by_mac[row.uid] = row end
assert(wired_by_mac[W] and wired_by_mac[W].type == "wire",
    "fast live neighbour must be identified as wired immediately")
local saw_fast_hint = false
for _, command in ipairs(commands) do
    if command:find("ubus -t 1 call luci-rpc getHostHints", 1, true) then saw_fast_hint = true end
end
assert(saw_fast_hint, "fast endpoint did not issue the bounded host-hint lookup")

luci.sys.exec = original_exec
io.open = original_open
print("fast device hostname/identity checks passed")
