-- Run with: luajit tools/test_access_policy_hot_update.lua
-- Exercise the real LuCI ACL updater with an in-memory hostapd control socket.
local source = "package/be6500-local/luci-app-rejected-clients/root/usr/lib/lua/luci/controller/be6500_oem_beta.lua"
dofile(source)

local function upvalue(fn, wanted)
    for index = 1, 150 do
        local name, value = debug.getupvalue(fn, index)
        if not name then break end
        if name == wanted then return value end
    end
    error("missing upvalue: " .. wanted)
end

local function replace_upvalue(fn, wanted, replacement)
    for index = 1, 150 do
        local name = debug.getupvalue(fn, index)
        if not name then break end
        if name == wanted then debug.setupvalue(fn, index, replacement); return end
    end
    error("missing upvalue: " .. wanted)
end

local controller = luci.controller.be6500_oem_beta
local apply = upvalue(upvalue(controller.action_jdcapi, "extended_jdcapi"), "apply_mac_policy")
local fixture = { list = {} }
replace_upvalue(apply, "access_entries", function() return fixture.list end)
replace_upvalue(apply, "radio_device", function() return "radio" end)
replace_upvalue(apply, "oem_iface", function() return { [".name"] = "main" } end)
replace_upvalue(apply, "set_uci_list", function() end)
replace_upvalue(apply, "live_hostapd_ifaces", function() return { "phy00.0-ap0" }, true end)

local A = "AA:AA:AA:AA:AA:AA"
local B = "BB:BB:BB:BB:BB:BB"
local C = "CC:CC:CC:CC:CC:CC"
local function run_case(policy, previous, desired, present, stations)
    fixture.list = {}
    for _, mac in ipairs(desired) do fixture.list[#fixture.list + 1] = { mac = mac } end
    local calls = {}
    local hostapd = { accept_acl = {}, deny_acl = {} }
    for acl, macs in pairs(present) do
        for _, mac in ipairs(macs) do hostapd[acl][mac] = true end
    end
    local original_popen = io.popen
    io.popen = function(command)
        calls[#calls + 1] = command
        local args = assert(command:match("%-i%s+[%w_.%-]+%s+(.+)%s+2>&1"))
        local acl, op, mac = args:match("^(%w+_acl)%s+(%u+)_MAC%s+(%S+)$")
        local output = "OK\n"
        if acl then
            if op == "ADD" then hostapd[acl][mac] = true
            elseif op == "DEL" then hostapd[acl][mac] = nil end
        else
            acl = args:match("^(%w+_acl) SHOW$")
            if acl then
                local rows = {}
                for address in pairs(hostapd[acl]) do rows[#rows + 1] = address end
                output = table.concat(rows, "\n") .. "\n"
            elseif args == "all_sta" then
                output = table.concat(stations, "\n") .. "\n"
            end
        end
        return { read = function() return output end, close = function() return true end }
    end
    local uci = {
        get = function(_, config, section, option)
            if config == "be6500_oem" and section == "access" and option == "enabled" then return "1" end
        end,
        set = function() end, delete = function() end, commit = function() return true end
    }
    local ok, message = apply(uci, policy, previous)
    io.popen = original_popen
    assert(ok, message)
    return calls
end

local function count(calls, pattern)
    local found = 0
    for _, command in ipairs(calls) do
        if command:find(pattern, 1, true) then found = found + 1 end
        assert(not command:find("wifi reload", 1, true))
        assert(not command:find("iwpriv", 1, true))
    end
    return found
end

local calls = run_case("allow", { enabled = true, policy = "allow", listed = { [A] = true, [B] = true } },
    { A, B, C }, { accept_acl = { A, B } }, { A, B })
assert(count(calls, "accept_acl ADD_MAC " .. C) == 1)
assert(count(calls, "accept_acl DEL_MAC") == 0)
assert(count(calls, "set macaddr_acl") == 0)
assert(count(calls, "deauthenticate") == 0)

calls = run_case("allow", { enabled = true, policy = "allow", listed = { [A] = true, [B] = true } },
    { A }, { accept_acl = { A, B } }, { A, B })
assert(count(calls, "accept_acl DEL_MAC " .. B) == 1)
assert(count(calls, "accept_acl DEL_MAC " .. A) == 0)
assert(count(calls, "deauthenticate " .. B) == 0)
assert(count(calls, "deauthenticate " .. A) == 0)

calls = run_case("allow", { enabled = true, policy = "allow", listed = { [A] = true } },
    { A }, { accept_acl = { A, C }, deny_acl = { A, B } }, { A })
assert(count(calls, "DEL_MAC") == 0)
assert(count(calls, "set macaddr_acl") == 0)
assert(count(calls, "deauthenticate") == 0)

calls = run_case("allow", { enabled = true, policy = "allow", listed = { [A] = true } },
    { A }, { accept_acl = {} }, { A })
assert(count(calls, "ADD_MAC") == 0)
assert(count(calls, "DEL_MAC") == 0)
assert(count(calls, "deauthenticate") == 0)

calls = run_case("deny", { enabled = true, policy = "deny", listed = {} },
    { B }, { deny_acl = {} }, { A, B })
assert(count(calls, "deny_acl ADD_MAC " .. B) == 1)
assert(count(calls, "deauthenticate " .. B) == 0)
assert(count(calls, "deauthenticate " .. A) == 0)

calls = run_case("allow", { enabled = true, policy = "deny", listed = { [B] = true } },
    { A }, { accept_acl = {}, deny_acl = { B } }, { A, B })
assert(count(calls, "accept_acl ADD_MAC " .. A) == 1)
assert(count(calls, "deny_acl DEL_MAC " .. B) == 1)
assert(count(calls, "set macaddr_acl 1") == 1)
assert(count(calls, "deauthenticate") == 0)

print("access-policy hot-update checks passed")
