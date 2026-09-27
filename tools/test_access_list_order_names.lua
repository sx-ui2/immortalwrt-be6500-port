-- Run with: luajit tools/test_access_list_order_names.lua
-- Access rows must retain insertion order and distinguish synced names from
-- user-maintained aliases.
dofile("package/be6500-local/luci-app-rejected-clients/root/usr/lib/lua/luci/controller/be6500_oem_beta.lua")

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
local access_entries = upvalue(dispatch, "access_entries")
local replace_access_entries = upvalue(dispatch, "replace_access_entries")
local _, catalog_index = upvalue(access_entries, "device_name_catalog")

local A = "AA:AA:AA:AA:AA:AA"
local B = "BB:BB:BB:BB:BB:BB"
local C = "CC:CC:CC:CC:CC:CC"
debug.setupvalue(access_entries, catalog_index, function()
    return { saved = {}, lease = { [B] = "在线设备-B" }, static = {}, hint = {} }
end)

local rows = {
    { [".name"] = "deny_b", policy = "deny", mac = B, name = "设备-BBBB" },
    { [".name"] = "allow_c", policy = "allow", mac = C, name = "允许-C" },
    { [".name"] = "deny_a", policy = "deny", mac = A, name = "手动-A", name_manual = "1" },
    { [".name"] = "deny_c", policy = "deny", mac = C, name = "离线旧名称-C" }
}
local uci = {
    foreach = function(_, config, section_type, callback)
        assert(config == "be6500_oem" and section_type == "access")
        for _, row in ipairs(rows) do callback(row) end
    end,
    get = function() return nil end
}

local deny = access_entries(uci, "deny")
assert(#deny == 3)
assert(deny[1].mac == B and deny[1].name == "在线设备-B" and deny[1].name_manual == 0)
assert(deny[2].mac == A and deny[2].name == "手动-A" and deny[2].name_manual == 1)
assert(deny[3].mac == C and deny[3].name == "离线旧名称-C" and deny[3].name_manual == 0)

local deleted, inserted = {}, {}
local replace_uci = {
    foreach = uci.foreach,
    delete = function(_, config, section)
        assert(config == "be6500_oem")
        deleted[#deleted + 1] = section
    end,
    section = function(_, config, section_type, name, values)
        assert(config == "be6500_oem" and section_type == "access" and name == nil)
        inserted[#inserted + 1] = values
        return "new_" .. tostring(#inserted)
    end
}
replace_access_entries(replace_uci, "deny", {
    { mac = C, name = "同步-C", name_manual = 0 },
    { mac = B, name = "手动-B", name_manual = 1 },
    { mac = C, name = "重复-C", name_manual = 1 },
    { mac = A, name = "同步-A" }
})
assert(#deleted == 3 and deleted[1] == "deny_b" and deleted[2] == "deny_a" and deleted[3] == "deny_c")
assert(#inserted == 3)
assert(inserted[1].mac == C and inserted[1].name_manual == "0")
assert(inserted[2].mac == B and inserted[2].name_manual == "1")
assert(inserted[3].mac == A and inserted[3].name_manual == "0")

print("access-list order and name-sync checks passed")
