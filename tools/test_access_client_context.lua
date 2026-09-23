-- Run with: luajit tools/test_access_client_context.lua
-- An identified request client must pass the UCI cursor to Wi-Fi lookup.
dofile("package/be6500-local/luci-app-rejected-clients/root/usr/lib/lua/luci/controller/be6500_oem_beta.lua")

local function upvalue(fn, wanted)
    for index = 1, 150 do
        local name, value = debug.getupvalue(fn, index)
        if not name then break end
        if name == wanted then return value, index end
    end
    error("missing upvalue: " .. wanted)
end

local controller = luci.controller.be6500_oem_beta
local dispatch = upvalue(controller.action_jdcapi, "extended_jdcapi")
local request_client = upvalue(dispatch, "request_client")
local _, lookup_index = upvalue(request_client, "known_wireless_clients")
local uci = {}
debug.setupvalue(request_client, lookup_index, function(cursor)
    assert(cursor == uci, "wireless lookup lost its UCI cursor")
    return { ["AA:BB:CC:DD:EE:FF"] = { band = "5.2G" } }
end)

luci.http = luci.http or {}
luci.http.getenv = function(name)
    assert(name == "REMOTE_ADDR")
    return "192.168.1.232"
end
luci.sys = luci.sys or {}
luci.sys.exec = function(command)
    assert(command == "ip neigh show 192.168.1.232 2>/dev/null")
    return "192.168.1.232 dev br-lan lladdr aa:bb:cc:dd:ee:ff REACHABLE\n"
end

local mac, wireless = request_client(uci)
assert(mac == "AA:BB:CC:DD:EE:FF" and wireless)
local source = assert(io.open("package/be6500-local/luci-app-rejected-clients/root/usr/lib/lua/luci/controller/be6500_oem_beta.lua", "r")):read("*a")
assert(source:find("local client_mac, client_wireless = request_client(uci)", 1, true))
print("access-control request client UCI context checks passed")
