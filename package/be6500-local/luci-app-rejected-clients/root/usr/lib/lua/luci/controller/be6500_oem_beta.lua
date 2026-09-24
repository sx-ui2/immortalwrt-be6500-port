module("luci.controller.be6500_oem_beta", package.seeall)

local function json_reply(value)
    luci.http.prepare_content("application/json")
    luci.http.write_json(value)
end

local function read_file_snapshot(path)
    local file = io.open(path, "rb")
    if not file then return { exists = false } end
    local data = file:read("*a")
    file:close()
    return { exists = true, data = data or "" }
end

local function restore_file_snapshot(path, snapshot)
    if not snapshot or not snapshot.exists then
        os.remove(path)
        return
    end
    local file = io.open(path, "wb")
    if file then
        file:write(snapshot.data or "")
        file:close()
    end
end

local function native_wifi_config_snapshot()
    local snapshot = {}
    for _, config in ipairs({ "wireless", "network", "dhcp", "firewall" }) do
        snapshot[config] = {
            config = read_file_snapshot("/etc/config/" .. config),
            delta = read_file_snapshot("/tmp/.uci/" .. config)
        }
    end
    return snapshot
end

local function restore_native_wifi_config(snapshot)
    for config, files in pairs(snapshot or {}) do
        restore_file_snapshot("/etc/config/" .. config, files.config)
        restore_file_snapshot("/tmp/.uci/" .. config, files.delta)
    end
end

local function revert_native_wifi_changes()
    local ok, uci_module = pcall(require, "luci.model.uci")
    if not ok or not uci_module then return end
    local uci = uci_module.cursor()
    for _, config in ipairs({ "wireless", "network", "dhcp", "firewall" }) do
        pcall(function() uci:revert(config) end)
    end
end

local function log_native_wifi_error(trace)
    local file = io.open("/tmp/be6500-native-wifi-error.log", "a")
    if file then
        file:write(os.date("!%Y-%m-%dT%H:%M:%SZ"), " ", tostring(trace), "\n")
        file:close()
    end
    local ok, nixio = pcall(require, "nixio")
    if ok and nixio and nixio.syslog then
        nixio.syslog("err", "be6500 native Wi-Fi API failed; see /tmp/be6500-native-wifi-error.log")
    end
end

function index()
    -- Router settings pages are declared exclusively in menu.d.  Registering
    -- them again through the legacy Lua dispatcher marks every child as a
    -- wildcard leaf, which makes the Bootstrap top-menu hide the submenu.
    local page = entry({"admin", "network", "be6500_oem_beta"},
        call("redirect_settings"), nil)
    page.dependent = true
    page.leaf = false

    entry({"admin", "network", "be6500_oem_beta", "save"}, call("action_save"), nil).leaf = true
    entry({"admin", "network", "be6500_oem_beta", "status"}, call("action_status"), nil).leaf = true
    entry({"admin", "network", "be6500_oem_beta", "jdcapi"}, call("action_jdcapi"), nil).leaf = true
    entry({"admin", "network", "be6500_oem_beta", "native_wifi"}, call("action_native_wifi"), nil).leaf = true
    entry({"admin", "network", "be6500_oem_beta", "native_wifi_mode"}, call("action_native_wifi_mode"), nil).leaf = true
    entry({"admin", "network", "be6500_oem_beta", "temperature"}, call("action_temperature"), nil).leaf = true
end

function redirect_settings()
    luci.http.redirect(luci.dispatcher.build_url("admin", "router_settings", "wifi"))
end

function action_temperature()
    local values = {}
    for index = 0, 4 do
        local file = io.open("/sys/class/thermal/thermal_zone" .. index .. "/temp", "r")
        if file then
            local raw = tonumber((file:read("*l") or ""):gsub("%s+", "")); file:close()
            if raw then values[#values + 1] = math.floor(raw / 100) / 10 end
        end
    end
    local text = values[1] and string.format("CPU: %.1f°C", values[1]) or "CPU: --"
    if values[2] then text = text .. string.format(", WiFi: %.1f°C", values[2]) end
    if values[3] then text = text .. string.format(" %.1f°C", values[3]) end
    json_reply({ temperature = text })
end

local function original_json_request(json)
    local raw = luci.http.content() or ""
    if raw == "" then
        local form = luci.http.formvaluetable("")
        if type(form) == "table" then
            for key, value in pairs(form) do
                if type(key) == "string" and key:match("^%s*{") then
                    raw = key
                    break
                elseif type(value) == "string" and value:match("^%s*{") then
                    raw = value
                    break
                end
            end
        end
    end
    return json.parse(raw) or {}
end

local function clean(value, maximum)
    value = tostring(value or ""):gsub("[%z\1-\31]", "")
    if maximum and #value > maximum then
        value = value:sub(1, maximum)
    end
    return value
end

local function trim(value)
    return tostring(value or ""):gsub("^%s+", ""):gsub("%s+$", "")
end

local function ensure_oem_config(uci)
    local probe = io.open("/etc/config/be6500_oem", "r")
    if probe then
        probe:close()
    else
        local file = io.open("/etc/config/be6500_oem", "w")
        if not file then return false end
        file:write([[config settings 'access'
	option enabled '1'
	option policy 'deny'

config settings 'guest_qos'
	option enabled '0'
	option upload '0'
	option download '0'

config settings 'qos'
	option mode '1'
]])
        file:close()
    end
    if uci and uci.load then pcall(uci.load, uci, "be6500_oem") end
    return true
end

local function checked(name)
    return luci.http.formvalue(name) == "1"
end

local function valid_ipv4(value)
    local count = 0
    for octet in tostring(value or ""):gmatch("(%d+)") do
        count = count + 1
        if tonumber(octet) > 255 then return false end
    end
    return count == 4 and tostring(value):match("^%d+%.%d+%.%d+%.%d+$") ~= nil
end

local function valid_ipv6(value, allow_prefix)
    value = trim(value)
    if value == "" or (not allow_prefix and value:find("/", 1, true)) then return false end
    local ok, ip = pcall(require, "luci.ip")
    if not ok or not ip then return false end
    return ip.IPv6(value) ~= nil
end

local function valid_mac(value)
    return tostring(value or ""):upper():match("^[0-9A-F][0-9A-F]:[0-9A-F][0-9A-F]:[0-9A-F][0-9A-F]:[0-9A-F][0-9A-F]:[0-9A-F][0-9A-F]:[0-9A-F][0-9A-F]$") ~= nil
end

local function ipv4_number(value)
    if not valid_ipv4(value) then return nil end
    local result = 0
    for octet in tostring(value):gmatch("(%d+)") do result = result * 256 + tonumber(octet) end
    return result
end

local function valid_netmask(value)
    local mask = ipv4_number(value)
    if not mask or mask == 0 then return false end
    local inverted = 4294967295 - mask
    local size = inverted + 1
    while size > 1 and size % 2 == 0 do size = size / 2 end
    return size == 1
end

local function same_ipv4_subnet(first, second, netmask)
    local a, b, mask = ipv4_number(first), ipv4_number(second), ipv4_number(netmask)
    if not a or not b or not mask then return false end
    local size = 4294967296 - mask
    if size <= 0 then size = 1 end
    return math.floor(a / size) == math.floor(b / size)
end

local function ipv4_subnets_overlap(first, first_mask, second, second_mask)
    local a, am, b, bm = ipv4_number(first), ipv4_number(first_mask), ipv4_number(second), ipv4_number(second_mask)
    if not a or not am or not b or not bm then return false end
    local asize, bsize = 4294967296 - am, 4294967296 - bm
    local astart, bstart = math.floor(a / asize) * asize, math.floor(b / bsize) * bsize
    return astart <= bstart + bsize - 1 and bstart <= astart + asize - 1
end

local function valid_vlan(value)
    local number = tonumber(value)
    return number and number >= 1 and number <= 4094 and number == math.floor(number)
end

local function ensure_firewall_zone(uci, name, network)
    local found
    uci:foreach("firewall", "zone", function(section)
        if section.name == name then
            found = section[".name"]
            return false
        end
    end)
    if not found then
        found = uci:section("firewall", "zone", nil, {
            name = name, network = network, input = "ACCEPT",
            output = "ACCEPT", forward = "REJECT"
        })
    else
        uci:set("firewall", found, "network", network)
    end
    return found
end

local function iface_for_device(uci, device, role)
    local found
    uci:foreach("wireless", "wifi-iface", function(section)
        if section.device == device then
            local networks = " " .. tostring(section.network or "") .. " "
            local section_role = section.be6500_role
                or (networks:find(" guest ", 1, true) and "guest" or "main")
            if section_role == role then
                found = section[".name"]
                return false
            end
        end
    end)
    return found
end

-- QWRT uses wifi0/wifi1/wifi2 while upstream netifd names the same radios
-- radio0/radio1/radio2.  Always resolve the actual UCI section name instead
-- of silently accepting a successful save against a non-existent radio.
local function radio_device(uci, index)
    local qwrt = "wifi" .. tostring(index)
    local upstream = "radio" .. tostring(index)
    if uci:get("wireless", qwrt) then return qwrt end
    if uci:get("wireless", upstream) then return upstream end
    return nil
end

local function wifi_runtime_personality()
    local runtime_bdf = trim(luci.sys.exec(
        "sed -n 's/.*cnss2\\.bdf_pci1=\\([^ ]*\\).*/\\1/p' /proc/cmdline 2>/dev/null"))
    -- The device tree selects 0x1008 when no explicit boot argument exists.
    -- Only 0x2 asks the BE6500 ath12k patch for single-MAC 4-chain 5 GHz.
    if runtime_bdf == "0x2" then return 0, runtime_bdf end
    return 1, runtime_bdf ~= "" and runtime_bdf or "0x1008 (DT default)"
end

local function wifi_band_from_interface(uci, phy, ifname, frequency, runtime_mode)
    -- Use the actual QSDK physical radio, not a shared SSID or an arbitrary
    -- 5 GHz frequency.  radio1 is 5.2G and radio2 is 5.8G in tri-band mode.
    phy, ifname = tostring(phy or ""), tostring(ifname or "")
    local mode = runtime_mode
    if mode == nil then mode = wifi_runtime_personality() end
    local tri = tonumber(mode) == 1
    local index = tonumber(phy:match("^phy%d+%.(%d+)$")
        or ifname:match("^phy%d+%.(%d+)%-"))
    if index ~= nil and index <= 2 then
        local device = radio_device(uci, index)
        local configured_index = device and uci:get("wireless", device, "radio")
        if device and (configured_index == nil or tonumber(configured_index) == index) then
            if index == 0 then return "2.4G" end
            if not tri then return "5G" end
            return index == 2 and "5.8G" or "5.2G"
        end
    end
    -- A few hostapd control sockets expose an MLD name instead of the link
    -- name.  Live stations still have an actual operating frequency.
    frequency = tonumber(frequency) or 0
    if frequency >= 2400 and frequency < 3000 then return "2.4G" end
    if frequency >= 5000 and frequency < 5925 then
        if tri then
            return frequency < 5500 and "5.2G" or "5.8G"
        end
        return "5G"
    end
    if frequency >= 5925 then return "6G" end
    return "未知频段"
end

local function ipv4_cidr(value)
    local a, b, c, d, prefix = tostring(value or ""):match("^(%d+)%.(%d+)%.(%d+)%.(%d+)/(%d+)$")
    a, b, c, d, prefix = tonumber(a), tonumber(b), tonumber(c), tonumber(d), tonumber(prefix)
    if not a or a > 255 or b > 255 or c > 255 or d > 255 or prefix < 8 or prefix > 30 then return nil end
    local ip = ((a * 256 + b) * 256 + c) * 256 + d
    local block = 2 ^ (32 - prefix)
    local network = math.floor(ip / block) * block
    if ip == network or ip == network + block - 1 then return nil end
    local mask = 0xffffffff - block + 1
    local function octets(number)
        local o1 = math.floor(number / 16777216) % 256
        local o2 = math.floor(number / 65536) % 256
        local o3 = math.floor(number / 256) % 256
        local o4 = number % 256
        return string.format("%d.%d.%d.%d", o1, o2, o3, o4)
    end
    return { address = string.format("%d.%d.%d.%d", a, b, c, d), prefix = prefix,
        netmask = octets(mask), network = network, last = network + block - 1 }
end

local function configured_ipv4_cidr(uci, section, fallback)
    local address = tostring(uci:get("network", section, "ipaddr") or "")
    local prefix = address:match("/(%d+)$")
    address = address:gsub("/%d+$", "")
    if not prefix then
        local masks = { ["255.0.0.0"] = 8, ["255.255.0.0"] = 16, ["255.255.255.0"] = 24,
            ["255.255.255.128"] = 25, ["255.255.255.192"] = 26, ["255.255.255.224"] = 27,
            ["255.255.255.240"] = 28, ["255.255.255.248"] = 29, ["255.255.255.252"] = 30 }
        prefix = masks[tostring(uci:get("network", section, "netmask") or "")] or 24
    end
    local value = address ~= "" and (address .. "/" .. tostring(prefix)) or fallback
    return ipv4_cidr(value) and value or fallback
end

local function ensure_guest_network(uci, options)
    options = options or {}
    local guest_cidr = ipv4_cidr(options.ipv4_cidr or configured_ipv4_cidr(uci, "guest", "192.168.4.1/24"))
    local ipv6_enabled = options.ipv6_enabled
    if ipv6_enabled == nil then ipv6_enabled = uci:get("network", "guest", "ip6assign") ~= nil end
    if not uci:get("network", "guest_dev") then uci:section("network", "device", "guest_dev", {}) end
    uci:set("network", "guest_dev", "name", "br-guest")
    uci:set("network", "guest_dev", "type", "bridge")
    uci:set("network", "guest_dev", "bridge_empty", "1")
    uci:set("network", "guest_dev", "igmp_snooping", "1")
    if not uci:get("network", "guest") then uci:section("network", "interface", "guest", {}) end
    uci:set("network", "guest", "proto", "static")
    uci:set("network", "guest", "device", "br-guest")
    uci:set("network", "guest", "ipaddr", guest_cidr.address)
    uci:set("network", "guest", "netmask", guest_cidr.netmask)
    if ipv6_enabled then
        uci:set("network", "guest", "ip6assign", "64")
    else
        uci:delete("network", "guest", "ip6assign")
    end

    if not uci:get("dhcp", "guest") then uci:section("dhcp", "dhcp", "guest", {}) end
    uci:set("dhcp", "guest", "interface", "guest")
    uci:set("dhcp", "guest", "start", uci:get("dhcp", "guest", "start") or "100")
    uci:set("dhcp", "guest", "limit", uci:get("dhcp", "guest", "limit") or "150")
    uci:set("dhcp", "guest", "leasetime", uci:get("dhcp", "guest", "leasetime") or "12h")
    uci:delete("dhcp", "guest", "ignore")
    if ipv6_enabled then
        uci:set("dhcp", "guest", "ra", "server")
        uci:set("dhcp", "guest", "dhcpv6", "server")
        uci:set("dhcp", "guest", "ra_management", "1")
    else
        uci:delete("dhcp", "guest", "ra")
        uci:delete("dhcp", "guest", "dhcpv6")
        uci:delete("dhcp", "guest", "ra_management")
    end

    local zone
    uci:foreach("firewall", "zone", function(section)
        local networks = " " .. tostring(section.network or "") .. " "
        if section.name == "guest" or networks:find(" guest ", 1, true) then
            zone = section[".name"]
            return false
        end
    end)
    if not zone then
        zone = uci:section("firewall", "zone", "be6500_guest", {
            name = "guest", network = "guest", input = "REJECT",
            output = "ACCEPT", forward = "REJECT"
        })
    end
    uci:set("firewall", zone, "name", "guest")
    uci:set("firewall", zone, "network", "guest")
    uci:set("firewall", zone, "input", "REJECT")
    uci:set("firewall", zone, "output", "ACCEPT")
    uci:set("firewall", zone, "forward", "REJECT")

    local forwarding
    uci:foreach("firewall", "forwarding", function(section)
        if section.src == "guest" and section.dest == "wan" then forwarding = section[".name"]; return false end
    end)
    forwarding = forwarding or uci:section("firewall", "forwarding", "be6500_guest_wan", {})
    uci:set("firewall", forwarding, "src", "guest")
    uci:set("firewall", forwarding, "dest", "wan")

    local label = "Guest"
    uci:foreach("wireless", "wifi-iface", function(section)
        if section.be6500_role == "guest" and section.ssid and section.ssid ~= "" then label = clean(section.ssid, 32); return false end
    end)
    local lan_ip = uci:get("network", "lan", "ipaddr") or "192.168.1.1"
    local lan_subnet = lan_ip:gsub("%.%d+$", ".0/24")
    local rules = {
        be6500_guest_dns = { name = "Allow DNS Queries for " .. label, src = "guest", proto = "tcp udp", dest_port = "53", target = "ACCEPT" },
        be6500_guest_dhcp = { name = "Allow DHCP request for " .. label, src = "guest", proto = "udp", src_port = "67-68", dest_port = "67-68", family = "ipv4", target = "ACCEPT" },
        be6500_guest_hide_lan = { name = "Hide My LAN for " .. label, src = "guest", proto = "all", dest_ip = lan_subnet, target = "REJECT" },
        be6500_guest_igmp = { name = "Allow IGMP for " .. label, src = "guest", proto = "igmp", family = "ipv4", target = "ACCEPT" },
        be6500_guest_dhcpv6 = { name = "Allow DHCPv6 for " .. label, src = "guest", proto = "udp", src_port = "546-547", dest_port = "546-547", family = "ipv6", target = "ACCEPT" },
        be6500_guest_icmpv6 = { name = "Allow ICMPv6 for " .. label, src = "guest", proto = "icmp", family = "ipv6", icmp_type = "echo-request echo-reply destination-unreachable packet-too-big time-exceeded bad-header unknown-header-type router-solicitation neighbour-solicitation router-advertisement neighbour-advertisement", target = "ACCEPT" }
    }
    for section, values in pairs(rules) do
        if not uci:get("firewall", section) then uci:section("firewall", "rule", section, {}) end
        for key, value in pairs(values) do uci:set("firewall", section, key, value) end
        if section == "be6500_guest_dhcpv6" or section == "be6500_guest_icmpv6" then
            uci:set("firewall", section, "enabled", ipv6_enabled and "1" or "0")
        end
    end

    -- Remove obsolete duplicate rules created by older DeviceManager builds.
    local duplicates = {}
    uci:foreach("firewall", "rule", function(section)
        local name = tostring(section.name or "")
        if section.src == "guest" and not tostring(section[".name"] or ""):match("^be6500_guest_") and
            (name == "Guest-DHCP" or name == "Guest-DNS" or name:match("^DeviceManager%-Allow%-Guest%-")) then
            duplicates[#duplicates + 1] = section[".name"]
        end
    end)
    for _, section in ipairs(duplicates) do uci:delete("firewall", section) end
end

local function remove_guest_network(uci)
    local sections = {}
    for _, section_type in ipairs({ "forwarding", "rule", "zone" }) do
        uci:foreach("firewall", section_type, function(section)
            local remove = false
            if section_type == "zone" then
                local networks = " " .. tostring(section.network or "") .. " "
                remove = section.name == "guest" or networks:find(" guest ", 1, true) ~= nil
            elseif section_type == "forwarding" then
                remove = section.src == "guest" and section.dest == "wan"
            else
                remove = section.src == "guest" and
                    (tostring(section[".name"] or ""):match("^be6500_guest_") or section.name == "Guest-DHCP" or section.name == "Guest-DNS"
                        or section.name == "DeviceManager-Allow-Guest-DHCP"
                        or section.name == "DeviceManager-Allow-Guest-DNS")
            end
            if remove then sections[#sections + 1] = section[".name"] end
        end)
    end
    for _, section in ipairs(sections) do uci:delete("firewall", section) end
    for _, section in ipairs({ "be6500_guest_wan", "be6500_guest_dhcp", "be6500_guest_dns", "be6500_guest" }) do
        if uci:get("firewall", section) then uci:delete("firewall", section) end
    end
    if uci:get("dhcp", "guest") then uci:delete("dhcp", "guest") end
    if uci:get("network", "guest") then uci:delete("network", "guest") end
    if uci:get("network", "guest_dev") then uci:delete("network", "guest_dev") end
end

local function ensure_wifi_iface(uci, device, role)
    local section = iface_for_device(uci, device, role)
    if section then return section end
    local section_name = "be6500_" .. role .. "_" .. tostring(device):gsub("[^%w_]", "_")
    local values = {
        device = device,
        network = role == "guest" and "guest" or "lan",
        mode = "ap",
        ssid = role == "guest" and "JDCloud-Guest" or "JDCloud-BE6500",
        encryption = "psk2",
        isolate = role == "guest" and "1" or "0",
        be6500_role = role
    }
    return uci:section("wireless", "wifi-iface", section_name, values)
end

local function ensure_wifi_profile(uci, role)
    if not uci:get("wireless", role) then
        uci:section("wireless", "be6500-profile", role, { unified = "0" })
    end
end

local function save_wan(uci)
    local mode = clean(luci.http.formvalue("wan_proto"), 16)
    if mode ~= "dhcp" and mode ~= "pppoe" and mode ~= "static" then
        return nil, "不支持的上网方式"
    end
    uci:set("network", "wan", "proto", mode)
    local vlan_mode = clean(luci.http.formvalue("wan_vlan_mode"), 16)
    local vlan_id = clean(luci.http.formvalue("wan_vlan_id"), 4)
    if vlan_mode ~= "untagged" and vlan_mode ~= "tagged" then
        return nil, "请选择 WAN VLAN 模式"
    end
    if vlan_mode == "tagged" and not valid_vlan(vlan_id) then
        return nil, "WAN VLAN ID 必须为 1–4094"
    end
    if vlan_mode == "tagged"
        and uci:get("network", "iptv", "be6500_enabled") == "1"
        and uci:get("network", "iptv", "be6500_vlan_mode") == "tagged"
        and uci:get("network", "iptv", "be6500_vlan_id") == vlan_id then
        return nil, "互联网 VLAN ID 不能与已启用的 IPTV VLAN ID 相同"
    end
    uci:set("network", "wan", "be6500_vlan_mode", vlan_mode)
    if vlan_mode == "tagged" then
        uci:set("network", "wan", "be6500_vlan_id", vlan_id)
    else
        uci:delete("network", "wan", "be6500_vlan_id")
    end
    uci:set("network", "wan", "device", vlan_mode == "tagged" and ("eth0." .. vlan_id) or "eth0")
    uci:delete("network", "wan", "ifname")
    if mode == "pppoe" then
        local username = clean(luci.http.formvalue("pppoe_user"), 128)
        local password = clean(luci.http.formvalue("pppoe_pass"), 128)
        if username == "" then return nil, "请输入宽带账号" end
        uci:set("network", "wan", "username", username)
        if password ~= "" then uci:set("network", "wan", "password", password) end
        -- Remove a DHCP/static MTU left behind when changing protocols.
        -- The PPP handler then applies its normal 1492-byte MTU/MRU while
        -- leaving the Ethernet parent at 1500.
        uci:delete("network", "wan", "mtu")
    elseif mode == "static" then
        local ipaddr = clean(luci.http.formvalue("wan_ip"), 15)
        local netmask = clean(luci.http.formvalue("wan_mask"), 15)
        local gateway = clean(luci.http.formvalue("wan_gateway"), 15)
        if not valid_ipv4(ipaddr) or not valid_ipv4(netmask) or not valid_ipv4(gateway) then
            return nil, "静态地址、子网掩码或网关格式错误"
        end
        uci:set("network", "wan", "ipaddr", ipaddr)
        uci:set("network", "wan", "netmask", netmask)
        uci:set("network", "wan", "gateway", gateway)
    end
    uci:set("network", "wan", "ipv6", checked("wan_ipv6") and "1" or "0")
    uci:commit("network")
    return true
end

local function save_iptv(uci)
    local enabled = checked("iptv_enabled")
    local vlan_mode = clean(luci.http.formvalue("iptv_vlan_mode"), 16)
    local vlan_id = clean(luci.http.formvalue("iptv_vlan_id"), 4)

    if vlan_mode ~= "untagged" and vlan_mode ~= "tagged" then
        return nil, "请选择 IPTV VLAN 模式"
    end
    if enabled and vlan_mode == "tagged" and not valid_vlan(vlan_id) then
        return nil, "IPTV VLAN ID 必须为 1–4094"
    end
    if enabled and vlan_mode == "tagged"
        and uci:get("network", "wan", "be6500_vlan_mode") == "tagged"
        and uci:get("network", "wan", "be6500_vlan_id") == vlan_id then
        return nil, "IPTV VLAN ID 不能与互联网 VLAN ID 相同"
    end

    if not uci:get("network", "iptv") then
        uci:section("network", "interface", "iptv", {})
    end
    uci:set("network", "iptv", "proto", "dhcp")
    uci:set("network", "iptv", "ifname", vlan_mode == "tagged" and ("eth0." .. vlan_id) or "eth0")
    uci:set("network", "iptv", "defaultroute", "0")
    uci:set("network", "iptv", "peerdns", "0")
    uci:set("network", "iptv", "auto", enabled and "1" or "0")
    uci:set("network", "iptv", "be6500_enabled", enabled and "1" or "0")
    uci:set("network", "iptv", "be6500_vlan_mode", vlan_mode)
    if vlan_mode == "tagged" then
        uci:set("network", "iptv", "be6500_vlan_id", vlan_id)
    else
        uci:delete("network", "iptv", "be6500_vlan_id")
    end

    ensure_firewall_zone(uci, "iptv", "iptv")
    uci:commit("network")
    uci:commit("firewall")
    return true
end

local function save_lan(uci)
    local ipaddr = clean(luci.http.formvalue("lan_ip"), 15)
    local netmask = clean(luci.http.formvalue("lan_mask"), 15)
    if not valid_ipv4(ipaddr) or not valid_ipv4(netmask) then
        return nil, "局域网地址或子网掩码格式错误"
    end
    uci:set("network", "lan", "ipaddr", ipaddr)
    uci:set("network", "lan", "netmask", netmask)
    local start = tonumber(clean(luci.http.formvalue("dhcp_start"), 3))
    local limit = tonumber(clean(luci.http.formvalue("dhcp_limit"), 3))
    local lease = clean(luci.http.formvalue("dhcp_lease"), 12)
    if not start or start < 1 or start > 254 or not limit or limit < 1 or limit > 254
        or start + limit > 255 then
        return nil, "DHCP 地址池范围无效"
    end
    if not lease:match("^%d+[mhdw]$") then return nil, "租约时间格式应为 30m、12h、7d 等" end
    uci:set("dhcp", "lan", "start", tostring(start))
    uci:set("dhcp", "lan", "limit", tostring(limit))
    uci:set("dhcp", "lan", "leasetime", lease)
    uci:commit("network")
    uci:commit("dhcp")
    return true
end

local function save_wifi(uci, role)
    local prefix = role == "guest" and "guest_" or "main_"
    local enabled2 = checked(prefix .. "2g")
    local enabled5 = checked(prefix .. "5g")
    local unified = enabled2 and enabled5 and checked(prefix .. "unified")
    local common_ssid = clean(luci.http.formvalue(prefix .. "ssid"), 32)
    if role == "main" and not enabled2 and not enabled5 then return nil, "至少开启一个 Wi-Fi 频段" end
    if role == "guest" and (enabled2 or enabled5) then ensure_guest_network(uci) end
    ensure_wifi_profile(uci, role)
    if role == "main" then
        local freq_mode = clean(luci.http.formvalue("main_freq_mode"), 8)
        if freq_mode ~= "dual" and freq_mode ~= "tri" then return nil, "请选择双频或三频模式" end
        uci:set("wireless", "main", "freq_mode", freq_mode)
        uci:set("wireless", "main", "mlo", checked("main_mlo") and "1" or "0")
        uci:set("wireless", "main", "wifi5_compatible", checked("main_wifi5_compatible") and "1" or "0")
    end

    local devices = {
        { name = radio_device(uci, 0), enabled = enabled2, band = "2g" },
        { name = radio_device(uci, 1), enabled = enabled5, band = "5g" }
    }
    for _, device in ipairs(devices) do
        if device.name and uci:get("wireless", device.name) then
            local section = iface_for_device(uci, device.name, role)
            if not device.enabled then
                if section then uci:delete("wireless", section) end
            else
            section = section or ensure_wifi_iface(uci, device.name, role)
            local radio_ssid = unified and common_ssid
                or clean(luci.http.formvalue(prefix .. device.band .. "_ssid"), 32)
            local fieldbase = prefix .. (unified and "" or device.band .. "_")
            local encryption = clean(luci.http.formvalue(fieldbase .. "encryption"), 16)
            local key = clean(luci.http.formvalue(fieldbase .. "key"), 63)
            local hidden = checked(fieldbase .. "hidden")
            -- Compatibility with the per-band fields shown below the unified
            -- switch; this also prevents an older cached page from clearing a
            -- valid encryption setting.
            if unified and encryption == "" then
                encryption = clean(luci.http.formvalue(prefix .. device.band .. "_encryption"), 16)
                key = clean(luci.http.formvalue(prefix .. device.band .. "_key"), 63)
                hidden = checked(prefix .. device.band .. "_hidden")
            end
            if radio_ssid == "" then return nil, device.band == "2g" and "请输入 2.4GHz 名称" or "请输入 5GHz 名称" end
            if encryption ~= "none" and encryption ~= "psk2" and encryption ~= "psk-mixed" and encryption ~= "sae-mixed" then
                return nil, "不支持的 Wi-Fi 加密方式"
            end
            if encryption ~= "none" and key ~= "" and (#key < 8 or #key > 63) then
                return nil, "Wi-Fi 密码必须为 8–63 个字符"
            end
            uci:set("wireless", section, "ssid", radio_ssid)
            uci:set("wireless", section, "encryption", encryption)
            uci:set("wireless", section, "hidden", hidden and "1" or "0")
            uci:delete("wireless", section, "disabled")
            if encryption == "none" then
                uci:delete("wireless", section, "key")
            elseif key ~= "" then
                uci:set("wireless", section, "key", key)
            elseif not uci:get("wireless", section, "key") then
                return nil, "请填写 Wi-Fi 密码"
            end
            end
        end
    end
    uci:set("wireless", role == "guest" and "guest" or "main", "unified", unified and "1" or "0")
    uci:commit("wireless")
    if role == "guest" then
        if not enabled2 and not enabled5 then remove_guest_network(uci) end
        uci:commit("network")
        uci:commit("dhcp")
        uci:commit("firewall")
    end
    return true
end

function action_save()
    local http = require "luci.http"
    local uci = require("luci.model.uci").cursor()
    local scope = clean(http.formvalue("scope"), 16)
    local ok, message

    if scope == "wan" then ok, message = save_wan(uci)
    elseif scope == "iptv" then ok, message = save_iptv(uci)
    elseif scope == "lan" then ok, message = save_lan(uci)
    elseif scope == "main_wifi" then ok, message = save_wifi(uci, "main")
    elseif scope == "guest_wifi" then ok, message = save_wifi(uci, "guest")
    else ok, message = nil, "未知设置页面" end

    if not ok then
        uci:revert("network"); uci:revert("wireless"); uci:revert("dhcp"); uci:revert("firewall")
        return json_reply({ ok = false, message = message })
    end

    if scope == "guest_wifi" then
        luci.sys.call("ubus call network reload >/dev/null 2>&1; /etc/init.d/firewall restart >/dev/null 2>&1; wifi reload >/dev/null 2>&1 &")
    elseif scope == "main_wifi" then
        luci.sys.call("wifi reload >/dev/null 2>&1 &")
    elseif scope == "lan" then
        luci.sys.call("/etc/init.d/dnsmasq restart >/dev/null 2>&1; ubus call network reload >/dev/null 2>&1 &")
    elseif scope == "iptv" then
        if checked("iptv_enabled") then
            luci.sys.call("ifdown iptv >/dev/null 2>&1; /etc/init.d/firewall reload >/dev/null 2>&1; ifup iptv >/dev/null 2>&1 &")
        else
            luci.sys.call("ifdown iptv >/dev/null 2>&1; /etc/init.d/firewall reload >/dev/null 2>&1 &")
        end
    else
        luci.sys.call("ifup wan >/dev/null 2>&1 &")
    end
    json_reply({ ok = true, scope = scope })
end

function action_status()
    local uci = require("luci.model.uci").cursor()
    local ubus = require "ubus"
    local connection = ubus.connect()
    local wan = connection and connection:call("network.interface.wan", "status", {}) or {}
    if connection then connection:close() end
    json_reply({
        board = "JDCloud BE6500",
        driver = "QSDK 12.5 / Linux 5.4.213",
        wan_up = wan and wan.up or false,
        wan_uptime = wan and wan.uptime or 0,
        wan_proto = uci:get("network", "wan", "proto") or "dhcp"
    })
end

local function oem_iface(uci, device, role)
    local result
    uci:foreach("wireless", "wifi-iface", function(section)
        local networks = " " .. tostring(section.network or "") .. " "
        local is_guest = networks:find(" guest ", 1, true) ~= nil
        if section.device == device and ((role == "guest" and is_guest) or (role ~= "guest" and not is_guest)) then
            result = section
            return false
        end
    end)
    return result or {}
end

local function oem_encryption(value)
    return ({ none = "none", psk2 = "psk2+ccmp", ["psk-mixed"] = "psk-mixed+ccmp",
        ["sae-mixed"] = "mixed-wpa3", sae = "wpa3" })[value] or value or "psk2+ccmp"
end

local function native_encryption(value)
    return ({
        none = "none",
        owe = "owe",
        psk = "psk",
        psk2 = "psk2",
        ["psk2+ccmp"] = "psk2",
        ["psk-mixed"] = "psk-mixed",
        ["psk-mixed+ccmp"] = "psk-mixed",
        ["mixed-psk+ccmp"] = "psk-mixed",
        ["sae-mixed"] = "sae-mixed",
        ["mixed-wpa3"] = "sae-mixed",
        sae = "sae",
        wpa3 = "wpa3",
        wpa = "wpa",
        wpa2 = "wpa2",
        ["wpa3-mixed"] = "wpa3-mixed",
        ["wpa3-192"] = "wpa3-192"
    })[value] or "psk2"
end

local function requested_encryption(value)
    value = clean(value, 32)
    if value == "none" or value == "owe" or value == "psk" or value == "psk-mixed" or value == "psk2"
        or value == "sae-mixed" or value == "sae" or value == "wpa" or value == "wpa2"
        or value == "wpa3" or value == "wpa3-mixed" or value == "wpa3-192" then
        return value
    end
    return native_encryption(value)
end

local function stored_encryption(iface)
    local encryption = native_encryption(iface.encryption)
    if tostring(iface.sae or "0") == "1" then
        return encryption == "sae" and "sae" or "sae-mixed"
    end
    return encryption
end

local function set_iface_encryption(uci, section, value)
    local encryption = requested_encryption(value)
    if encryption == "sae" then
        uci:set("wireless", section, "encryption", "sae")
        uci:delete("wireless", section, "sae")
        uci:set("wireless", section, "ieee80211w", "2")
    elseif encryption == "sae-mixed" then
        -- Store the standard UCI value so this page, netifd and LuCI's native
        -- wireless form all report the same WPA2/WPA3 mixed mode.  Older
        -- builds used encryption=psk2 plus a private sae=1 marker;
        -- stored_encryption() still accepts that format for migration.
        uci:set("wireless", section, "encryption", "sae-mixed")
        uci:delete("wireless", section, "sae")
        uci:set("wireless", section, "ieee80211w", "1")
    else
        uci:set("wireless", section, "encryption", encryption)
        uci:delete("wireless", section, "sae")
        uci:delete("wireless", section, "ieee80211w")
    end
    return encryption
end

-- The OEM API uses three logical levels: 0 = energy saving, 1 = standard,
-- 2 = wall penetration.  QWRT's Qualcomm wireless scripts consume an actual
-- dBm value from the normal `txpower` option, so keep both representations in
-- sync.  The maximum remains the board/driver-approved 24 dBm value.
local function normalize_wifi_power(value)
    value = tonumber(value)
    if value == 0 or value == 1 or value == 2 then return value end
    return 2
end

local function wifi_power_dbm(value)
    value = normalize_wifi_power(value)
    return value == 0 and 12 or value == 1 and 18 or 24
end

local function stored_wifi_power(uci, device)
    local value = tonumber(uci:get("wireless", device, "be6500_power"))
    if value == 0 or value == 1 or value == 2 then return value end
    local dbm = tonumber(uci:get("wireless", device, "txpower")) or 24
    return dbm >= 22 and 2 or dbm >= 15 and 1 or 0
end

local function oem_wifi_data(uci, device, role)
    local iface = oem_iface(uci, device, role)
    local width = tostring(uci:get("wireless", device, "htmode") or ""):match("(%d+)") or "0"
    local mode = width == "160" and 4 or width == "80" and 2 or width == "40" and 1 or 0
    local exists = iface[".name"] ~= nil
    local default_ssid = role == "guest" and "JDCloud-Guest" or "JDCloud-BE6500"
    return { enable = exists and iface.disabled ~= "1" and "1" or "0", ssid = iface.ssid or default_ssid,
        hidden = iface.hidden == "1" and "1" or "0", encryption = oem_encryption(stored_encryption(iface)),
        key = iface.key or "", channel = tonumber((uci:get("wireless", device, "channel"))) or 0,
        txpower = stored_wifi_power(uci, device), htmode = mode }
end

local function htmode_from_oem(device, value)
    value = tonumber(value) or 0
    if tostring(device):match("0$") then
        return (value == 1 or value == 40) and "HT40" or "HT20"
    end
    if value == 4 or value == 160 then return "HT160"
    elseif value == 2 or value == 80 then return "HT80"
    elseif value == 1 or value == 40 then return "HT40"
    else return "HT20" end
end

local function wifi_protocol_htmode(uci, device, compatible, requested_width)
    if not device then return nil end
    local width = tonumber(requested_width) or
        tonumber(tostring(uci:get("wireless", device, "htmode") or ""):match("(%d+)")) or 20
    if tostring(device):match("0$") and width > 40 then width = 40 end
    -- The OEM “top performance” choice is a maximum-width request.  On the
    -- A 160 MHz block starting at 149 reaches channel 177, which this board
    -- marks disabled. Channels 132–144 are retained for driver validation.
    local channel = tonumber(uci:get("wireless", device, "channel")) or 0
    if width >= 160 and tostring(device):match("2$") and channel >= 149 then width = 80 end
    if width >= 160 and tostring(device):match("1$") and tonumber(uci:get("wireless", "main", "freq_mode")) == 1 and channel > 64 then width = 80 end
    if compatible then
        return (tostring(device):match("0$") and "HT" or "VHT") .. tostring(width)
    end
    return "EHT" .. tostring(width)
end

local function native_wifi_band(uci, device, role)
    if not uci:get("wireless", device) then return nil end
    local iface = oem_iface(uci, device, role or "main")
    local width = tostring(uci:get("wireless", device, "htmode") or "")
    return {
        present = true, enabled = iface[".name"] ~= nil and iface.disabled ~= "1", ssid = iface.ssid or "",
        password = iface.key or "", hidden = iface.hidden == "1",
        encryption = stored_encryption(iface),
        radius_address = iface.auth_server or "", radius_port = tonumber(iface.auth_port) or 1812,
        radius_secret = iface.auth_secret or "",
        channel = tonumber((uci:get("wireless", device, "channel"))) or 0,
        bandwidth = tonumber(width:match("(%d+)")) or 20,
        power = stored_wifi_power(uci, device)
    }
end

local function action_native_wifi_impl()
    local uci = require("luci.model.uci").cursor()
    if luci.http.getenv("REQUEST_METHOD") == "POST" then
        local json = require "luci.jsonc"
        local body = json.parse(luci.http.content() or "") or {}
        local role = body.profile == "guest" and "guest" or "main"
        local guest_options
        if role == "guest" then
            local requested_cidr = clean(body.guest_network and body.guest_network.ipv4_cidr or "192.168.4.1/24", 32)
            local parsed_guest = ipv4_cidr(requested_cidr)
            if not parsed_guest then
                return json_reply({ ok = false, message = "访客 IPv4 网段格式无效，请填写网关地址/CIDR（例如 192.168.4.1/24）" })
            end
            local parsed_lan = ipv4_cidr(configured_ipv4_cidr(uci, "lan", "192.168.1.1/24"))
            if parsed_lan and parsed_guest.network <= parsed_lan.last and parsed_lan.network <= parsed_guest.last then
                return json_reply({ ok = false, message = "访客 IPv4 网段不能与主 LAN 网段重叠" })
            end
            guest_options = { ipv4_cidr = requested_cidr,
                ipv6_enabled = body.guest_network and body.guest_network.ipv6_enabled and true or false }
        end
        local changed = false
        local guest_infra_changed = false
        local changed_radios = {}
        local function mark_radio(device)
            if device then changed_radios[device] = true end
        end
        local function set_value(section, option, value, device)
            value = tostring(value)
            if tostring(uci:get("wireless", section, option) or "") ~= value then
                uci:set("wireless", section, option, value)
                changed = true
                mark_radio(device)
            end
        end
        local function delete_value(section, option, device)
            if uci:get("wireless", section, option) ~= nil then
                uci:delete("wireless", section, option)
                changed = true
                mark_radio(device)
            end
        end
        local function apply_encryption(section, encryption, device)
            local before = table.concat({
                tostring(uci:get("wireless", section, "encryption") or ""),
                tostring(uci:get("wireless", section, "sae") or ""),
                tostring(uci:get("wireless", section, "ieee80211w") or "")
            }, "|")
            set_iface_encryption(uci, section, encryption)
            local after = table.concat({
                tostring(uci:get("wireless", section, "encryption") or ""),
                tostring(uci:get("wireless", section, "sae") or ""),
                tostring(uci:get("wireless", section, "ieee80211w") or "")
            }, "|")
            if before ~= after then changed = true; mark_radio(device) end
        end
        -- hostapd.sh passes this list verbatim to hostapd.  Keep unrelated
        -- vendor options intact while making the MLO options an atomic group.
        local function apply_mlo_options(section, enabled, link_id, mld_addr, device)
            if not section then return end
            -- luci.model.uci:get_list() wraps an absent option as { false } on
            -- this LuCI compatibility runtime.  table.concat({ false }) then
            -- raises an exception and made every Wi-Fi save fail whenever the
            -- MLO hostapd option had not been created yet.  Read and normalize
            -- the raw value instead so a missing option is a genuinely empty
            -- list and scalar values remain compatible with older configs.
            local raw = uci:get("wireless", section, "hostapd_bss_options")
            local old = {}
            if type(raw) == "table" then
                for _, option in ipairs(raw) do
                    if type(option) == "string" then old[#old + 1] = option end
                end
            elseif type(raw) == "string" and raw ~= "" then
                old[1] = raw
            end
            local wanted = {}
            for _, option in ipairs(old) do
                option = tostring(option)
                if not option:match("^mld_ap=") and not option:match("^mld_addr=")
                    and not option:match("^mld_link_id=") then
                    wanted[#wanted + 1] = option
                end
            end
            if enabled then
                wanted[#wanted + 1] = "mld_ap=1"
                wanted[#wanted + 1] = "mld_addr=" .. mld_addr
                wanted[#wanted + 1] = "mld_link_id=" .. tostring(link_id)
            end
            if table.concat(old, "\0") ~= table.concat(wanted, "\0") then
                if #wanted > 0 then uci:set_list("wireless", section, "hostapd_bss_options", wanted)
                else uci:delete("wireless", section, "hostapd_bss_options") end
                changed = true
                mark_radio(device)
            end
        end
        local function apply(device, band)
            if not band or not uci:get("wireless", device) then return true end
            if not band.enabled then
                local existing = iface_for_device(uci, device, role)
                if existing then
                    uci:delete("wireless", existing)
                    changed = true
                    mark_radio(device)
                end
                return true
            end
            local section = ensure_wifi_iface(uci, device, role)
            if not section then return nil, "无法创建 " .. device .. " 无线接口" end
            local ssid = clean(band.ssid, 32)
            local encryption = requested_encryption(band.encryption)
            local key = clean(band.password, 63)
            local personal = encryption == "psk" or encryption == "psk-mixed" or encryption == "psk2"
                or encryption == "sae-mixed" or encryption == "sae"
            local enterprise = encryption == "wpa" or encryption == "wpa2" or encryption == "wpa3"
                or encryption == "wpa3-mixed" or encryption == "wpa3-192"
            if ssid == "" then return nil, "Wi-Fi 名称不能为空" end
            if personal and (#key < 8 or #key > 63) then return nil, "Wi-Fi 密码必须为 8–63 位" end
            local radius_address = clean(band.radius_address, 255)
            local radius_port = tonumber(band.radius_port) or 1812
            local radius_secret = clean(band.radius_secret, 255)
            if enterprise and (radius_address == "" or radius_secret == "" or radius_port < 1 or radius_port > 65535) then
                return nil, "企业级加密需要有效的 RADIUS 地址、端口和密钥"
            end
            delete_value(section, "disabled", device)
            set_value(section, "ssid", ssid, device)
            set_value(section, "hidden", band.hidden and "1" or "0", device)
            apply_encryption(section, encryption, device)
            if personal then
                set_value(section, "key", key, device)
            else
                delete_value(section, "key", device)
            end
            if enterprise then
                set_value(section, "auth_server", radius_address, device)
                set_value(section, "auth_port", tostring(radius_port), device)
                set_value(section, "auth_secret", radius_secret, device)
            else
                delete_value(section, "auth_server", device)
                delete_value(section, "auth_port", device)
                delete_value(section, "auth_secret", device)
            end
            if role == "main" then
                local channel = tonumber(band.channel) or 0
                -- QCN92xx exposes the two 5 GHz RF ranges as separate hardware
                -- radio indices under one wiphy.  Unrestricted ACS on logical
                -- radio1 may select channel 100-144 and silently bind the BSS to
                -- hardware radio2, whose data path is not active in dual-band
                -- mode.  Resolve "auto" to a safe non-DFS channel for each 5 GHz
                -- logical radio instead of allowing that cross-radio migration.
                -- Preserve ACS/auto instead of converting it to a fixed channel;
                -- top-performance width is resolved by the driver after ACS.
                if device == radio_device(uci, 1) and tonumber(uci:get("wireless", "main", "freq_mode")) == 1 and channel > 64 then channel = 36 end
                set_value(device, "channel", channel == 0 and "auto" or tostring(channel), device)
                local power = normalize_wifi_power(band.power)
                set_value(device, "be6500_power", tostring(power), device)
                set_value(device, "txpower", tostring(wifi_power_dbm(power)), device)
            end
            return true
        end
        local device0, device1, device2 = radio_device(uci, 0), radio_device(uci, 1), radio_device(uci, 2)
        local was_unified = uci:get("wireless", role, "unified") == "1"
        local bands = body.bands or {}
        local mlo_requested = role == "main" and body.mlo and true or false
        local any_enabled = (bands["2g"] and bands["2g"].enabled) or
            (bands["5g"] and bands["5g"].enabled) or (bands["52g"] and bands["52g"].enabled)
        if was_unified and not body.unified and bands["2g"] then
            local base = clean(bands["2g"].ssid, 32)
            local function factory_ssid(band, suffix)
                if not band then return end
                local current = clean(band.ssid, 32)
                if current == "" or current == base then
                    band.ssid = base:sub(1, 32 - #suffix) .. suffix
                end
            end
            factory_ssid(bands["5g"], "_5G")
            factory_ssid(bands["52g"], "_5G2")
        end
        local ok, message = apply(device0, body.bands and body.bands["2g"])
        if ok then ok, message = apply(device1, body.bands and body.bands["5g"]) end
        if ok then ok, message = apply(device2, body.bands and body.bands["52g"]) end
        if not ok then
            uci:revert("wireless")
            return json_reply({ ok = false, message = message })
        end
        if not uci:get("wireless", role) then
            uci:section("wireless", "be6500-profile", role, {})
            changed = true
        end

        local compatible = role == "main" and (body.wifi5_compatible and true or false)
            or uci:get("wireless", "main", "wifi5_compatible") == "1"
        local selected_bands = {}
        local requested_bands = role == "main" and body.wifi5_bands
            or tostring(uci:get("wireless", "main", "wifi5_bands") or "0")
        if type(requested_bands) == "string" then
            local parsed = {}; for band in requested_bands:gmatch("%d+") do parsed[#parsed + 1] = band end
            requested_bands = parsed
        end
        for _, band in ipairs(type(requested_bands) == "table" and requested_bands or {}) do
            band = tonumber(band); if band and band >= 0 and band <= 2 then selected_bands[band] = true end
        end
        local frequency_mode = tonumber(uci:get("wireless", "main", "freq_mode")) or 0
        if frequency_mode ~= 1 then selected_bands[2] = nil end
        local stored_bands = {}; for band = 0, 2 do if selected_bands[band] then stored_bands[#stored_bands + 1] = tostring(band) end end
        set_value(role, "unified", body.unified and "1" or "0")
        if role == "main" then
            set_value("main", "wifi5_compatible", compatible and "1" or "0")
            set_value("main", "wifi5_bands", table.concat(stored_bands, ","))

            local mlo = mlo_requested
            local mlo_enabled_count = 0
            for _, key in ipairs({ "2g", "5g", "52g" }) do
                if bands[key] and bands[key].enabled then mlo_enabled_count = mlo_enabled_count + 1 end
            end
            local unified_encryption = requested_encryption((bands["2g"] or {}).encryption)
            if mlo and not body.unified then
                uci:revert("wireless")
                return json_reply({ ok = false, message = "MLO 只能在多频合一开启时使用" })
            end
            if mlo and compatible then
                uci:revert("wireless")
                return json_reply({ ok = false, message = "MLO 与 Wi-Fi 5 兼容模式不能同时开启" })
            end
            if mlo and mlo_enabled_count < 2 then
                uci:revert("wireless")
                return json_reply({ ok = false, message = "MLO 至少需要启用两个 Wi-Fi 频段" })
            end
            -- QSDK supports transition mode on an MLD: legacy stations use
            -- WPA2-PSK while an MLO station negotiates SAE.  Only reject
            -- security modes which do not advertise SAE at all.
            if mlo and unified_encryption ~= "sae" and unified_encryption ~= "sae-mixed" then
                uci:revert("wireless")
                return json_reply({ ok = false, message = "MLO 需要 WPA3-SAE 或 WPA2/WPA3 混合模式" })
            end
            local mld_addr = tostring(uci:get("wireless", "main", "mld_addr") or ""):upper()
            if not valid_mac(mld_addr) then
                mld_addr = trim(luci.sys.exec("cat /sys/class/net/phy0-ap0/address 2>/dev/null")):upper()
                if not valid_mac(mld_addr) then mld_addr = "02:BE:65:00:00:01" end
                set_value("main", "mld_addr", mld_addr)
            end
            set_value("main", "mlo", mlo and "1" or "0")
            local mlo_links = {}
            if device0 then mlo_links[device0] = 0 end
            if device1 then mlo_links[device1] = 1 end
            if device2 then mlo_links[device2] = 2 end
            -- hostapd groups AP links into one MLD by interface name, not by
            -- mld_addr.  Giving every radio its normal per-pdev name creates
            -- three independent one-link MLDs; the first link starts and the
            -- remaining links fail while trying to share the nl80211 driver.
            -- Use one stable netdev name for all links while MLO is enabled.
            -- hostapd.uc keeps each radio distinct through radio_idx and adds
            -- the corresponding radio bit to this shared MLD netdev.
            local mlo_ifname = "be6500-mld0"
            local radio_devices = {}
            if device0 then radio_devices[#radio_devices + 1] = device0 end
            if device1 then radio_devices[#radio_devices + 1] = device1 end
            if device2 then radio_devices[#radio_devices + 1] = device2 end
            local mlo_primary
            for _, device in ipairs(radio_devices) do
                local iface = device and iface_for_device(uci, device, "main") or nil
                local enabled = mlo and iface and uci:get("wireless", iface, "disabled") ~= "1"
                if iface then
                    if enabled then set_value(iface, "ifname", mlo_ifname, device)
                    else delete_value(iface, "ifname", device) end
                end
                apply_mlo_options(iface, enabled, mlo_links[device], mld_addr, device)
                if enabled and not mlo_primary then mlo_primary = device end
            end
            -- netifd launches radio workers concurrently at boot.  Remember
            -- which enabled link owns the first hostapd MLD so the remaining
            -- radios can wait for it rather than racing to create a second MLD.
            if mlo_primary then set_value("main", "mlo_primary", mlo_primary)
            else delete_value("main", "mlo_primary") end
        end

        if role == "guest" then
            -- Guest enablement owns the guest bridge, DHCP and firewall lifecycle.
            -- Radio protocol/channel settings remain shared with the main SSID.
            local before_network = table.concat({
                tostring(uci:get("network", "guest") or ""),
                tostring(uci:get("network", "guest", "ipaddr") or ""),
                tostring(uci:get("network", "guest", "netmask") or ""),
                tostring(uci:get("network", "guest", "ip6assign") or "")
            }, "|")
            if any_enabled then
                ensure_guest_network(uci, guest_options)
            else
                remove_guest_network(uci)
            end
            local after_network = table.concat({
                tostring(uci:get("network", "guest") or ""),
                tostring(uci:get("network", "guest", "ipaddr") or ""),
                tostring(uci:get("network", "guest", "netmask") or ""),
                tostring(uci:get("network", "guest", "ip6assign") or "")
            }, "|")
            guest_infra_changed = before_network ~= after_network
        end

        -- Wi-Fi 5 兼容模式会改变相应射频的协议能力，因此只重启被影响的
        -- 无线频段；关闭时恢复 BE/Wi-Fi 7 模式。其余纯界面配置立即落盘。
        if role == "main" then
            local compat_2g = compatible and selected_bands[0]
            local compat_5g = compatible and selected_bands[1]
            local compat_52g = compatible and selected_bands[2]
            if device0 then set_value(device0, "hwmode", "11g", device0); set_value(device0, "htmode", wifi_protocol_htmode(uci, device0, compat_2g, bands["2g"] and bands["2g"].bandwidth), device0) end
            if device1 then set_value(device1, "hwmode", "11a", device1); set_value(device1, "htmode", wifi_protocol_htmode(uci, device1, compat_5g, bands["5g"] and bands["5g"].bandwidth), device1) end
            if device2 then set_value(device2, "hwmode", "11a", device2); set_value(device2, "htmode", wifi_protocol_htmode(uci, device2, compat_52g, bands["52g"] and bands["52g"].bandwidth), device2) end
        end

        local radios = {}
        local radio_devices = {}
        if device0 then radio_devices[#radio_devices + 1] = device0 end
        if device1 then radio_devices[#radio_devices + 1] = device1 end
        if device2 then radio_devices[#radio_devices + 1] = device2 end
        for _, device in ipairs(radio_devices) do
            if changed_radios[device] then radios[#radios + 1] = device end
        end
        if changed then uci:commit("wireless") end
        if role == "guest" then
            uci:commit("network")
            uci:commit("dhcp")
            uci:commit("firewall")
        end
        if guest_infra_changed then
            luci.sys.call("/usr/libexec/be6500-wifi-apply network >/tmp/be6500-wifi-reload.log 2>&1 &")
        elseif #radios > 0 then
            luci.sys.call("/usr/libexec/be6500-wifi-apply wifi >/tmp/be6500-wifi-reload.log 2>&1 &")
        end
        return json_reply({
            ok = true,
            apply = #radios > 0 and "wireless_restart" or "saved",
            radios = radios
        })
    end
    local role = luci.http.formvalue("profile") == "guest" and "guest" or "main"
    local actual_mode, runtime_bdf = wifi_runtime_personality()
    local configured_mode = tonumber((uci:get("wireless", "main", "freq_mode"))) or 0
    local wifi5_bands = {}
    for band in tostring(uci:get("wireless", "main", "wifi5_bands") or "0"):gmatch("%d+") do wifi5_bands[#wifi5_bands + 1] = tonumber(band) end
    json_reply({
        ok = true, model = "RE-CS-06",
        mode = actual_mode, configured_mode = configured_mode,
        mode_pending = actual_mode ~= configured_mode, runtime_bdf = runtime_bdf,
        profile = role,
        unified = uci:get("wireless", role, "unified") == "1",
        mlo = role == "main" and uci:get("wireless", "main", "mlo") == "1",
        wifi5_compatible = uci:get("wireless", "main", "wifi5_compatible") == "1",
        wifi5_band = tonumber((uci:get("wireless", "main", "wifi5_band"))) or 0,
        wifi5_bands = wifi5_bands,
        guest_network = role == "guest" and {
            ipv4_cidr = configured_ipv4_cidr(uci, "guest", "192.168.4.1/24"),
            ipv6_enabled = uci:get("network", "guest", "ip6assign") ~= nil
        } or nil,
        bands = { ["2g"] = native_wifi_band(uci, radio_device(uci, 0), role),
            ["5g"] = native_wifi_band(uci, radio_device(uci, 1), role), ["52g"] = native_wifi_band(uci, radio_device(uci, 2), role) }
    })
end

function action_native_wifi()
    local is_post = luci.http.getenv("REQUEST_METHOD") == "POST"
    local snapshot = is_post and native_wifi_config_snapshot() or nil
    local ok, result = xpcall(action_native_wifi_impl, function(error)
        return debug.traceback(tostring(error), 2)
    end)
    if ok then return result end
    -- Discard the ubus UCI transaction before restoring the on-disk safety
    -- copy.  Otherwise the failed request can leave staged changes which a
    -- later, unrelated LuCI commit would accidentally apply.
    revert_native_wifi_changes()
    if snapshot then restore_native_wifi_config(snapshot) end
    log_native_wifi_error(result)
    return json_reply({
        ok = false,
        message = is_post
            and "Wi-Fi 配置处理失败，本次变更已撤销；请重试或查看系统日志"
            or "Wi-Fi 配置读取失败，请刷新页面后重试"
    })
end

function action_native_wifi_mode()
    local json = require "luci.jsonc"
    if luci.http.getenv("REQUEST_METHOD") ~= "POST" then
        return json_reply({ ok = false, message = "仅支持 POST" })
    end
    local body = json.parse(luci.http.content() or "") or {}
    local mode = tonumber(body.mode)
    if mode ~= 0 and mode ~= 1 then
        return json_reply({ ok = false, message = "无效的 Wi-Fi 模式" })
    end
    local rc = luci.sys.call(string.format("/usr/sbin/be6500-switch-wifi-mode %d >/tmp/be6500-switch-wifi-api.log 2>&1", mode))
    local result = trim(luci.sys.exec("tail -n 1 /tmp/be6500-switch-wifi-api.log 2>/dev/null"))
    if rc ~= 0 then
        return json_reply({ ok = false, mode = mode, reboot = false,
            message = result ~= "" and result or "无线模式切换失败，已保留原设置" })
    end
    local reboot_required = result == "reboot_required"
    if reboot_required then
        -- The mode confirmation already authorizes a reboot.  Schedule it in
        -- the backend so losing the browser RPC or closing its modal cannot
        -- leave the router configured for one BDF while running another.
        luci.sys.call("(sleep 4; sync; /sbin/reboot) >/tmp/be6500-mode-reboot.log 2>&1 &")
    end
    json_reply({ ok = true, mode = mode, reboot = reboot_required,
        apply = result == "reboot_required" and "reboot_required" or
            (result == "unchanged" and "saved" or "wireless_restart") })
end

local function oem_set_wifi(uci, params)
    local wifi_type = tonumber(params.type) or 0
    local role = wifi_type % 2 == 1 and "guest" or "main"
    if role == "guest" then
        local enabled = tostring(params.enable) == "1"
        if not enabled then
            local removed = {}
            uci:foreach("wireless", "wifi-iface", function(section)
                local networks = " " .. tostring(section.network or "") .. " "
                if section.be6500_role == "guest" or networks:find(" guest ", 1, true) then
                    removed[#removed + 1] = section[".name"]
                end
            end)
            for _, section in ipairs(removed) do uci:delete("wireless", section) end
            remove_guest_network(uci)
            uci:commit("wireless"); uci:commit("network"); uci:commit("dhcp"); uci:commit("firewall")
            luci.sys.call("ubus call network reload >/dev/null 2>&1; /etc/init.d/firewall reload >/dev/null 2>&1; wifi reload >/dev/null 2>&1 &")
            return true
        end
        local ssid = clean(params.ssid, 32)
        local encryption = requested_encryption(params.encryption)
        local key = clean(params.key, 63)
        if ssid == "" then return nil end
        if encryption ~= "none" and key ~= "" and (#key < 8 or #key > 63) then return nil end
        if encryption ~= "none" and key == "" then
            local existing = oem_iface(uci, radio_device(uci, 0), "guest")
            if not existing.key then return nil end
            key = existing.key
        end
        ensure_guest_network(uci)
        local created = 0
        for index = 0, 2 do
            local device = radio_device(uci, index)
            if device then
                local existing = oem_iface(uci, device, "guest")
                local section = existing[".name"]
                section = section or ensure_wifi_iface(uci, device, "guest")
                created = created + 1
                uci:delete("wireless", section, "disabled")
                uci:set("wireless", section, "ssid", ssid)
                uci:set("wireless", section, "hidden", tostring(params.hidden) == "1" and "1" or "0")
                set_iface_encryption(uci, section, encryption)
                if encryption == "none" then
                    uci:delete("wireless", section, "key")
                else uci:set("wireless", section, "key", key) end
            end
        end
        if created == 0 then return nil end
        ensure_wifi_profile(uci, "guest")
        uci:set("wireless", "guest", "unified", "1")
        uci:commit("wireless"); uci:commit("network"); uci:commit("dhcp"); uci:commit("firewall")
        luci.sys.call("ubus call network reload >/dev/null 2>&1; /etc/init.d/firewall reload >/dev/null 2>&1; wifi reload >/dev/null 2>&1 &")
        return true
    end
    local band_type = role == "guest" and wifi_type - 1 or wifi_type
    local device = radio_device(uci, band_type == 0 and 0 or band_type == 2 and 1 or 2)
    if not device then return nil end
    local iface = oem_iface(uci, device, role)
    local section = iface[".name"]
    if tostring(params.enable) ~= "1" then
        if section then uci:delete("wireless", section) end
        uci:commit("wireless")
        luci.sys.call("wifi reload >/dev/null 2>&1 &")
        return true
    end
    section = section or ensure_wifi_iface(uci, device, role)
    if not section then return nil end
    uci:delete("wireless", section, "disabled")
    uci:set("wireless", section, "ssid", clean(params.ssid, 32))
    uci:set("wireless", section, "hidden", tostring(params.hidden) == "1" and "1" or "0")
    local encryption = set_iface_encryption(uci, section, params.encryption)
    if encryption == "none" then
        uci:delete("wireless", section, "key")
    elseif params.key and params.key ~= "" then
        uci:set("wireless", section, "key", clean(params.key, 63))
    end
    if params.channel then uci:set("wireless", device, "channel", tostring(params.channel)) end
    if params.htmode ~= nil then uci:set("wireless", device, "htmode", htmode_from_oem(device, params.htmode)) end
    local power = normalize_wifi_power(params.txpower)
    uci:set("wireless", device, "be6500_power", tostring(power))
    uci:set("wireless", device, "txpower", tostring(wifi_power_dbm(power)))
    uci:commit("wireless")
    luci.sys.call("wifi reload >/dev/null 2>&1 &")
    return true
end

local function prefix_to_netmask(prefix)
    prefix = tonumber(prefix) or 0
    if prefix < 0 then prefix = 0 elseif prefix > 32 then prefix = 32 end
    local parts = {}
    for index = 1, 4 do
        local bits = math.max(0, math.min(8, prefix - (index - 1) * 8))
        parts[index] = bits == 0 and 0 or 256 - 2 ^ (8 - bits)
    end
    return table.concat(parts, ".")
end

local function safe_name(value, fallback)
    value = clean(value, 64):gsub("[^%w_]", "_"):gsub("_+", "_")
    return value ~= "" and value or fallback
end

local function ubus_interface(name)
    local ubus = require "ubus"
    local connection = ubus.connect()
    if not connection then return {} end
    local result = connection:call("network.interface." .. name, "status", {}) or {}
    connection:close()
    return result
end

local function first_ipv4(status)
    local addresses = status and status["ipv4-address"] or {}
    local address = type(addresses) == "table" and addresses[1] or nil
    return address and address.address or "", address and prefix_to_netmask(address.mask) or ""
end

local function first_gateway(status, family)
    for _, route in ipairs(status and status.route or {}) do
        if route.target == (family == 6 and "::" or "0.0.0.0") then return route.nexthop or "" end
    end
    return ""
end

local function string_list(value)
    if type(value) == "table" then return value end
    if value == nil or value == "" then return {} end
    local result = {}
    for item in tostring(value):gmatch("%S+") do result[#result + 1] = item end
    return result
end

local function set_uci_list(uci, config, section, option, values)
    local normalized = {}
    for _, value in ipairs(values or {}) do
        if value and value ~= "" then normalized[#normalized + 1] = tostring(value) end
    end
    if #normalized > 0 then uci:set_list(config, section, option, normalized)
    else uci:delete(config, section, option) end
end

local function first_section(uci, config, kind)
    local found
    uci:foreach(config, kind, function(section)
        found = section[".name"]
        return false
    end)
    return found
end

local function oem_device_section(mac)
    return "device_" .. tostring(mac or ""):lower():gsub("[^%x]", "")
end

local function known_wireless_clients(uci)
    local result = {}
    local runtime_ssids = {}
    local runtime_mode = wifi_runtime_personality()

    local function live_ssid(iface, reported, phy, frequency)
        local ssid = clean(reported, 64)
        if ssid ~= "" or not tostring(iface):match("^[%w_.%-]+$") then return ssid end
        -- Some QSDK hostapd get_status replies omit ssid even though the AP
        -- and its clients are live.  Read the BSS's own control socket rather
        -- than guessing from a shared/multi-band UCI SSID.
        local config = luci.sys.exec("hostapd_cli -p /var/run/hostapd -i " .. iface
            .. " get_config 2>/dev/null") or ""
        ssid = clean(config:match("^ssid=([^\r\n]*)")
            or config:match("[\r\n]ssid=([^\r\n]*)"), 64)
        if ssid ~= "" then return ssid end
        ssid = runtime_ssids[iface] or runtime_ssids[iface:gsub("_link%d+$", "")]
        if ssid and ssid ~= "" then return ssid end
        local info = luci.sys.exec("iwinfo " .. iface .. " info 2>/dev/null") or ""
        ssid = clean(info:match('ESSID:%s*"([^"]+)"'), 64)
        if ssid ~= "" then return ssid end
        -- On this QSDK build all three live probes can omit the SSID.  An AP
        -- interface still identifies its physical radio and BSS index; use
        -- that exact configured BSS as the final fallback.  Do not substitute
        -- the unified SSID blindly: guest BSSes may use a different name.
        local index = tonumber(tostring(phy or ""):match("^phy%d+%.(%d+)$")
            or iface:match("^phy%d+%.(%d+)%-"))
        if index == nil then
            local band = wifi_band_from_interface(uci, phy, iface, frequency, runtime_mode)
            index = ({ ["2.4G"] = 0, ["5G"] = 1, ["5.2G"] = 1, ["5.8G"] = 2 })[band]
        end
        local ap_index = tonumber(iface:match("%-ap(%d+)"))
        local device = index and radio_device(uci, index)
        if device and ap_index ~= nil then
            local configured = oem_iface(uci, device, ap_index == 0 and "main" or "guest")
            return clean(configured.ssid, 64)
        end
        return ""
    end

    local function add(mac, ssid, band, signature)
        mac = tostring(mac or ""):upper()
        if not valid_mac(mac) then return end
        local item = result[mac]
        if not item then
            item = { ssid = "", signature = "", bands = {} }
            result[mac] = item
        end
        if ssid and ssid ~= "" then item.ssid = ssid end
        if signature and signature ~= "" then item.signature = signature end
        if band and band ~= "未知频段" then item.bands[band] = true end
    end

    -- hostapd is authoritative for stations associated with the current BSS.
    -- This also works with ath12k/mac80211 interface names used by this build.
    local loaded, ubus = pcall(require, "ubus")
    local connection = loaded and ubus and ubus.connect() or nil
    if connection then
        local wireless_ok, wireless_status = pcall(connection.call, connection,
            "network.wireless", "status", {})
        if wireless_ok and type(wireless_status) == "table" then
            for _, radio in pairs(wireless_status) do
                for _, runtime in pairs(type(radio) == "table" and radio.interfaces or {}) do
                    local config = type(runtime.config) == "table" and runtime.config or {}
                    local iface = tostring(runtime.ifname or config.ifname or "")
                    local section = tostring(runtime.section or config.section or "")
                    local ssid = section ~= "" and uci:get("wireless", section, "ssid") or config.ssid
                    if iface:match("^[%w_.%-]+$") and ssid and ssid ~= "" then
                        runtime_ssids[iface] = clean(ssid, 64)
                    end
                end
            end
        end
        local objects = luci.sys.exec("ubus list 'hostapd.*' 2>/dev/null") or ""
        for object in objects:gmatch("[^%s]+") do
            local ok, status = pcall(connection.call, connection, object, "get_clients", {})
            if ok and type(status) == "table" then
                local status_ok, bss = pcall(connection.call, connection, object, "get_status", {})
                bss = status_ok and type(bss) == "table" and bss or {}
                local iface = object:match("^hostapd%.(.+)$") or ""
                local band = wifi_band_from_interface(uci, bss.phy, iface, bss.freq or status.freq, runtime_mode)
                local ssid = live_ssid(iface, bss.ssid, bss.phy, bss.freq or status.freq)
                for mac, client in pairs(status.clients or {}) do
                    if valid_mac(mac) and (type(client) ~= "table" or client.authorized ~= false) then
                        add(mac, ssid, band,
                            type(client) == "table" and tostring(client.signature or "") or "")
                    end
                end
            end
        end
        connection:close()
    end

    -- Compatibility fallback for drivers without hostapd ubus objects.
    local interfaces = luci.sys.exec("iw dev 2>/dev/null | awk '/Interface/{print $2}'") or ""
    for iface in interfaces:gmatch("[^%s]+") do
        local info = luci.sys.exec("iw dev " .. iface .. " info 2>/dev/null") or ""
        local frequency = tonumber(info:match("channel%s+%d+%s+%((%d+)%s+MHz%)")) or 0
        local band = wifi_band_from_interface(uci, "", iface, frequency, runtime_mode)
        local ssid = clean(info:match("[\r\n]%s*ssid%s+([^\r\n]+)") or "", 64)
        local output = luci.sys.exec("iwinfo " .. iface .. " assoclist 2>/dev/null") or ""
        for mac in output:gmatch("(%x%x:%x%x:%x%x:%x%x:%x%x:%x%x)") do
            add(mac, ssid, band, "")
        end
    end
    local ordered_bands = { "2.4G", "5.2G", "5.8G", "5G", "6G" }
    for _, item in pairs(result) do
        local bands = {}
        for _, band in ipairs(ordered_bands) do
            if item.bands[band] then bands[#bands + 1] = band end
        end
        item.band = #bands > 0 and table.concat(bands, " / ") or "未知频段"
        item.bands = nil
    end
    return result
end

local function usable_device_name(name)
    name = trim(name or "")
    if name == "" or name == "*" or name == "-" or name == "未知设备" or name == "Unknown" then return nil end
    return name:gsub("%.lan%.$", ""):gsub("%.lan$", "")
end

local function device_name_catalog(uci)
    local names = { saved = {}, lease = {}, static = {}, hint = {} }
    local leases = io.open("/tmp/dhcp.leases", "r")
    if leases then
        for line in leases:lines() do
            local mac, hostname = line:match("^%d+%s+(%S+)%s+%S+%s+(%S+)")
            if mac and valid_mac(mac) and usable_device_name(hostname) then
                names.lease[mac:upper()] = usable_device_name(hostname)
            end
        end
        leases:close()
    end
    uci:foreach("dhcp", "host", function(section)
        local mac = type(section.mac) == "table" and section.mac[1] or section.mac
        if mac and valid_mac(mac) and usable_device_name(section.name) then
            names.static[tostring(mac):upper()] = usable_device_name(section.name)
        end
    end)
    uci:foreach("be6500_oem", "device", function(section)
        local mac = tostring(section.mac or ""):upper()
        if valid_mac(mac) and usable_device_name(section.name) then names.saved[mac] = usable_device_name(section.name) end
    end)
    local hints = require("luci.jsonc").parse(luci.sys.exec("ubus call luci-rpc getHostHints 2>/dev/null") or "") or {}
    for mac, hint in pairs(hints) do
        local name = type(hint) == "table" and usable_device_name(hint.name) or nil
        if valid_mac(mac) and name then names.hint[mac:upper()] = name end
    end
    return names
end

local function resolved_device_name(uci, catalog, mac, preferred)
    mac = tostring(mac or ""):upper()
    local saved = uci:get("be6500_oem", oem_device_section(mac), "name")
        or uci:get("be6500_oem", "dev_" .. mac:lower():gsub(":", "_"), "name")
    local name = usable_device_name(preferred) or usable_device_name(saved)
        or catalog.saved[mac] or catalog.lease[mac] or catalog.static[mac] or catalog.hint[mac]
    if name then return name end
    return "设备-" .. mac:gsub(":", ""):sub(-4)
end

local function access_entries(uci, policy)
    local result, catalog = {}, device_name_catalog(uci)
    uci:foreach("be6500_oem", "access", function(section)
        if section.policy == policy and valid_mac(section.mac) then
            local mac = section.mac:upper()
            result[#result + 1] = { mac = mac, name = resolved_device_name(uci, catalog, mac, section.name) }
        end
    end)
    table.sort(result, function(a, b) return a.mac < b.mac end)
    return result
end

local function find_access(uci, policy, mac)
    local found
    uci:foreach("be6500_oem", "access", function(section)
        if section.policy == policy and tostring(section.mac):upper() == tostring(mac):upper() then
            found = section[".name"]
            return false
        end
    end)
    return found
end

local function request_client(uci)
    local ip = tostring(luci.http.getenv("REMOTE_ADDR") or "")
    if not ip:match("^[%x%.:]+$") then return "", false end
    local output = luci.sys.exec("ip neigh show " .. ip .. " 2>/dev/null") or ""
    local mac = output:match("lladdr%s+(%x%x:%x%x:%x%x:%x%x:%x%x:%x%x)")
    if not mac then return "", false end
    mac = mac:upper()
    return mac, known_wireless_clients(uci)[mac] ~= nil
end

local function replace_access_entries(uci, policy, entries)
    local remove = {}
    uci:foreach("be6500_oem", "access", function(section)
        if section.policy == policy then remove[#remove + 1] = section[".name"] end
    end)
    for _, section in ipairs(remove) do uci:delete("be6500_oem", section) end
    local seen = {}
    for _, item in ipairs(type(entries) == "table" and entries or {}) do
        local mac = tostring(item.macaddr or item.mac or ""):upper()
        if valid_mac(mac) and not seen[mac] then
            seen[mac] = true
            uci:section("be6500_oem", "access", nil, {
                policy = policy, mac = mac, name = clean(item.name, 64)
            })
        end
    end
end

local function live_hostapd_ifaces(uci, role)
    local objects, result, seen = {}, {}, {}
    local output = luci.sys.exec("ubus -S list 'hostapd.*' 2>/dev/null") or ""
    for object in output:gmatch("[^%s]+") do
        local iface = object:match("^hostapd%.(.+)$")
        if iface and iface:match("^[%w_.%-]+$") then objects[iface] = true end
    end
    -- QSDK exposes only the primary MLD interface over ubus, while every MLO
    -- partner link has its own hostapd control socket.  ACL commands must be
    -- sent to those sockets too or a client associated on link1/link2 keeps
    -- using the stale policy until the whole Wi-Fi stack is restarted.
    output = luci.sys.exec("ls -1 /var/run/hostapd 2>/dev/null") or ""
    for iface in output:gmatch("[^%s]+") do
        if iface:match("^[%w_.%-]+$") and iface ~= "global"
            and not iface:match("^hostapd_if_eloop_") then
            objects[iface] = true
        end
    end

    local function add(iface)
        iface = tostring(iface or "")
        if objects[iface] and not seen[iface] then
            seen[iface] = true
            result[#result + 1] = iface
        end
    end

    local wanted_sections = {}
    for index = 0, 2 do
        local device = radio_device(uci, index)
        local section = device and oem_iface(uci, device, role) or {}
        if section[".name"] then wanted_sections[section[".name"]] = true end
    end

    -- netifd reports the real runtime ifname.  QSDK uses names such as
    -- phy00.0-ap0, so deriving phy0-ap0 from the radio index is incorrect.
    local loaded, ubus = pcall(require, "ubus")
    local connection = loaded and ubus and ubus.connect() or nil
    if connection then
        local ok, status = pcall(connection.call, connection, "network.wireless", "status", {})
        if ok and type(status) == "table" then
            for _, radio in pairs(status) do
                for _, runtime in pairs(type(radio) == "table" and radio.interfaces or {}) do
                    local config = type(runtime.config) == "table" and runtime.config or {}
                    local section = tostring(runtime.section or config.section or "")
                    if wanted_sections[section] then add(runtime.ifname or config.ifname) end
                end
            end
        end
        connection:close()
    end

    -- Compatibility fallback for QSDK/mac80211 builds whose wireless status
    -- omits the UCI section name.  The primary AP BSS always ends in -ap0;
    -- guest BSSes use the following AP indices.
    if #result == 0 then
        for iface in pairs(objects) do
            if (role == "guest" and iface:match("%-ap[1-9][0-9]*$"))
                or (role ~= "guest" and iface:match("%-ap0$")) then
                add(iface)
            end
        end
    end
    if role ~= "guest" then
        local primary = {}
        for _, iface in ipairs(result) do primary[#primary + 1] = iface end
        for _, iface in ipairs(primary) do
            local prefix = iface .. "_link"
            for candidate in pairs(objects) do
                local suffix = candidate:sub(#prefix + 1)
                if candidate:sub(1, #prefix) == prefix and suffix:match("^%d+$") then
                    add(candidate)
                end
            end
        end
    end
    table.sort(result)
    return result, next(objects) ~= nil
end

local function access_policy_snapshot(uci)
    local policy = uci:get("be6500_oem", "access", "policy") == "allow" and "allow" or "deny"
    local previous = {
        enabled = uci:get("be6500_oem", "access", "enabled") ~= "0",
        policy = policy,
        listed = {}
    }
    uci:foreach("be6500_oem", "access", function(section)
        local mac = tostring(section.mac or ""):upper()
        if section.policy == policy and valid_mac(mac) then previous.listed[mac] = true end
    end)
    return previous
end

local function apply_mac_policy(uci, policy, previous)
    local list = access_entries(uci, policy)
    local enabled = uci:get("be6500_oem", "access", "enabled") ~= "0"
    for index = 0, 2 do
        local device = radio_device(uci, index)
        local iface = device and oem_iface(uci, device, "main") or {}
        local section = iface[".name"]
        if section then
            if enabled then uci:set("wireless", section, "macfilter", policy)
            else uci:delete("wireless", section, "macfilter") end
            local macs = {}
            for _, item in ipairs(list) do macs[#macs + 1] = item.mac end
            set_uci_list(uci, "wireless", section, "maclist", macs)
        end
    end
    if not uci:commit("wireless") then return false, "无线访问控制配置提交失败" end
    -- QSDK accepts ACL changes on a running hostapd instance.  Updating both
    -- ACL lists here avoids a radio restart (and therefore avoids dropping
    -- every connected station) when a black/white-list is edited.
    local function hostapd_command(iface, arguments)
        local handle = io.popen("hostapd_cli -p /var/run/hostapd -i " .. iface
            .. " " .. arguments .. " 2>&1")
        if not handle then return false, "" end
        local command_output = handle:read("*a") or ""
        local ok = handle:close()
        if not ok or command_output:find("FAIL", 1, true)
            or command_output:find("UNKNOWN COMMAND", 1, true) then
            return false, command_output
        end
        return true, command_output
    end
    local function sync_hostapd_acl(iface, command_name, active, previous_active)
        local ok, current = hostapd_command(iface, command_name .. " SHOW")
        if not ok then return false end
        local present, desired = {}, {}
        for mac in current:gmatch("(%x%x:%x%x:%x%x:%x%x:%x%x:%x%x)") do
            present[mac:upper()] = true
        end
        if active then
            for _, item in ipairs(list) do
                desired[item.mac] = true
                -- Match the stock router's per-MAC add/delete behavior: an
                -- ordinary save must not rewrite entries that did not change.
                -- In particular, touching an unchanged deny entry can cause
                -- hostapd to reconsider an associated station.
                local newly_added = not previous_active
                    or not (previous and previous.listed[item.mac])
                if newly_added and not present[item.mac]
                    and not hostapd_command(iface, command_name .. " ADD_MAC " .. item.mac) then return false end
            end
        end
        for mac in pairs(present) do
            -- During an ordinary list edit, remove only MACs that this save
            -- actually removed.  Deleting unrelated runtime entries makes
            -- hostapd re-evaluate associated stations and can drop links.
            local changed_here = previous_active and previous and previous.listed[mac]
            if not desired[mac] and (active ~= previous_active or changed_here)
                and not hostapd_command(iface, command_name .. " DEL_MAC " .. mac) then return false end
        end
        return true
    end
    local ifaces, hostapd_running = live_hostapd_ifaces(uci, "main")
    if hostapd_running and #ifaces == 0 then
        return false, "未能识别主 Wi-Fi 的运行接口，名单已保存但尚未即时生效"
    end
    for _, iface in ipairs(ifaces) do
        local accept_active = enabled and policy == "allow"
        local deny_active = enabled and policy == "deny"
        local mode = accept_active and "1" or "0"
        local previous_mode = previous and previous.enabled and previous.policy == "allow" and "1" or "0"
        local previous_accept = previous and previous.enabled and previous.policy == "allow" or false
        local previous_deny = previous and previous.enabled and previous.policy == "deny" or false
        if not sync_hostapd_acl(iface, "accept_acl", accept_active, previous_accept)
            or not sync_hostapd_acl(iface, "deny_acl", deny_active, previous_deny) then
            return false, "运行中的 Wi-Fi ACL 更新失败，名单已保存但尚未即时生效"
        end
        -- 0 = accept unless denied; 1 = deny unless accepted.  This QSDK
        -- hostapd supports changing macaddr_acl at runtime and immediately
        -- re-evaluates connected stations, so mode changes need no reload.
        if mode ~= previous_mode and not hostapd_command(iface, "set macaddr_acl " .. mode) then
            return false, "运行中的 Wi-Fi 访问模式更新失败，名单已保存但尚未即时生效"
        end

        -- The hostapd ACL commands themselves re-evaluate only affected
        -- stations (DENY_ACL ADD_MAC / ACCEPT_ACL DEL_MAC).  A second all_sta
        -- pass with explicit deauthenticate is redundant and can kick MLO
        -- links that were not changed by this save.
    end
    return true, #ifaces > 0 and "名单已即时生效，Wi-Fi 未重启"
        or "名单已保存；主 Wi-Fi 当前未运行，将在启动后生效"
end

-- Keep device recognition consistent with the main router's device manager:
-- prefer the local IEEE OUI database, then refine the result with hostname
-- patterns. Locally administered (random/private) MAC addresses deliberately
-- skip OUI lookup so they are not assigned a false manufacturer.
local vendor_prefixes
local builtin_vendors = {
    ["047A0B"] = "Beijing Xiaomi Electronics",
    ["109E3A"] = "Zhejiang Tmall Technology",
    ["B8144D"] = "Apple",
    ["C8BF4C"] = "Beijing Xiaomi Mobile Software Co., Ltd",
    ["E41B43"] = "Beijing Xiaomi Electronics",
    ["E4AAEC"] = "Tianjin Hualai Technology",
    ["FC315D"] = "Apple"
}

local function contains_any(value, needles)
    value = tostring(value or ""):lower()
    for _, needle in ipairs(needles) do
        if value:find(needle, 1, true) then return true end
    end
    return false
end

local function mac_is_private(mac)
    local first = tonumber(tostring(mac or ""):match("^(%x%x)"), 16)
    return first and math.floor(first / 2) % 2 == 1 or false
end

local function load_vendor_prefixes()
    if vendor_prefixes then return vendor_prefixes end
    vendor_prefixes = {}
    local files = {
        "/usr/share/arp-scan/ieee-oui.txt",
        "/usr/share/nmap/nmap-mac-prefixes"
    }
    for _, path in ipairs(files) do
        local file = io.open(path, "r")
        if file then
            for line in file:lines() do
                local prefix, name = line:match("^%s*([%x]+)%s+(.+)%s*$")
                if prefix and (#prefix == 6 or #prefix == 7 or #prefix == 9 or #prefix == 12) and name then
                    vendor_prefixes[prefix:upper()] = trim(name)
                end
            end
            file:close()
        end
    end
    for prefix, name in pairs(builtin_vendors) do
        if not vendor_prefixes[prefix] then vendor_prefixes[prefix] = name end
    end
    return vendor_prefixes
end

local function device_identity(name, mac)
    name = tostring(name or "")
    mac = tostring(mac or ""):upper()
    local compact_mac = mac:gsub(":", "")
    local vendor = ""
    if not mac_is_private(mac) then
        local prefixes = load_vendor_prefixes()
        for length = 12, 6, -1 do
            local prefix = compact_mac:sub(1, length)
            if prefixes[prefix] then vendor = prefixes[prefix]; break end
        end
    end

    local combined = (name .. " " .. vendor):lower()
    local device_type
    if mac == "E4:1B:43:D3:AC:CC" then
        device_type = "空调"
    elseif contains_any(combined, { "iphone", "ipad", "apple", "macbook" }) then
        device_type = "Apple 设备"
    elseif contains_any(combined, { "computer", "desktop", "laptop", "windows" })
        or combined:find("mac", 1, true) then
        device_type = "电脑"
    elseif contains_any(combined, { "tmall", "genie", "alibaba" }) then
        device_type = "天猫精灵"
    elseif contains_any(combined, { "airc", "air.condition", "空调" }) then
        device_type = "空调"
    elseif contains_any(combined, { "camera", "hualai", "摄像" }) then
        device_type = "摄像头 / 智能家居"
    elseif contains_any(combined, { "xiaomi", "redmi", "phone", "android" }) then
        device_type = "手机 / 小米设备"
    else
        device_type = "其他设备"
    end

    if vendor == "" then
        if mac == "E4:1B:43:D3:AC:CC" or contains_any(name, { "xiaomi", "redmi", "mijia", "mibt" }) then
            vendor = "小米"
        elseif contains_any(name, { "iphone", "ipad", "macbook" }) or name:lower() == "mac" then
            vendor = "Apple"
        elseif contains_any(name, { "tmall", "genie", "alibaba" }) then
            vendor = "天猫精灵 / 阿里巴巴"
        elseif contains_any(name, { "hualai" }) then
            vendor = "天津华来"
        elseif contains_any(name, { "huawei", "honor" }) then
            vendor = "华为 / 荣耀"
        elseif contains_any(name, { "oppo", "oneplus" }) then
            vendor = "OPPO / 一加"
        elseif contains_any(name, { "vivo", "iqoo" }) then
            vendor = "vivo / iQOO"
        else
            vendor = "暂未识别"
        end
    end
    return device_type, vendor
end

local wifi_reject_file = "/tmp/wifi_reject.json"
local wifi_reject_lock_file = "/tmp/wifi_reject.lock"

-- hostapd uses an fcntl lock on this same file while it merges a real ACL
-- rejection.  Use nixio's lockf wrapper here as well so an administrative
-- clear cannot overwrite (or be overwritten by) another radio's JSON merge.
local function with_wifi_reject_lock(callback)
    local nixio = require "nixio"
    local lock = nixio.open(wifi_reject_lock_file, "a+", 600)
    if not lock then return false end
    if not lock:lock("lock") then
        lock:close()
        return false
    end
    local ok, result = pcall(callback)
    lock:lock("ulock")
    lock:close()
    return ok and result or false
end

local function wifi_reject_band(uci, record, runtime_mode)
    -- Rejections and live stations share the same physical-radio mapping.
    return wifi_band_from_interface(uci, record.phy, record.ifname, record.freq, runtime_mode)
end

local function wifi_reject_rows(uci)
    local file = io.open(wifi_reject_file, "r")
    if not file then return {} end
    local raw = file:read("*a") or ""
    file:close()
    local records = require("luci.jsonc").parse(raw)
    if type(records) ~= "table" then return {} end

    local catalog, leases, rows = device_name_catalog(uci), {}, {}
    local runtime_mode = wifi_runtime_personality()
    local lease_file = io.open("/tmp/dhcp.leases", "r")
    if lease_file then
        for line in lease_file:lines() do
            local mac, ip, hostname = line:match("^%d+%s+(%S+)%s+(%S+)%s+(%S+)")
            if mac and valid_mac(mac) then
                leases[mac:upper()] = { ip = ip or "", name = hostname or "" }
            end
        end
        lease_file:close()
    end

    local guest_ssids = {}
    uci:foreach("wireless", "wifi-iface", function(section)
        if section.network == "guest" and section.ssid then guest_ssids[tostring(section.ssid)] = true end
    end)

    for _, record in ipairs(records) do
        local mac = tostring(type(record) == "table" and record.mac or ""):upper()
        if valid_mac(mac) then
            local lease = leases[mac] or {}
            local name = resolved_device_name(uci, catalog, mac, lease.name)
            local suffix = mac:gsub(":", ""):sub(-4)
            if name == "有线设备-" .. suffix then name = "无线设备-" .. suffix end
            local device_type, vendor = device_identity(name, mac)
            if vendor == "暂未识别" and mac_is_private(mac) then vendor = "私有 MAC（厂商隐藏）" end
            local ssid = clean(record.ssid, 64)
            local reason = tostring(record.reason or "")
            local reason_name = reason == "mac_whitelist" and "白名单拒绝"
                or reason == "mac_blacklist" and "黑名单拒绝" or "访问控制拒绝"
            local last_seen = tonumber(record.last_seen) or 0
            local count = math.max(1, tonumber(record.count) or 1)
            rows[#rows + 1] = {
                id = mac .. "@" .. ssid, uid = mac, mac = mac,
                name = name, ip = lease.ip or "", ssid = ssid,
                ifname = clean(record.ifname, 32), phy = clean(record.phy, 32),
                bssid = clean(record.bssid, 17), reason = reason, reason_name = reason_name,
                first_seen = tonumber(record.first_seen) or last_seen,
                last_seen = last_seen, count = count,
                rejected_at = last_seen > 0 and os.date("%Y-%m-%d %H:%M:%S", last_seen) or "-",
                network = ssid ~= "" and ssid or "未知 SSID",
                band = wifi_reject_band(uci, record, runtime_mode),
                scope = guest_ssids[ssid] and "guest" or "main",
                device_type = device_type, vendor = vendor, brand = vendor
            }
        end
    end
    table.sort(rows, function(a, b) return a.last_seen > b.last_seen end)
    return rows
end

local function clear_wifi_reject_rows(mac, ssid)
    mac = tostring(mac or ""):upper()
    ssid = tostring(ssid or ""):gsub("[\r\n\t]", "")
    if mac ~= "" and not valid_mac(mac) then return false end
    -- /tmp/wifi_reject.json is the sole source of truth.  hostapd reloads it
    -- under its own file lock for every real ACL rejection, so clearing this
    -- view cannot be repopulated from another radio's stale process memory.
    return with_wifi_reject_lock(function()
        if mac == "" then os.remove(wifi_reject_file); return true end
        local file = io.open(wifi_reject_file, "r")
        if not file then return true end
        local records = require("luci.jsonc").parse(file:read("*a") or "")
        file:close()
        if type(records) ~= "table" then records = {} end
        local kept = {}
        for _, record in ipairs(records) do
            local same_mac = type(record) == "table" and tostring(record.mac or ""):upper() == mac
            local same_ssid = ssid == "" or tostring(record.ssid or "") == ssid
            if not (same_mac and same_ssid) then kept[#kept + 1] = record end
        end
        local temporary = wifi_reject_file .. ".luci"
        local output = io.open(temporary, "w")
        if not output then return false end
        output:write(require("luci.jsonc").stringify(kept), "\n")
        output:close()
        return os.rename(temporary, wifi_reject_file) and true or false
    end)
end

local function reconcile_wifi_reject_rows(uci)
    local enabled = uci:get("be6500_oem", "access", "enabled") ~= "0"
    local policy = uci:get("be6500_oem", "access", "policy") == "allow" and "allow" or "deny"
    local listed, guest_ssids = {}, {}
    uci:foreach("be6500_oem", "access", function(section)
        local mac = tostring(section.mac or ""):upper()
        if section.policy == policy and valid_mac(mac) then listed[mac] = true end
    end)
    uci:foreach("wireless", "wifi-iface", function(section)
        local networks = " " .. tostring(section.network or "") .. " "
        if networks:find(" guest ", 1, true) and section.ssid then
            guest_ssids[tostring(section.ssid)] = true
        end
    end)

    return with_wifi_reject_lock(function()
        local file = io.open(wifi_reject_file, "r")
        if not file then return true end
        local records = require("luci.jsonc").parse(file:read("*a") or "")
        file:close()
        if type(records) ~= "table" then records = {} end
        local kept = {}
        for _, record in ipairs(records) do
            if type(record) == "table" then
                local mac = tostring(record.mac or ""):upper()
                local guest = guest_ssids[tostring(record.ssid or "")] == true
                local still_rejected = guest or (enabled and valid_mac(mac)
                    and ((policy == "allow" and not listed[mac])
                        or (policy == "deny" and listed[mac])))
                if still_rejected then kept[#kept + 1] = record end
            end
        end
        if #kept == 0 then os.remove(wifi_reject_file); return true end
        local temporary = wifi_reject_file .. ".luci"
        local output = io.open(temporary, "w")
        if not output then return false end
        output:write(require("luci.jsonc").stringify(kept), "\n")
        output:close()
        return os.rename(temporary, wifi_reject_file) and true or false
    end)
end

local function fingerprint_identity(signature)
    signature = tostring(signature or ""):lower()
    if signature:find("221%(0017f2", 1, false) then
        return "Apple 设备", "Apple"
    end
    return nil, nil
end

local traffic_state_file = "/tmp/be6500-device-traffic-state"

-- nf_conntrack accounting is updated by the QSDK ECM/PPE fast path as well,
-- unlike ordinary FORWARD-chain counters which stop moving after a flow is
-- offloaded.  Convert its cumulative byte counters into per-device B/s.
local function device_traffic_rates(devices)
    local ip_to_mac, rates = {}, {}
    for _, device in ipairs(devices or {}) do
        local mac = tostring(device.uid or device.id or ""):upper()
        local ip = tostring(device.ip or "")
        if device.online == 1 and valid_mac(mac) and valid_ipv4(ip) then
            ip_to_mac[ip] = mac
            rates[mac] = { upload = 0, download = 0 }
        end
    end

    local current_flows = {}
    local conntrack = io.open("/proc/net/nf_conntrack", "r")
    if conntrack then
        for line in conntrack:lines() do
            local proto = line:match("^%S+%s+%d+%s+(%S+)") or "ip"
            local src1, dst1, sport1, dport1, bytes1, src2, dst2, sport2, dport2, bytes2 = line:match(
                "src=(%S+)%s+dst=(%S+)%s+sport=(%S+)%s+dport=(%S+).-bytes=(%d+).-src=(%S+)%s+dst=(%S+)%s+sport=(%S+)%s+dport=(%S+).-bytes=(%d+)"
            )
            local mac = src1 and ip_to_mac[src1] or nil
            if mac then
                local key = table.concat({ proto, src1, dst1, sport1, dport1 }, "|")
                current_flows[key] = { mac = mac, upload = tonumber(bytes1) or 0, download = tonumber(bytes2) or 0 }
            else
                mac = dst1 and ip_to_mac[dst1] or nil
                if mac then
                    local key = table.concat({ proto, src1, dst1, sport1, dport1 }, "|")
                    current_flows[key] = { mac = mac, upload = tonumber(bytes2) or 0, download = tonumber(bytes1) or 0 }
                end
            end
        end
        conntrack:close()
    end

    local previous, previous_epoch = {}, 0
    local input = io.open(traffic_state_file, "r")
    if input then
        previous_epoch = tonumber(input:read("*l")) or 0
        for line in input:lines() do
            local key, mac, upload, download = line:match("^([^\t]+)\t([^\t]+)\t(%d+)\t(%d+)$")
            if key and mac then previous[key] = { mac = mac, upload = tonumber(upload) or 0, download = tonumber(download) or 0 } end
        end
        input:close()
    end

    local now = os.time()
    local elapsed = now - previous_epoch
    if elapsed >= 1 and elapsed <= 30 then
        for key, current in pairs(current_flows) do
            local old = previous[key]
            local upload_delta, download_delta
            if old and old.mac == current.mac then
                upload_delta = current.upload - old.upload
                download_delta = current.download - old.download
                if upload_delta < 0 then upload_delta = current.upload end
                if download_delta < 0 then download_delta = current.download end
            else
                -- A flow not present at the last sample was created during the
                -- interval, so all bytes seen so far belong to this interval.
                upload_delta, download_delta = current.upload, current.download
            end
            local rate = rates[current.mac]
            if rate then
                rate.upload = rate.upload + math.max(0, math.floor(upload_delta / elapsed))
                rate.download = rate.download + math.max(0, math.floor(download_delta / elapsed))
            end
        end
    end

    local output = io.open(traffic_state_file .. ".new", "w")
    if output then
        output:write(tostring(now), "\n")
        for key, current in pairs(current_flows) do
            output:write(key, "\t", current.mac, "\t", tostring(current.upload), "\t", tostring(current.download), "\n")
        end
        output:close()
        os.rename(traffic_state_file .. ".new", traffic_state_file)
    end
    return rates
end

local function build_device_list(uci)
    local wireless = known_wireless_clients(uci)
    local online_macs, result, leases_by_mac, configured_names, hinted_names = {}, {}, {}, {}, {}
    local guest_ip = uci:get("network", "guest", "ipaddr") or "192.168.4.1"
    local guest_prefix = guest_ip:match("^(%d+%.%d+%.%d+)%.") or "192.168.4"
    local active_policy = uci:get("be6500_oem", "access", "policy") or "deny"
    local access_enabled = uci:get("be6500_oem", "access", "enabled") ~= "0"
    local active_entries = access_entries(uci, active_policy)
    local active_set = {}
    for _, item in ipairs(active_entries) do active_set[item.mac] = true end

    -- LuCI host hints merge DHCP, static-host and resolver information.  Keep
    -- this as a fallback behind the live DHCP lease hostname, and strip the
    -- local DNS suffix before presenting it as a device name.
    local hints = require("luci.jsonc").parse(luci.sys.exec(
        "ubus call luci-rpc getHostHints 2>/dev/null") or "") or {}
    for mac, hint in pairs(hints) do
        local name = type(hint) == "table" and trim(hint.name or "") or ""
        name = name:gsub("%.lan%.$", ""):gsub("%.lan$", "")
        if valid_mac(mac) and name ~= "" then hinted_names[mac:upper()] = name end
    end
    uci:foreach("dhcp", "host", function(section)
        local mac = type(section.mac) == "table" and section.mac[1] or section.mac
        local name = trim(section.name or "")
        if mac and valid_mac(mac) and name ~= "" then configured_names[tostring(mac):upper()] = name end
    end)

    local function usable_hostname(name)
        name = trim(name or "")
        if name == "" or name == "*" or name == "未知设备" then return nil end
        return name:gsub("%.lan%.$", ""):gsub("%.lan$", "")
    end

    local function generated_device_name(name, mac)
        name = trim(name or "")
        local suffix = tostring(mac or ""):gsub(":", ""):sub(-4)
        return name == "Apple 设备-" .. suffix
            or name == "小米设备-" .. suffix
            or name == "有线设备-" .. suffix
            or name:match("^.+ 无线设备%-" .. suffix .. "$") ~= nil
    end

    local function add(mac, ip, lease_name, online)
        mac = tostring(mac or ""):upper()
        if not valid_mac(mac) or online_macs[mac] then return end
        online_macs[mac] = true
        local section = oem_device_section(mac)
        local raw_saved_name = uci:get("be6500_oem", section, "name")
        local saved_name = generated_device_name(raw_saved_name, mac) and nil or usable_hostname(raw_saved_name)
        local display_name = saved_name or usable_hostname(lease_name)
            or usable_hostname(configured_names[mac]) or usable_hostname(hinted_names[mac]) or ""
        local device_type, vendor = device_identity(display_name, mac)
        local wifi = wireless[mac]
        if wifi then
            local fingerprint_type, fingerprint_vendor = fingerprint_identity(wifi.signature)
            if fingerprint_type then device_type = fingerprint_type end
            if fingerprint_vendor then vendor = fingerprint_vendor end
            if device_type == "其他设备" then device_type = "无线设备" end
        end
        if vendor == "暂未识别" and mac_is_private(mac) then
            vendor = "私有 MAC（厂商隐藏）"
        end
        if display_name == "" then
            local suffix = mac:gsub(":", ""):sub(-4)
            if vendor == "Apple" then
                display_name = "Apple 设备-" .. suffix
            elseif vendor:lower():find("xiaomi", 1, true) or vendor:find("小米", 1, true) then
                display_name = "小米设备-" .. suffix
            elseif wifi then
                display_name = wifi.band .. " 无线设备-" .. suffix
            else
                display_name = "有线设备-" .. suffix
            end
        end
        local qos_enable = uci:get("be6500_oem", section, "qos_enable") == "1"
        local net_enable = not access_enabled or (active_policy == "allow" and active_set[mac] or not active_set[mac])
        result[#result + 1] = {
            id = mac, uid = mac, ip = ip or "", name = display_name,
            device_type = device_type, vendor = vendor, brand = vendor,
            type = wifi and "Wi-Fi" or "wire", band = wifi and wifi.band or "",
            ssid = wifi and wifi.ssid or "", online = online and 1 or 0,
            is_guest = tostring(ip or ""):match("^" .. guest_prefix:gsub("%.", "%%.") .. "%.") and 1 or 0,
            is_remesh = 0, protect = 0, net_enable = net_enable and 1 or 0,
            qos_enable = qos_enable and 1 or 0,
            qos_upload = tonumber((uci:get("be6500_oem", section, "qos_upload"))) or 0,
            qos_download = tonumber((uci:get("be6500_oem", section, "qos_download"))) or 0,
            uplink = 0, downlink = 0, upload_speed = 0, download_speed = 0
        }
    end

    local leases = io.open("/tmp/dhcp.leases", "r")
    if leases then
        for line in leases:lines() do
            local _, mac, ip, hostname = line:match("^(%d+)%s+(%S+)%s+(%S+)%s+(%S+)")
            if mac and valid_mac(mac) then
                leases_by_mac[mac:upper()] = { ip = ip, name = hostname }
            end
        end
        leases:close()
    end

    -- An unexpired lease is not proof that a client is online.  Wireless
    -- association tables are authoritative for Wi-Fi stations.
    for mac in pairs(wireless) do
        local lease = leases_by_mac[mac] or {}
        add(mac, lease.ip or "", lease.name or "未知设备", true)
    end

    -- For wired clients only accept live NUD states.  STALE entries can remain
    -- for hours and, when this unit is connected behind another router, include
    -- that router's old clients; those must not be shown as locally connected.
    local neighbours = luci.sys.exec("ip neigh show 2>/dev/null") or ""
    for line in neighbours:gmatch("[^\n]+") do
        local ip, mac = line:match("^(%d+%.%d+%.%d+%.%d+).-lladdr%s+(%x%x:%x%x:%x%x:%x%x:%x%x:%x%x)")
        local live = line:match("%s(REACHABLE)%s*$") or line:match("%s(DELAY)%s*$")
            or line:match("%s(PROBE)%s*$") or line:match("%s(PERMANENT)%s*$")
            or line:match("%s(NOARP)%s*$")
        if ip and mac and live and not online_macs[mac:upper()] then
            local lease = leases_by_mac[mac:upper()] or {}
            add(mac, ip, lease.name or "未知设备", true)
        end
    end
    -- Keep an expired or inactive DHCP lease visible as an offline device.
    -- A lease says the router knows the client; it must not be presented as a
    -- live neighbour unless the association/NUD checks above proved it.
    for mac, lease in pairs(leases_by_mac) do
        if not online_macs[mac] then add(mac, lease.ip or "", lease.name or "未知设备", false) end
    end
    uci:foreach("dhcp", "host", function(section)
        local mac = type(section.mac) == "table" and section.mac[1] or section.mac
        if mac and not online_macs[tostring(mac):upper()] then add(mac, section.ip or "", section.name or "未知设备", false) end
    end)

    local rates = device_traffic_rates(result)
    for _, device in ipairs(result) do
        local rate = rates[tostring(device.uid or ""):upper()] or { upload = 0, download = 0 }
        device.uplink = rate.upload
        device.downlink = rate.download
        device.upload_speed = rate.upload
        device.download_speed = rate.download
    end
    table.sort(result, function(a, b)
        if a.online ~= b.online then return a.online > b.online end
        return (a.name or a.id) < (b.name or b.id)
    end)
    return result
end

local function firewall_reload()
    luci.sys.call("/etc/init.d/firewall reload >/dev/null 2>&1 &")
end

local function split_tabs(line)
    local values = {}
    line = tostring(line or ""):gsub("[\r\n]+$", "")
    for value in (line .. "\t"):gmatch("(.-)\t") do
        values[#values + 1] = value
    end
    return values
end

local function marked_command(command)
    local output = luci.sys.exec(command .. " 2>&1; printf '\n__BE6500_RC:%s' $?") or ""
    local code = tonumber(output:match("__BE6500_RC:(%d+)%s*$")) or 1
    output = trim(output:gsub("\n?__BE6500_RC:%d+%s*$", ""))
    return code, output
end

local function file_exists(path)
    local file = io.open(path, "r")
    if not file then return false end
    file:close()
    return true
end

-- The chassis is wired in reverse switch-port order: physical LAN1 is QCA8386
-- port 3, LAN2 is port 2 and LAN3 is port 1.
local iptv_ports = { lan1 = "3", lan2 = "2", lan3 = "1" }

local function read_sysfs_value(path)
    local file = io.open(path, "r")
    if not file then return "" end
    local value = trim(file:read("*l") or "")
    file:close()
    return value
end

local function switch_port_states()
    local raw = luci.sys.exec([[ubus call luci getSwconfigPortState '{"switch":"switch1"}' 2>/dev/null]]) or ""
    local decoded = require("luci.jsonc").parse(raw) or {}
    local values = decoded.result or decoded
    if type(values) == "table" and type(values[1]) == "table" and values[1].port == nil
        and type(values[1][1]) == "table" then values = values[1] end
    local states = {}
    for _, item in pairs(type(values) == "table" and values or {}) do
        local port = tonumber(item.port)
        if port then
            local linked = item.link == true or tonumber(item.link) == 1 or item.link == "up"
            local full_duplex = item.duplex == true or tonumber(item.duplex) == 1 or item.duplex == "full"
            states[port] = {
                link = linked and 1 or 0,
                speed = tonumber(item.speed) or 0,
                duplex = full_duplex and 1 or 0,
                rx_bytes = tonumber(item.rx_bytes) or 0,
                tx_bytes = tonumber(item.tx_bytes) or 0
            }
        end
    end
    return states
end

local function configured_port_role(uci, name)
    local enabled = uci:get("network", "iptv", "be6500_enabled") == "1"
    if enabled and uci:get("network", "iptv", "be6500_access_mode") == "lan"
        and uci:get("network", "iptv", "be6500_source_port") == name then
        return "iptv_source"
    end
    if enabled and uci:get("network", "iptv", "be6500_stb_port") == name then
        return "iptv_stb"
    end
    if uci:get("be6500_oem", "game", "enable") == "1"
        and uci:get("be6500_oem", "game", "port") == name then
        return "game"
    end
    return "lan"
end

local function port_settings_payload(uci)
    local switch_states = switch_port_states()
    local ports = {
        {
            id = "wan", name = "WAN", switch_port = "独立", role = "wan",
            link = read_sysfs_value("/sys/class/net/eth0/carrier") == "1" and 1 or 0,
            speed = tonumber(read_sysfs_value("/sys/class/net/eth0/speed")) or 0,
            duplex = read_sysfs_value("/sys/class/net/eth0/duplex"):lower() == "full" and 1 or 0
        }
    }
    for _, name in ipairs({ "lan1", "lan2", "lan3" }) do
        local number = tonumber(iptv_ports[name])
        local state = switch_states[number] or {}
        local role = configured_port_role(uci, name)
        ports[#ports + 1] = {
            id = name, name = name:upper(), switch_port = number, role = role,
            link = tonumber(state.link) or 0, speed = tonumber(state.speed) or 0,
            duplex = tonumber(state.duplex) or 0,
            rx_bytes = tonumber(state.rx_bytes) or 0, tx_bytes = tonumber(state.tx_bytes) or 0
        }
    end
    return { status = 0, ports = ports }
end

local function configure_iptv_switch(uci, source_port, stb_port)
    local stale, lan_vlan = {}, nil
    uci:foreach("network", "switch_vlan", function(section)
        if section.device == "switch1" and section.vlan == "1" then lan_vlan = section[".name"] end
        if section.be6500_role == "iptv_source" or section.be6500_role == "iptv_stb" then
            stale[#stale + 1] = section[".name"]
        end
    end)
    for _, section in ipairs(stale) do uci:delete("network", section) end
    local excluded = {}
    if iptv_ports[source_port] then excluded[iptv_ports[source_port]] = true end
    if iptv_ports[stb_port] then excluded[iptv_ports[stb_port]] = true end
    if lan_vlan then
        local ports = {}
        for _, port in ipairs({ "1", "2", "3" }) do if not excluded[port] then ports[#ports + 1] = port end end
        -- The working LAN datapath bridges raw eth1, so VLAN 1 uses an
        -- untagged CPU member. IPTV-only VLANs below remain tagged on CPU 0.
        ports[#ports + 1] = "0"
        uci:set("network", lan_vlan, "ports", table.concat(ports, " "))
    end
    if iptv_ports[source_port] then
        uci:section("network", "switch_vlan", nil, {
            device = "switch1", vlan = "4094", ports = iptv_ports[source_port] .. " 0t", be6500_role = "iptv_source"
        })
    end
    if iptv_ports[stb_port] then
        uci:section("network", "switch_vlan", nil, {
            device = "switch1", vlan = "4093", ports = iptv_ports[stb_port] .. " 0t", be6500_role = "iptv_stb"
        })
    end
end

local function ensure_iptv_firewall(uci, enabled)
    if enabled then
        ensure_firewall_zone(uci, "iptv", "iptv")
        if not uci:get("firewall", "be6500_lan_iptv") then
            uci:section("firewall", "forwarding", "be6500_lan_iptv", { src = "lan", dest = "iptv" })
        end
        if not uci:get("firewall", "be6500_iptv_igmp") then
            uci:section("firewall", "rule", "be6500_iptv_igmp", {
                name = "BE6500-Allow-IPTV-IGMP", src = "iptv", proto = "igmp", target = "ACCEPT"
            })
        end
    else
        uci:delete("firewall", "be6500_lan_iptv")
        uci:delete("firewall", "be6500_iptv_igmp")
        local stale = {}
        uci:foreach("firewall", "zone", function(section)
            if section.name == "iptv" then stale[#stale + 1] = section[".name"] end
        end)
        for _, section in ipairs(stale) do uci:delete("firewall", section) end
    end
end

local function active_wds_iface(uci)
    local found
    uci:foreach("wireless", "wifi-iface", function(section)
        if section.mode == "sta" and section.be6500_role == "wds" and section.disabled ~= "1" then
            found = section
            return false
        end
    end)
    return found
end

local function wan_link_ifname(uci)
    local vlan_mode = uci:get("network", "wan", "be6500_vlan_mode") or "untagged"
    local vlan_id = tonumber((uci:get("network", "wan", "be6500_vlan_id"))) or 0
    if vlan_mode == "tagged" and vlan_id >= 1 and vlan_id <= 4094 then
        return "eth0." .. tostring(vlan_id)
    end
    return "eth0"
end

local function ensure_wan_firewall_members(uci)
    local zone
    uci:foreach("firewall", "zone", function(section)
        if section.name == "wan" then zone = section[".name"]; return false end
    end)
    if not zone then
        zone = uci:section("firewall", "zone", nil, {
            name = "wan", input = "REJECT", output = "ACCEPT", forward = "REJECT", masq = "1", mtu_fix = "1"
        })
    end
    local members, seen = {}, {}
    local current = uci:get_list("firewall", zone, "network") or {}
    if type(current) ~= "table" then current = split_words(current) end
    for _, name in ipairs(current) do
        if name ~= "" and not seen[name] then members[#members + 1] = name; seen[name] = true end
    end
    for _, name in ipairs({ "wan", "wan6", "wwan", "wwan6" }) do
        if not seen[name] then members[#members + 1] = name; seen[name] = true end
    end
    set_uci_list(uci, "firewall", zone, "network", members)
    uci:set("firewall", zone, "masq", "1")
    uci:set("firewall", zone, "mtu_fix", "1")
    if uci:get("firewall", zone, "be6500_expose") == "1" then
        uci:set("firewall", zone, "input", "ACCEPT")
        uci:set("firewall", zone, "forward", "ACCEPT")
    end
end

local function sync_wan6_parent(uci, proto)
    if not uci:get("network", "wan6") then uci:section("network", "interface", "wan6", {}) end
    -- Follow the logical WAN so DHCPv6 keeps working after DHCP, PPPoE or
    -- tagged-WAN changes.
    uci:set("network", "wan6", "device", "@wan")
    uci:delete("network", "wan6", "ifname")
    uci:set("network", "wan6", "proto", "dhcpv6")
    uci:set("network", "wan6", "reqaddress", "try")
    uci:set("network", "wan6", "reqprefix", "auto")
    uci:set("network", "wan6", "delegate", "1")
    uci:set("network", "wan6", "disabled", "0")
    uci:set("network", "wan6", "auto", "1")
    uci:set("network", "wan6", "metric", "10")
    uci:set("network", "wan", "ipv6", "auto")
    uci:set("network", "wan", "delegate", "1")
    if not uci:get("network", "lan", "ip6assign") then uci:set("network", "lan", "ip6assign", "60") end

    -- Native DHCPv6-PD must be advertised to LAN clients as well.  Older
    -- initramfs defaults leave DHCPv6 disabled, which makes IPv6 appear on
    -- the router while clients receive no usable IPv6 configuration.
    if not uci:get("dhcp", "lan") then uci:section("dhcp", "dhcp", "lan", { interface = "lan" }) end
    uci:set("dhcp", "lan", "ra", "server")
    uci:set("dhcp", "lan", "dhcpv6", "server")
    uci:set("dhcp", "lan", "ra_slaac", "1")
    uci:delete("dhcp", "lan", "ndp")
end

local function disable_wds_config(uci)
    local changed = false
    uci:foreach("wireless", "wifi-iface", function(section)
        if section.mode == "sta" and section.be6500_role == "wds" and section.disabled ~= "1" then
            uci:set("wireless", section[".name"], "disabled", "1")
            changed = true
        end
    end)
    return changed
end

local function ensure_wwan_interfaces(uci)
    if not uci:get("network", "wwan") then uci:section("network", "interface", "wwan", {}) end
    uci:set("network", "wwan", "proto", "dhcp")
    uci:set("network", "wwan", "auto", "1")
    uci:set("network", "wwan", "defaultroute", "1")
    uci:set("network", "wwan", "delegate", "1")
    uci:delete("network", "wwan", "dns")
    uci:delete("network", "wwan", "peerdns")

    if not uci:get("network", "wwan6") then uci:section("network", "interface", "wwan6", {}) end
    uci:set("network", "wwan6", "proto", "dhcpv6")
    uci:set("network", "wwan6", "auto", uci:get("network", "wwan6", "disabled") == "1" and "0" or "1")
    uci:set("network", "wwan6", "reqaddress", "try")
    uci:set("network", "wwan6", "reqprefix", "auto")
    uci:set("network", "wwan6", "delegate", "1")
    if uci:get("network", "wwan6", "disabled") == nil then uci:set("network", "wwan6", "disabled", "0") end
    if uci:get("network", "wwan6", "peerdns") == nil then uci:set("network", "wwan6", "peerdns", "1") end
end

local function physical_wan_has_carrier()
    local file = io.open("/sys/class/net/eth0/carrier", "r")
    if not file then return true end
    local carrier = trim(file:read("*l") or "")
    file:close()
    return carrier == "1"
end

local function extended_jdcapi(method, args, uci)
    local status = { status = 0 }
    if method == "get_wan_info" then
        local active_wds = active_wds_iface(uci)
        local runtime_name = active_wds and "wwan" or "wan"
        local runtime = ubus_interface(runtime_name)
        local ipaddr, netmask = first_ipv4(runtime)
        local runtime_dns = string_list(runtime["dns-server"])
        local configured_dns = uci:get_list("network", "wan", "dns") or {}
        if type(configured_dns) ~= "table" then configured_dns = string_list(configured_dns) end
        local custom_dns = not active_wds and uci:get("network", "wan", "peerdns") == "0"
        local display_dns = runtime_dns
        if #display_dns == 0 and custom_dns then display_dns = configured_dns end
        local proto = active_wds and "wds" or (uci:get("network", "wan", "proto") or "dhcp")
        local link_up = runtime.up and (active_wds ~= nil or physical_wan_has_carrier())
        local gateway = first_gateway(runtime, 4)
        local mtu = tonumber((uci:get("network", active_wds and "wwan" or "wan", "mtu"))) or (proto == "pppoe" and 1492 or 1500)
        if proto == "pppoe" and mtu > 1492 then mtu = 1492 end
        local detail = {
            ipaddr = ipaddr, netmask = netmask, gateway = gateway, mtu = mtu,
            dns_enabled = custom_dns and 1 or 0,
            dns1 = display_dns[1] or "", dns2 = display_dns[2] or ""
        }
        return true, {
            status = 0, proto = proto, up = link_up and 1 or 0, connected = link_up and 1 or 0,
            ipaddr = ipaddr, netmask = netmask,
            gateway = gateway, mtu = mtu,
            config_ipaddr = uci:get("network", "wan", "ipaddr") or "",
            config_netmask = uci:get("network", "wan", "netmask") or "",
            config_gateway = uci:get("network", "wan", "gateway") or "",
            username = uci:get("network", "wan", "username") or "", password = uci:get("network", "wan", "password") or "",
            dns_enabled = custom_dns and 1 or 0,
            dns1 = custom_dns and (configured_dns[1] or "") or "", dns2 = custom_dns and (configured_dns[2] or "") or "",
            runtime_dns1 = display_dns[1] or "", runtime_dns2 = display_dns[2] or "",
            mwan_status = 0, mwm_pppoe_switch = 0, mwm_pppoe_amount = 1, mwm_pppoe_parallel = 1, mwan_pppoe_max = 1,
            vlan_mode = uci:get("network", "wan", "be6500_vlan_mode") or "untagged",
            vlan_id = tonumber((uci:get("network", "wan", "be6500_vlan_id"))) or 0,
            wds_info = { ipaddr = active_wds and ipaddr or "", netmask = netmask, gateway = gateway,
                dns1 = display_dns[1] or "", dns2 = display_dns[2] or "", ssid = active_wds and active_wds.ssid or "" },
            dhcp_info = detail, pppoe_info = detail, static_info = detail
        }
    elseif method == "set_wan_dhcp" or method == "set_wan_pppoe" or method == "set_wan_static" then
        local proto = method == "set_wan_dhcp" and "dhcp" or method == "set_wan_pppoe" and "pppoe" or "static"
        local wds_changed = disable_wds_config(uci)
        if proto == "static" then
            if not valid_ipv4(args.ipaddr) then return true, { status = 11, message = "IP 地址格式不正确" } end
            if not valid_netmask(args.netmask) then return true, { status = 12, message = "子网掩码格式不正确" } end
            if not valid_ipv4(args.gateway) then return true, { status = 13, message = "默认网关格式不正确" } end
            if args.ipaddr == args.gateway then return true, { status = 16, message = "IP 地址不能与默认网关相同" } end
            if not same_ipv4_subnet(args.ipaddr, args.gateway, args.netmask) then
                return true, { status = 17, message = "IP 地址与默认网关不在同一网段" }
            end
            local lan_ip = uci:get("network", "lan", "ipaddr") or ""
            local lan_mask = uci:get("network", "lan", "netmask") or "255.255.255.0"
            if ipv4_subnets_overlap(args.ipaddr, args.netmask, lan_ip, lan_mask) then
                return true, { status = 18, message = "WAN 静态 IP 不能与局域网处于重叠网段" }
            end
        end
        uci:set("network", "wan", "proto", proto)
        uci:set("network", "wan", "auto", "1")
        uci:set("network", "wan", "defaultroute", "1")
        uci:set("network", "wan", "delegate", "1")
        uci:set("network", "wan", "metric", "10")
        if args.vlan_id ~= nil then
            local vlan_text = trim(args.vlan_id)
            local vlan_id = tonumber(vlan_text) or 0
            local vlan_mode = vlan_text ~= "" and "tagged" or "untagged"
            if vlan_mode == "tagged" and (vlan_id < 1 or vlan_id > 4094 or vlan_id ~= math.floor(vlan_id)) then return true, { status = 1, message = "WAN VLAN ID 必须为 1–4094" } end
            if vlan_mode == "tagged" and uci:get("network", "iptv", "be6500_enabled") == "1"
                and uci:get("network", "iptv", "be6500_vlan_mode") == "tagged"
                and tonumber((uci:get("network", "iptv", "be6500_vlan_id"))) == vlan_id then
                return true, { status = 1, message = "互联网 VLAN ID 不能与 IPTV VLAN ID 相同" }
            end
            uci:set("network", "wan", "be6500_vlan_mode", vlan_mode)
            if vlan_mode == "tagged" then uci:set("network", "wan", "be6500_vlan_id", tostring(vlan_id))
            else uci:delete("network", "wan", "be6500_vlan_id") end
        end
        -- netifd in 24.10 binds an interface through the `device` option.
        -- Keeping only the legacy `ifname` value can leave PPPoE attached to
        -- an old bridge/DSA alias after switching the uplink mode.  Always
        -- restore the BE6500 production WAN mapping when saving Internet
        -- settings, including configurations created by older builds.
        uci:set("network", "wan", "device", wan_link_ifname(uci))
        uci:delete("network", "wan", "ifname")
        if proto == "pppoe" then
            if clean(args.username, 128) == "" then return true, { status = 1 } end
            uci:set("network", "wan", "username", clean(args.username, 128))
            local password = clean(args.password, 128)
            if password ~= "" or not uci:get("network", "wan", "password") then uci:set("network", "wan", "password", password) end
            -- Do not apply the PPP payload MTU to the Ethernet parent.  The
            -- pppoe plugin negotiates 1492 by default while eth0 must remain
            -- at least 1500 for discovery/session control traffic.
            uci:delete("network", "wan", "mtu")
            uci:set("network", "wan", "keepalive", "0 1")
            uci:delete("network", "wan", "ipaddr"); uci:delete("network", "wan", "netmask"); uci:delete("network", "wan", "gateway")
        elseif proto == "static" then
            uci:set("network", "wan", "ipaddr", args.ipaddr); uci:set("network", "wan", "netmask", args.netmask); uci:set("network", "wan", "gateway", args.gateway)
            uci:set("network", "wan", "mtu", "1500")
            uci:delete("network", "wan", "keepalive")
        else
            uci:delete("network", "wan", "ipaddr"); uci:delete("network", "wan", "netmask"); uci:delete("network", "wan", "gateway")
            uci:set("network", "wan", "mtu", "1500")
            uci:delete("network", "wan", "keepalive")
        end
        local custom_dns
        if args.dns_enabled ~= nil then custom_dns = tonumber(args.dns_enabled) == 1
        else custom_dns = trim(args.dns1) ~= "" or trim(args.dns2) ~= "" end
        if proto == "static" then custom_dns = true end
        local dns = {}
        if custom_dns then
            if not valid_ipv4(args.dns1) then return true, { status = 14, message = "首选 DNS 不能为空且必须是正确的 IPv4 地址" } end
            dns[#dns + 1] = trim(args.dns1)
            if trim(args.dns2) ~= "" then
                if not valid_ipv4(args.dns2) then return true, { status = 15, message = "备用 DNS 格式不正确" } end
                dns[#dns + 1] = trim(args.dns2)
            end
        end
        set_uci_list(uci, "network", "wan", "dns", dns)
        if custom_dns then uci:set("network", "wan", "peerdns", "0") else uci:delete("network", "wan", "peerdns") end
        sync_wan6_parent(uci, proto)
        uci:set("network", "wan6", "auto", uci:get("network", "wan6", "disabled") == "1" and "0" or "1")
        ensure_wan_firewall_members(uci)
        uci:commit("network"); uci:commit("wireless"); uci:commit("firewall"); uci:commit("dhcp")
        local radio_reload = wds_changed and "wifi reload >/dev/null 2>&1; " or ""
        luci.sys.call("(ifdown wwan6 >/dev/null 2>&1; ifdown wwan >/dev/null 2>&1; " .. radio_reload ..
            "/etc/init.d/firewall reload >/dev/null 2>&1; /etc/init.d/odhcpd restart >/dev/null 2>&1; ifdown wan6 >/dev/null 2>&1; ifdown wan >/dev/null 2>&1; ifup wan >/dev/null 2>&1; sleep 2; ifup wan6 >/dev/null 2>&1) >/tmp/be6500-wan-connect.log 2>&1 &")
        return true, status
    elseif method == "get_wan6_info" then
        local active_wds = active_wds_iface(uci) ~= nil
        local runtime = ubus_interface(active_wds and "wwan6" or "wan6")
        if not active_wds and not runtime.up then
            local dynamic = ubus_interface("wan_6")
            if dynamic.up then runtime = dynamic end
        end
        local ipv6 = runtime["ipv6-address"] or {}
        local address = ipv6[1] or {}
        local delegated = (runtime["ipv6-prefix"] or {})[1] or {}
        local lan_runtime = ubus_interface("lan")
        local lan_address = {}
        for _, candidate in ipairs(lan_runtime["ipv6-address"] or {}) do
            local value = tostring(candidate.address or ""):lower()
            if value ~= "" and not value:match("^fe[89ab]") and not value:match("^fd") and not value:match("^fc") then
                lan_address = candidate
                break
            elseif not lan_address.address then
                lan_address = candidate
            end
        end
        local prefix = delegated.address and (delegated.address .. "/" .. tostring(delegated.mask or 0)) or ""
        return true, { status = 0, up = runtime.up and 1 or 0, ipaddr = address.address or "", prefix = prefix,
            delegated_prefix = prefix, lan_ipaddr = lan_address.address or "",
            gateway = first_gateway(runtime, 6), dns = string_list(runtime["dns-server"]) }
    elseif method == "web_get_ipv6_config" then
        local target = active_wds_iface(uci) and "wwan6" or "wan6"
        local dns = uci:get_list("network", target, "dns") or {}
        local ipv6_type = uci:get("network", target, "be6500_type") or "native"
        return true, { status = 0, enabled = uci:get("network", target, "disabled") == "1" and 0 or 1,
            type = ipv6_type, fw_enable = tonumber((uci:get("network", target, "be6500_fw_enable"))) or 1,
            dns_enabled = uci:get("network", target, "peerdns") == "0" and 1 or 0,
            dns1 = dns[1] or "", dns2 = dns[2] or "", wan_ipaddr = uci:get("network", target, "ip6addr") or "",
            wan_gateway = uci:get("network", target, "ip6gw") or "", lan_prefix = uci:get("network", "lan", "ip6prefix") or "",
            prefix_len = tonumber((uci:get("network", "lan", "ip6assign"))) or 60 }
    elseif method:match("^web_set_ipv6_") then
        local ipv6_type = ({ web_set_ipv6_native = "native", web_set_ipv6_onlyrouter = "onlyrouter", web_set_ipv6_relay = "relay",
            web_set_ipv6_nat6 = "nat6", web_set_ipv6_static = "static", web_set_ipv6_dhcpv6 = "dhcpv6", web_set_ipv6_slacc = "slacc" })[method] or "native"
        local target = active_wds_iface(uci) and "wwan6" or "wan6"
        if not uci:get("network", target) then uci:section("network", "interface", target, {}) end
        if target == "wan6" then sync_wan6_parent(uci, uci:get("network", "wan", "proto") or "dhcp") end
        local ipv6_enabled = tonumber(args.enabled) == 1
        uci:set("network", target, "disabled", ipv6_enabled and "0" or "1")
        uci:set("network", target, "auto", ipv6_enabled and "1" or "0")
        uci:set("network", target, "be6500_type", ipv6_type); uci:set("network", target, "be6500_fw_enable", tonumber(args.fw_enable) == 1 and "1" or "0")
        uci:set("network", target, "proto", ipv6_type == "static" and "static" or "dhcpv6")
        local custom_dns6 = ipv6_enabled and tonumber(args.dns_enabled) == 1
        local dns6 = {}
        if custom_dns6 then
            if not valid_ipv6(args.dns1, false) then return true, { status = 14, message = "首选 IPv6 DNS 不能为空且格式必须正确" } end
            dns6[#dns6 + 1] = trim(args.dns1)
            if trim(args.dns2) ~= "" then
                if not valid_ipv6(args.dns2, false) then return true, { status = 15, message = "备用 IPv6 DNS 格式不正确" } end
                dns6[#dns6 + 1] = trim(args.dns2)
            end
            set_uci_list(uci, "network", target, "dns", dns6)
            uci:set("network", target, "peerdns", "0")
        else
            uci:delete("network", target, "dns")
            uci:delete("network", target, "peerdns")
        end
        if ipv6_type == "static" and ipv6_enabled then
            if not valid_ipv6(args.wan_ipaddr, true) then return true, { status = 11, message = "WAN IPv6 地址格式不正确" } end
            if not valid_ipv6(args.wan_gateway, false) then return true, { status = 13, message = "IPv6 网关格式不正确" } end
            if not valid_ipv6(args.lan_prefix, true) then return true, { status = 12, message = "LAN IPv6 前缀格式不正确" } end
            uci:set("network", target, "ip6addr", clean(args.wan_ipaddr, 80)); uci:set("network", target, "ip6gw", clean(args.wan_gateway, 80))
            uci:set("network", "lan", "ip6prefix", clean(args.lan_prefix, 80)); uci:set("network", "lan", "ip6assign", tostring(tonumber(args.lan_prefix_len) or 60))
        elseif ipv6_type ~= "static" then
            uci:delete("network", target, "ip6addr"); uci:delete("network", target, "ip6gw")
            uci:delete("network", "lan", "ip6prefix")
        end
        if not uci:get("dhcp", "lan") then uci:section("dhcp", "dhcp", "lan", { interface = "lan" }) end
        if not ipv6_enabled or ipv6_type == "onlyrouter" then
            uci:set("dhcp", "lan", "ra", "disabled"); uci:set("dhcp", "lan", "dhcpv6", "disabled"); uci:delete("dhcp", "lan", "ndp")
        elseif ipv6_type == "relay" then
            uci:set("dhcp", "lan", "ra", "relay"); uci:set("dhcp", "lan", "dhcpv6", "relay"); uci:set("dhcp", "lan", "ndp", "relay")
        else
            uci:set("dhcp", "lan", "ra", "server"); uci:set("dhcp", "lan", "dhcpv6", "server"); uci:set("dhcp", "lan", "ra_slaac", "1"); uci:delete("dhcp", "lan", "ndp")
        end
        uci:commit("network"); uci:commit("dhcp")
        if ipv6_enabled then luci.sys.call("(/etc/init.d/odhcpd restart; ifdown " .. target .. " >/dev/null 2>&1; ifup " .. target .. " >/dev/null 2>&1) &")
        else luci.sys.call("(/etc/init.d/odhcpd restart; ifdown " .. target .. " >/dev/null 2>&1) &") end
        return true, status
    elseif method == "get_pppd_error_code" then return true, { status = 0, error_code = 0 }
    elseif method == "get_wire_dhcp_status" or method == "get_wan_connection_status" then
        local runtime = ubus_interface("wan")
        return true, { status = 0, connected = runtime.up and physical_wan_has_carrier() and 1 or 0 }
    elseif method == "get_router_wan_ifname" then return true, { status = 0, ifname = uci:get("network", "wan", "device") or "eth0" }
    elseif method == "set_router_wan_ifname" then
        local ifname = clean(args.ifname, 16)
        if ifname ~= "eth0" then return true, { status = 1, message = "当前交换机布局仅支持 eth0 作为 WAN" } end
        uci:set("network", "wan", "device", ifname); uci:delete("network", "wan", "ifname"); uci:commit("network"); return true, status
    elseif method == "get_port_settings" then
        return true, port_settings_payload(uci)
    elseif method == "get_iptv_info" then
        local runtime = ubus_interface("iptv")
        local source_port = uci:get("network", "iptv", "be6500_source_port") or "lan1"
        local listen = tonumber((uci:get("udpxy", "main", "port"))) or 4022
        return true, {
            status = 0,
            enable = uci:get("network", "iptv", "be6500_enabled") == "1" and 1 or 0,
            access_mode = uci:get("network", "iptv", "be6500_access_mode") or "vlan",
            vlan_id = tonumber((uci:get("network", "iptv", "be6500_vlan_id"))) or 4000,
            vlan_priority = tonumber((uci:get("network", "iptv", "be6500_vlan_priority"))) or 0,
            source_port = source_port,
            stb_port = uci:get("network", "iptv", "be6500_stb_port") or "none",
            auth_enable = uci:get("be6500_oem", "iptv", "auth_enable") == "1" and 1 or 0,
            auth_mac = uci:get("be6500_oem", "iptv", "mac") or "",
            option12 = uci:get("be6500_oem", "iptv", "option12") or "",
            option60 = uci:get("be6500_oem", "iptv", "option60") or "",
            capture_port = uci:get("be6500_oem", "iptv", "capture_port") or source_port,
            udpxy_enable = uci:get("udpxy", "main", "disabled") == "0" and 1 or 0,
            udpxy_port = listen,
            udpxy_installed = (file_exists("/usr/bin/udpxy") or file_exists("/usr/sbin/udpxy")) and 1 or 0,
            relay_url = "http://" .. (uci:get("network", "lan", "ipaddr") or "192.168.1.1") .. ":" .. tostring(listen) .. "/udp/组播地址",
            ifname = uci:get("network", "iptv", "ifname") or "",
            up = runtime.up and 1 or 0,
            ipaddr = first_ipv4(runtime)
            ,metric = tonumber(uci:get("network", "iptv", "metric")) or ((tonumber(uci:get("network", "wan", "metric")) or 10) + 10)
        }
    elseif method == "set_iptv_info" then
        local enabled = tonumber(args.enable) == 1
        local access_mode = args.access_mode == "lan" and "lan" or "vlan"
        local vlan_id = tonumber(args.vlan_id) or 0
        local vlan_priority = tonumber(args.vlan_priority) or 0
        local source_port = iptv_ports[args.source_port] and args.source_port or "lan1"
        local stb_port = args.stb_port == "none" and "none" or (iptv_ports[args.stb_port] and args.stb_port or "none")
        local auth_enable = tonumber(args.auth_enable) == 1
        local auth_mac = tostring(args.auth_mac or ""):upper()
        local option12 = clean(args.option12, 255)
        local option60 = clean(args.option60, 510):gsub("%s+", "")
        local udpxy_enable = tonumber(args.udpxy_enable) == 1
        local udpxy_port = tonumber(args.udpxy_port) or 4022
        if enabled and access_mode == "vlan" and (vlan_id < 1 or vlan_id > 4094) then return true, { status = 1, message = "IPTV VLAN ID 必须为 1–4094" } end
        if vlan_priority < 0 or vlan_priority > 7 or vlan_priority % 1 ~= 0 then return true, { status = 1, message = "IPTV VLAN 优先级必须为 0–7" } end
        if enabled and access_mode == "vlan" and uci:get("network", "wan", "be6500_vlan_mode") == "tagged"
            and tonumber((uci:get("network", "wan", "be6500_vlan_id"))) == vlan_id then
            return true, { status = 1, message = "IPTV VLAN ID 不能与互联网 VLAN ID 相同" }
        end
        if enabled and access_mode == "lan" and stb_port ~= "none" and source_port == stb_port then
            return true, { status = 1, message = "IPTV 上联口不能同时作为机顶盒输出口" }
        end
        if enabled and stb_port ~= "none" and uci:get("be6500_oem", "game", "enable") == "1"
            and uci:get("be6500_oem", "game", "port") == stb_port then
            return true, { status = 1, message = stb_port:upper() .. " 已设为游戏口，请先关闭游戏口或选择其他 IPTV 端口" }
        end
        if auth_enable and (not enabled or not valid_mac(auth_mac)) then return true, { status = 1, message = "请先开启 IPTV 并填写正确的机顶盒 MAC 地址" } end
        if auth_enable and stb_port ~= "none" then return true, { status = 1, message = "启用身份模拟时，机顶盒端口绑定必须设为不绑定" } end
        if option60 ~= "" and (not option60:match("^%x+$") or #option60 % 2 ~= 0) then return true, { status = 1, message = "Option 60 必须是偶数位十六进制字节" } end
        if udpxy_port < 1 or udpxy_port > 65535 then return true, { status = 1, message = "udpxy 监听端口无效" } end
        if not uci:get("be6500_oem", "iptv") then uci:section("be6500_oem", "settings", "iptv", {}) end
        configure_iptv_switch(uci, enabled and access_mode == "lan" and source_port or nil, enabled and stb_port ~= "none" and stb_port or nil)
        if not enabled then
            uci:delete("network", "iptv")
            uci:delete("network", "iptv_mcast")
            if not uci:get("udpxy", "main") then uci:section("udpxy", "udpxy", "main", {}) end
            uci:set("udpxy", "main", "disabled", "1")
            uci:set("udpxy", "main", "status", "0")
            uci:foreach("network", "device", function(section)
                if section.name == "br-lan" then uci:set("network", section[".name"], "igmp_snooping", "0") end
            end)
            ensure_iptv_firewall(uci, false)
            uci:commit("network"); uci:commit("firewall"); uci:commit("udpxy"); uci:commit("be6500_oem")
            luci.sys.call("/etc/init.d/udpxy stop >/dev/null 2>&1; ubus call network reload >/dev/null 2>&1; /etc/init.d/firewall reload >/dev/null 2>&1 &")
            return true, { status = 0, message = "IPTV 已关闭，接口、组播与防火墙配置已撤销" }
        end
        if not uci:get("network", "iptv") then uci:section("network", "interface", "iptv", {}) end
        local source_ifname = access_mode == "lan" and "eth1.4094" or ("eth0." .. tostring(vlan_id))
        local ifnames = { source_ifname }
        if stb_port ~= "none" then ifnames[#ifnames + 1] = "eth1.4093" end
        uci:set("network", "iptv", "ifname", table.concat(ifnames, " "))
        if #ifnames > 1 then uci:set("network", "iptv", "type", "bridge") else uci:delete("network", "iptv", "type") end
        local wan_metric = tonumber(uci:get("network", "wan", "metric")) or 10
        local iptv_metric = wan_metric + 10
        uci:set("network", "iptv", "defaultroute", "0"); uci:set("network", "iptv", "peerdns", "0")
        -- IPTV always receives a deterministic higher metric than the main
        -- WAN. This prevents DHCP/authentication replies from installing a
        -- competing preferred gateway while keeping multicast routes usable.
        uci:set("network", "iptv", "metric", tostring(iptv_metric))
        uci:set("network", "iptv", "auto", enabled and "1" or "0")
        uci:set("network", "iptv", "be6500_enabled", enabled and "1" or "0")
        uci:set("network", "iptv", "be6500_access_mode", access_mode)
        uci:set("network", "iptv", "be6500_vlan_id", tostring(vlan_id))
        uci:set("network", "iptv", "be6500_vlan_priority", tostring(vlan_priority))
        uci:set("network", "iptv", "be6500_source_port", source_port)
        uci:set("network", "iptv", "be6500_stb_port", stb_port)
        if auth_enable then
            uci:set("network", "iptv", "proto", "dhcp"); uci:set("network", "iptv", "broadcast", "1")
            uci:set("network", "iptv", "macaddr", auth_mac)
            if option12 ~= "" then uci:set("network", "iptv", "hostname", option12) else uci:delete("network", "iptv", "hostname") end
            set_uci_list(uci, "network", "iptv", "sendopts", option60 ~= "" and { "0x3c:" .. option60 } or {})
            uci:delete("network", "iptv", "ipaddr"); uci:delete("network", "iptv", "netmask")
        else
            uci:set("network", "iptv", "proto", "static"); uci:set("network", "iptv", "ipaddr", "10.255.255.2"); uci:set("network", "iptv", "netmask", "255.255.255.0")
            uci:delete("network", "iptv", "broadcast"); uci:delete("network", "iptv", "macaddr"); uci:delete("network", "iptv", "hostname"); uci:delete("network", "iptv", "sendopts")
        end
        if enabled then
            if not uci:get("network", "iptv_mcast") then uci:section("network", "route", "iptv_mcast", {}) end
            uci:set("network", "iptv_mcast", "interface", "iptv"); uci:set("network", "iptv_mcast", "target", "224.0.0.0"); uci:set("network", "iptv_mcast", "netmask", "240.0.0.0"); uci:set("network", "iptv_mcast", "metric", tostring(iptv_metric))
        else uci:delete("network", "iptv_mcast") end
        uci:set("be6500_oem", "iptv", "auth_enable", auth_enable and "1" or "0")
        uci:set("be6500_oem", "iptv", "mac", auth_mac); uci:set("be6500_oem", "iptv", "option12", option12); uci:set("be6500_oem", "iptv", "option60", option60)
        uci:set("be6500_oem", "iptv", "capture_port", iptv_ports[args.capture_port] and args.capture_port or source_port)
        if not uci:get("udpxy", "main") then uci:section("udpxy", "udpxy", "main", {}) end
        uci:set("udpxy", "main", "disabled", udpxy_enable and "0" or "1"); uci:set("udpxy", "main", "status", udpxy_enable and "1" or "0")
        uci:set("udpxy", "main", "respawn", "1"); uci:set("udpxy", "main", "port", tostring(udpxy_port)); uci:set("udpxy", "main", "bind", "br-lan")
        uci:set("udpxy", "main", "source", #ifnames > 1 and "br-iptv" or source_ifname)
        -- IPTV multicast must be constrained at the LAN bridge.  Locate the
        -- bridge by name instead of assuming a generated UCI section id.
        uci:foreach("network", "device", function(section)
            if section.name == "br-lan" then
                uci:set("network", section[".name"], "igmp_snooping", enabled and "1" or "0")
            end
        end)
        ensure_iptv_firewall(uci, enabled)
        uci:commit("network"); uci:commit("firewall"); uci:commit("udpxy"); uci:commit("be6500_oem")
        luci.sys.call("(ubus call network reload >/dev/null 2>&1; sleep 1; /usr/libexec/be6500-iptv-priority >/dev/null 2>&1; /etc/init.d/firewall reload >/dev/null 2>&1; [ -x /etc/init.d/udpxy ] && /etc/init.d/udpxy restart >/dev/null 2>&1) &")
        return true, { status = 0, message = udpxy_enable and not (file_exists("/usr/bin/udpxy") or file_exists("/usr/sbin/udpxy")) and "IPTV 已保存；udpxy 组件尚未安装" or "IPTV 设置已保存" }
    elseif method == "capture_iptv_dhcp" then
        if luci.sys.call("command -v tcpdump >/dev/null 2>&1") ~= 0 then return true, { status = 1, message = "路由器未安装 tcpdump，无法自动抓取" } end
        return true, { status = 1, message = "当前交换机端口需先隔离后才能准确抓取；请先选择 LAN 口并保存 IPTV 接入方式" }
    elseif method == "web_get_device_list" then return true, { status = 0, device_list = build_device_list(uci) }
    elseif method == "web_set_station_name" then
        local mac = tostring(args.uid or args.mac or ""):upper(); if not valid_mac(mac) then return true, { status = 1 } end
        -- Saving QoS/access settings must not turn the displayed fallback name
        -- into a permanent manual alias.  The UI marks this only when the user
        -- actually changes the name field.
        if tonumber(args.manual) ~= 1 then return true, status end
        local section = oem_device_section(mac); if not uci:get("be6500_oem", section) then uci:section("be6500_oem", "device", section, { mac = mac }) end
        local station_name = clean(args.name, 64)
        if station_name == "" then
            uci:delete("be6500_oem", section, "name")
            uci:delete("be6500_oem", section, "name_manual")
        else
            uci:set("be6500_oem", section, "name", station_name)
            uci:set("be6500_oem", section, "name_manual", "1")
        end
        if not uci:commit("be6500_oem") then return true, { status = 1, message = "设备名称保存失败" } end
        return true, status
    elseif method == "web_set_device_limit_speed" then
        local mac = tostring(args.uid or ""):upper()
        if mac:match("^%x%x%x%x%x%x%x%x%x%x%x%x$") then mac = mac:gsub("(%x%x)", "%1:"):sub(1, 17) end
        if not valid_mac(mac) then return true, { status = 1 } end
        local section = oem_device_section(mac); if not uci:get("be6500_oem", section) then uci:section("be6500_oem", "device", section, { mac = mac }) end
        uci:set("be6500_oem", section, "qos_enable", tonumber(args.enable) == 1 and "1" or "0")
        local upload = tonumber(args.upload or args.qos_upload) or 0
        local download = tonumber(args.download or args.qos_download) or 0
        uci:set("be6500_oem", section, "qos_upload", tostring(upload)); uci:set("be6500_oem", section, "qos_download", tostring(download))
        if not uci:commit("be6500_oem") then return true, { status = 1, message = "设备限速保存失败" } end
        local upload_kbit = tonumber(args.enable) == 1 and math.floor(upload * 1000 + 0.5) or 0
        local download_kbit = tonumber(args.enable) == 1 and math.floor(download * 1000 + 0.5) or 0
        local command = string.format("/usr/libexec/rejected-mac set_limit %q %d %d 2>&1",
            mac, download_kbit, upload_kbit)
        local handle = io.popen(command); local output = handle and handle:read("*a") or ""; local ok = handle and handle:close()
        if not ok then return true, { status = 1, message = trim(output) ~= "" and trim(output) or "设备限速规则应用失败" } end
        return true, { status = 0, message = trim(output) }
    elseif method == "get_macfilter_info" then
        local policy = uci:get("be6500_oem", "access", "policy") or "deny"
        local client_mac, client_wireless = request_client(uci)
        return true, { status = 0, enable = uci:get("be6500_oem", "access", "enabled") == "0" and 0 or 1,
            macpolicy = policy, blacklist = access_entries(uci, "deny"), whitelist = access_entries(uci, "allow"),
            client_mac = client_mac, client_wireless = client_wireless and 1 or 0 }
    elseif method == "set_macfilter" then
        if not ensure_oem_config(uci) then
            return true, { status = 1, message = "访问控制配置文件创建失败" }
        end
        local previous = access_policy_snapshot(uci)
        local policy = args.macpolicy == "allow" and "allow" or "deny"
        if not uci:get("be6500_oem", "access") then uci:section("be6500_oem", "settings", "access", {}) end
        uci:set("be6500_oem", "access", "policy", policy); uci:set("be6500_oem", "access", "enabled", tostring(args.enable) == "0" and "0" or "1")
        if tonumber(args.replace) == 1 then
            replace_access_entries(uci, "deny", args.blacklist)
            replace_access_entries(uci, "allow", args.whitelist)
        end
        for _, item in ipairs(type(args.list) == "table" and args.list or {}) do
            local mac = tostring(item.macaddr or ""):upper()
            if valid_mac(mac) then
                local existing = find_access(uci, policy, mac)
                if tostring(item.mod) == "0" then
                    if existing then uci:delete("be6500_oem", existing) end
                else
                    if not existing then existing = uci:section("be6500_oem", "access", nil, { policy = policy, mac = mac }) end
                    uci:set("be6500_oem", existing, "name", clean(item.name, 64))
                end
            end
        end
        local committed = uci:commit("be6500_oem")
        if not committed then return true, { status = 1, message = "访问控制配置保存失败" } end
        local applied, apply_message = apply_mac_policy(uci, policy, previous)
        if not applied then return true, { status = 1, message = apply_message } end
        if not reconcile_wifi_reject_rows(uci) then
            return true, { status = 1, message = "名单已生效，但拒绝记录同步清理失败" }
        end
        return true, { status = 0, message = apply_message }
    elseif method == "web_get_rejected_list" or method == "get_rejected_devices" then
        -- The log file is intentionally persistent, but its rows must reflect
        -- the policy that is active now.  Reconcile on every read as well as
        -- after a save so an already-allowed client cannot remain displayed
        -- merely because its whitelist entry was written by another UI/API.
        if not reconcile_wifi_reject_rows(uci) then
            return true, { status = 1, message = "拒绝记录同步清理失败" }
        end
        local rows = wifi_reject_rows(uci)
        return true, { status = 0, data = rows, rejected_list = rows }
    elseif method == "clear_rejected_devices" then
        if clear_wifi_reject_rows(args.mac, args.ssid) then
            return true, { status = 0, message = "拒绝记录已清除" }
        end
        return true, { status = 1, message = "拒绝记录清除失败" }
    elseif method == "web_get_dhcp_static_ip" then
        local data = {}; uci:foreach("dhcp", "host", function(section)
            local mac = type(section.mac) == "table" and section.mac[1] or section.mac
            if mac and section.ip then data[#data + 1] = { name = section.name or "未知设备", ip = section.ip, mac = tostring(mac):upper() } end
        end); return true, { status = 0, data = data }
    elseif method == "web_set_dhcp_static_ip" then
        local mac = tostring(args.mac or ""):upper(); if not valid_mac(mac) or not valid_ipv4(args.ip) then return true, { status = 1 } end
        local section; uci:foreach("dhcp", "host", function(item)
            local item_mac = type(item.mac) == "table" and item.mac[1] or item.mac
            if tostring(item_mac or ""):upper() == mac then section = item[".name"]; return false end
        end)
        if not section then section = uci:section("dhcp", "host", nil, {}) end
        uci:set("dhcp", section, "name", clean(args.name, 64)); uci:set("dhcp", section, "mac", mac); uci:set("dhcp", section, "ip", args.ip)
        uci:commit("dhcp"); luci.sys.call("/etc/init.d/dnsmasq restart >/dev/null 2>&1 &"); return true, status
    elseif method == "web_del_dhcp_static_ip" then
        local mac = tostring(args.mac or ""):upper(); uci:foreach("dhcp", "host", function(item)
            local item_mac = type(item.mac) == "table" and item.mac[1] or item.mac
            if tostring(item_mac or ""):upper() == mac then uci:delete("dhcp", item[".name"]); return false end
        end); uci:commit("dhcp"); luci.sys.call("/etc/init.d/dnsmasq restart >/dev/null 2>&1 &"); return true, status
    elseif method == "web_get_guest_limit_speed" then
        return true, { status = 0, enable = uci:get("be6500_oem", "guest_qos", "enabled") == "1" and 1 or 0,
            upload = tonumber((uci:get("be6500_oem", "guest_qos", "upload"))) or 0, download = tonumber((uci:get("be6500_oem", "guest_qos", "download"))) or 0 }
    elseif method == "web_set_guest_limit_speed" then
        local upload = tonumber(args.upload)
        local download = tonumber(args.download)
        if not upload or not download or upload < 0 or download < 0 then
            return true, { status = 1, message = "访客限速数值无效" }
        end
        if not uci:get("be6500_oem", "guest_qos") then uci:section("be6500_oem", "settings", "guest_qos", {}) end
        uci:set("be6500_oem", "guest_qos", "enabled", tonumber(args.enable) == 1 and "1" or "0"); uci:set("be6500_oem", "guest_qos", "upload", tostring(upload)); uci:set("be6500_oem", "guest_qos", "download", tostring(download))
        if not uci:commit("be6500_oem") then return true, { status = 1, message = "访客限速保存失败" } end
        local output = luci.sys.exec("/usr/sbin/be6500-qos-apply reload 2>&1")
        if luci.sys.call("test -f /tmp/be6500-guest-qos.ok") ~= 0 then
            return true, { status = 1, message = trim(output) ~= "" and trim(output) or "访客限速规则应用失败" }
        end
        return true, status
    elseif method == "web_get_credit_mode" then return true, { status = 0, mode = uci:get("be6500_oem", "qos", "mode") or "1" }
    elseif method == "web_set_credit_mode" then
        local mode = tonumber(args.mode)
        if mode ~= 0 and mode ~= 1 and mode ~= 2 then
            return true, { status = 1, message = "流量模式无效" }
        end
        if not uci:get("be6500_oem", "qos") then uci:section("be6500_oem", "settings", "qos", {}) end
        uci:set("be6500_oem", "qos", "mode", tostring(mode))
        if not uci:commit("be6500_oem") then return true, { status = 1, message = "流量模式保存失败" } end
        local output = luci.sys.exec("/usr/sbin/be6500-qos-apply reload 2>&1")
        if luci.sys.call("test -f /tmp/be6500-guest-qos.ok") ~= 0 then
            return true, { status = 1, message = trim(output) ~= "" and trim(output) or "流量模式应用失败" }
        end
        return true, { status = 0, mode = tostring(mode) }
    elseif method == "get_port_forward" then
        local info = {}; uci:foreach("firewall", "redirect", function(section)
            if section.be6500_oem == "1" and section.be6500_kind ~= "dmz" then info[#info + 1] = { name = section.name or section[".name"], proto = section.proto or "tcp udp", src_dport = section.src_dport or "", dest_ip = section.dest_ip or "", dest_port = section.dest_port or "" } end
        end); return true, { status = 0, info = info }
    elseif method == "set_port_forward" then
        local name, ip = clean(args.name, 64), clean(args.ipaddr, 15); local src_port = tostring(args["src-dport"] or ""); local dest_port = tostring(args["dest-port"] or "")
        if name == "" or not valid_ipv4(ip) or not src_port:match("^%d+[-:]?%d*$") or not dest_port:match("^%d+[-:]?%d*$") then return true, { status = 3 } end
        local section; uci:foreach("firewall", "redirect", function(item) if item.be6500_oem == "1" and item.name == name then section = item[".name"]; return false end end)
        if section and tonumber(args.edit) ~= 1 then return true, { status = 5 } end
        if not section then section = uci:section("firewall", "redirect", nil, {}) end
        uci:set("firewall", section, "name", name); uci:set("firewall", section, "src", "wan"); uci:set("firewall", section, "dest", "lan"); uci:set("firewall", section, "target", "DNAT"); uci:set("firewall", section, "proto", clean(args.proto, 16)); uci:set("firewall", section, "src_dport", src_port); uci:set("firewall", section, "dest_ip", ip); uci:set("firewall", section, "dest_port", dest_port); uci:set("firewall", section, "be6500_oem", "1")
        uci:commit("firewall"); firewall_reload(); return true, status
    elseif method == "del_port_forward" then
        uci:foreach("firewall", "redirect", function(item) if item.be6500_oem == "1" and item.name == args.name then uci:delete("firewall", item[".name"]); return false end end); uci:commit("firewall"); firewall_reload(); return true, status
    elseif method == "get_dmz" then
        local payload = { status = 0, on_off = 0, ipaddr = "" }; uci:foreach("firewall", "redirect", function(section)
            if section.be6500_kind == "dmz" then payload.on_off = section.enabled == "0" and 0 or 1; payload.ipaddr = section.dest_ip or ""; return false end
        end); return true, payload
    elseif method == "set_dmz" then
        if tonumber(args.on_off) == 1 and not valid_ipv4(args.ipaddr) then return true, { status = 1 } end
        local section; uci:foreach("firewall", "redirect", function(item) if item.be6500_kind == "dmz" then section = item[".name"]; return false end end)
        if not section then section = uci:section("firewall", "redirect", nil, {}) end
        uci:set("firewall", section, "name", "BE6500 DMZ"); uci:set("firewall", section, "src", "wan"); uci:set("firewall", section, "dest", "lan"); uci:set("firewall", section, "target", "DNAT"); uci:set("firewall", section, "proto", "all"); uci:set("firewall", section, "dest_ip", clean(args.ipaddr, 15)); uci:set("firewall", section, "enabled", tonumber(args.on_off) == 1 and "1" or "0"); uci:set("firewall", section, "be6500_oem", "1"); uci:set("firewall", section, "be6500_kind", "dmz")
        uci:commit("firewall"); firewall_reload(); return true, status
    elseif method == "get_upnp" then return true, { status = 0, enable = uci:get("upnpd", "config", "enabled") == "1" and 1 or 0, data = {} }
    elseif method == "set_upnp" then
        uci:set("upnpd", "config", "enabled", tonumber(args.enabled) == 1 and "1" or "0"); uci:commit("upnpd"); luci.sys.call("/etc/init.d/miniupnpd " .. (tonumber(args.enabled) == 1 and "restart" or "stop") .. " >/dev/null 2>&1 &"); return true, status
    elseif method == "web_get_custom_hosts" then
        local file = io.open("/etc/hosts.be6500-custom", "r"); local hosts = file and file:read("*a") or ""; if file then file:close() end; return true, { status = 0, hosts = hosts }
    elseif method == "web_set_custom_hosts" then
        local hosts = tostring(args.hosts or ""); if #hosts > 8192 then return true, { status = 1 } end
        local file = io.open("/etc/hosts.be6500-custom", "w"); if not file then return true, { status = 1 } end; file:write(hosts); if hosts ~= "" and hosts:sub(-1) ~= "\n" then file:write("\n") end; file:close()
        local dnsmasq; uci:foreach("dhcp", "dnsmasq", function(section) dnsmasq = section[".name"]; return false end)
        if dnsmasq then
            local paths, found = uci:get_list("dhcp", dnsmasq, "addnhosts") or {}, false
            for _, path in ipairs(paths) do if path == "/etc/hosts.be6500-custom" then found = true end end
            if not found then paths[#paths + 1] = "/etc/hosts.be6500-custom" end
            set_uci_list(uci, "dhcp", dnsmasq, "addnhosts", paths); uci:commit("dhcp")
        end
        luci.sys.call("/etc/init.d/dnsmasq restart >/dev/null 2>&1 &"); return true, status
    elseif method == "get_led_control" then
        local function brightness(channel)
            local value = trim(luci.sys.exec("cat /sys/class/leds/led_" .. channel .. "/brightness 2>/dev/null") or "")
            return tonumber(value) or 0
        end
        local rules = {}
        uci:foreach("be6500_oem", "led_rule", function(section)
            rules[#rules + 1] = {
                state = section.state or "default",
                color = section.color or "blue",
                mode = section.effect or "steady",
                enabled = section.enabled == "0" and 0 or 1
            }
        end)
        return true, {
            status = 0,
            enabled = uci:get("be6500_oem", "led", "enabled") == "0" and 0 or 1,
            policy = uci:get("be6500_oem", "led", "policy") or "auto",
            color = uci:get("be6500_oem", "led", "color") or "blue",
            mode = uci:get("be6500_oem", "led", "effect") or uci:get("be6500_oem", "led", "mode") or "steady",
            rules = rules,
            brightness = {
                red = brightness("red"), green = brightness("green"), blue = brightness("blue")
            }
        }
    elseif method == "set_led_control" then
        local colors = { blue = true, green = true, red = true, ["red+green"] = true,
            ["red+blue"] = true, ["green+blue"] = true, ["red+green+blue"] = true }
        local modes = { steady = true, slow = true, fast = true }
        local states = { booting = true, upgrading = true, overheat = true, wps = true,
            wifi_off = true, offline = true, online = true, usb = true, plugin = true, default = true }
        local policies = { auto = true, custom = true }
        local policy = tostring(args.policy or "auto")
        local color = tostring(args.color or "blue")
        local mode = tostring(args.mode or "steady")
        if not policies[policy] then return true, { status = 1, message = "不支持的指示灯控制方式" } end
        if not colors[color] then return true, { status = 1, message = "不支持的灯光颜色" } end
        if not modes[mode] then return true, { status = 1, message = "不支持的灯光模式" } end
        if not uci:get("be6500_oem", "led") then
            uci:section("be6500_oem", "settings", "led", {})
        end
        uci:set("be6500_oem", "led", "enabled", tonumber(args.enabled) == 1 and "1" or "0")
        uci:set("be6500_oem", "led", "policy", policy)
        uci:set("be6500_oem", "led", "color", color)
        uci:set("be6500_oem", "led", "effect", mode)
        uci:delete("be6500_oem", "led", "mode")
        local old_rules = {}
        uci:foreach("be6500_oem", "led_rule", function(section)
            old_rules[#old_rules + 1] = section[".name"]
        end)
        for _, section in ipairs(old_rules) do uci:delete("be6500_oem", section) end
        local seen = {}
        if policy == "custom" then
            if type(args.rules) ~= "table" or #args.rules == 0 then
                return true, { status = 1, message = "请至少添加一条自定义灯光规则" }
            end
            if #args.rules > 12 then return true, { status = 1, message = "自定义灯光规则不能超过 12 条" } end
            for _, rule in ipairs(args.rules) do
                local state = tostring(rule.state or "")
                local rule_color = tostring(rule.color or "")
                local rule_mode = tostring(rule.mode or "")
                if not states[state] then return true, { status = 1, message = "灯光规则包含不支持的设备状态" } end
                if seen[state] then return true, { status = 1, message = "同一设备状态只能设置一条灯光规则" } end
                if not colors[rule_color] then return true, { status = 1, message = "灯光规则包含不支持的颜色" } end
                if not modes[rule_mode] then return true, { status = 1, message = "灯光规则包含不支持的显示方式" } end
                seen[state] = true
                uci:section("be6500_oem", "led_rule", nil, {
                    state = state, color = rule_color, effect = rule_mode,
                    enabled = tonumber(rule.enabled) == 0 and "0" or "1"
                })
            end
        end
        if not uci:commit("be6500_oem") then
            return true, { status = 1, message = "灯光设置保存失败" }
        end
        -- QWRT's WAN LED entry is bound to eth0 and leaves the actual RGB
        -- channel dark. The dedicated controller owns all three channels.
        if uci:get("system", "led_WAN") then
            uci:delete("system", "led_WAN")
            uci:commit("system")
        end
        local code = luci.sys.call("/etc/init.d/be6500-led reload >/dev/null 2>&1")
        if code ~= 0 then return true, { status = 1, message = "灯光驱动应用失败" } end
        return true, { status = 0 }
    elseif method == "get_system_overview" then
        local temperatures = {}
        for index = 0, 4 do
            local file = io.open("/sys/class/thermal/thermal_zone" .. index .. "/temp", "r")
            if file then
                local raw = tonumber(trim(file:read("*l") or "")); file:close()
                if raw then temperatures[#temperatures + 1] = math.floor(raw / 100) / 10 end
            end
        end
        return true, { status = 0,
            hostname = trim(luci.sys.exec("uci -q get system.@system[0].hostname") or ""),
            firmware = trim(luci.sys.exec(". /etc/openwrt_release 2>/dev/null; printf '%s' \"$DISTRIB_DESCRIPTION\"") or ""),
            kernel = trim(luci.sys.exec("uname -r 2>/dev/null") or ""),
            cpu = temperatures[1], wifi = { temperatures[2], temperatures[3] } }
    elseif method == "get_firewall_settings" then
        local defaults, wan = first_section(uci, "firewall", "defaults"), nil
        uci:foreach("firewall", "zone", function(section) if section.name == "wan" then wan = section[".name"]; return false end end)
        return true, { status = 0,
            synflood = defaults and uci:get("firewall", defaults, "synflood_protect") == "1" and 1 or 0,
            drop_invalid = defaults and uci:get("firewall", defaults, "drop_invalid") == "1" and 1 or 0,
            expose = wan and uci:get("firewall", wan, "be6500_expose") == "1" and 1 or 0 }
    elseif method == "set_firewall_settings" then
        local expose = tonumber(args.expose) == 1
        if expose and tonumber(args.confirm) ~= 1 then return true, { status = 1, message = "开启公网暴露必须明确确认安全风险" } end
        local defaults, wan = first_section(uci, "firewall", "defaults"), nil
        if defaults then
            uci:set("firewall", defaults, "synflood_protect", tonumber(args.synflood) == 1 and "1" or "0")
            uci:set("firewall", defaults, "drop_invalid", tonumber(args.drop_invalid) == 1 and "1" or "0")
        end
        uci:foreach("firewall", "zone", function(section) if section.name == "wan" then wan = section[".name"]; return false end end)
        if not wan then
            ensure_wan_firewall_members(uci)
            uci:foreach("firewall", "zone", function(section) if section.name == "wan" then wan = section[".name"]; return false end end)
        end
        if wan then
            uci:set("firewall", wan, "be6500_expose", expose and "1" or "0")
            uci:set("firewall", wan, "input", expose and "ACCEPT" or "REJECT")
            uci:set("firewall", wan, "output", "ACCEPT")
            uci:set("firewall", wan, "forward", expose and "ACCEPT" or "REJECT")
        end
        if not uci:commit("firewall") then return true, { status = 1, message = "防火墙配置保存失败" } end
        firewall_reload(); return true, { status = 0 }
    elseif method == "get_nat_type" then
        local defaults = first_section(uci, "firewall", "defaults")
        return true, { status = 0, type = defaults and uci:get("firewall", defaults, "be6500_nat_type") or "default" }
    elseif method == "set_nat_type" then
        local nat_type = args.type == "nat1" and "nat1" or "default"
        local defaults = first_section(uci, "firewall", "defaults")
        if defaults then uci:set("firewall", defaults, "be6500_nat_type", nat_type) end
        uci:foreach("firewall", "zone", function(section) if section.name == "wan" then uci:set("firewall", section[".name"], "fullcone", nat_type == "nat1" and "1" or "0"); return false end end)
        uci:commit("firewall"); firewall_reload(); return true, status
    elseif method == "get_cert_settings" then
        luci.sys.call("/usr/libexec/be6500-cert-manager info >/dev/null 2>&1")
        local function cert_get(option) return trim(luci.sys.exec("uci -q get be6500_cert.main." .. option .. " 2>/dev/null") or "") end
        local cert_file = cert_get("cert_file"); if cert_file == "" then cert_file = "/etc/be6500-certificates/fullchain.pem" end
        local key_file = cert_get("key_file"); if key_file == "" then key_file = "/etc/be6500-certificates/privkey.pem" end
        local q = (require "luci.util").shellquote
        local present = luci.sys.call("test -s " .. q(cert_file) .. " -a -s " .. q(key_file)) == 0
        local details = present and (luci.sys.exec("openssl x509 -in " .. q(cert_file) .. " -noout -subject -issuer -dates 2>/dev/null") or "") or ""
        local active_cert = trim(luci.sys.exec("uci -q get uhttpd.main.cert 2>/dev/null") or "")
        local active_key = trim(luci.sys.exec("uci -q get uhttpd.main.key 2>/dev/null") or "")
        local https_enabled = present and active_cert == cert_file and active_key == key_file and
            luci.sys.call("uci -q get uhttpd.main.listen_https >/dev/null 2>&1") == 0
        local expires_at, cert_state = "-", "未安装"
        if present then
            local end_raw = trim(luci.sys.exec("openssl x509 -in " .. q(cert_file) .. " -noout -enddate -dateopt iso_8601 2>/dev/null | sed 's/^notAfter=//; s/Z$//' ") or "")
            if end_raw ~= "" then
                expires_at = end_raw
            end
            if luci.sys.call("openssl x509 -in " .. q(cert_file) .. " -noout -checkend 0 >/dev/null 2>&1") ~= 0 then cert_state = "已过期"
            elseif luci.sys.call("openssl x509 -in " .. q(cert_file) .. " -noout -checkend 2592000 >/dev/null 2>&1") ~= 0 then cert_state = "即将过期"
            else cert_state = "正常" end
        end
        local certificates, applied_id = {}, cert_get("applied_id")
        uci:foreach("be6500_cert", "certificate", function(section)
            local section_id = section[".name"]
            local section_cert = section.cert_file or ("/etc/be6500-certificates/" .. section_id .. "/fullchain.pem")
            local section_key = section.key_file or ("/etc/be6500-certificates/" .. section_id .. "/privkey.pem")
            local section_present = luci.sys.call("test -s " .. q(section_cert) .. " -a -s " .. q(section_key)) == 0
            local section_details, section_expiry, section_state = "", "-", "未安装"
            local operation_state = trim(luci.sys.exec("cat /tmp/be6500-cert-" .. section_id .. ".status 2>/dev/null") or "")
            if section_present then
                section_details = luci.sys.exec("openssl x509 -in " .. q(section_cert) .. " -noout -subject -issuer -dates 2>/dev/null") or ""
                section_expiry = trim(luci.sys.exec("openssl x509 -in " .. q(section_cert) .. " -noout -enddate -dateopt iso_8601 2>/dev/null | sed 's/^notAfter=//; s/Z$//' ") or "")
                if luci.sys.call("openssl x509 -in " .. q(section_cert) .. " -noout -checkend 0 >/dev/null 2>&1") ~= 0 then section_state = "已过期"
                elseif luci.sys.call("openssl x509 -in " .. q(section_cert) .. " -noout -checkend 2592000 >/dev/null 2>&1") ~= 0 then section_state = "即将过期"
                else section_state = "正常" end
            elseif operation_state == "applying" then
                section_state = "申请中"
            elseif operation_state == "failed" then
                section_state = "失败"
            end
            certificates[#certificates + 1] = { id = section_id, domain = section.domain or "", other_domains = section.other_domains or "",
                auto_renew = section.auto_renew == "1" and 1 or 0, present = section_present and 1 or 0,
                applied = applied_id == section_id and 1 or 0, cert_file = section_cert, key_file = section_key,
                expires_at = section_expiry ~= "" and section_expiry or "-", cert_state = section_state, details = section_details }
        end)
        return true, { status = 0, domain = cert_get("domain"), other_domains = cert_get("other_domains"),
            acme_name = cert_get("acme_name"), acme_email = cert_get("acme_email"), ca = cert_get("ca"),
            dns_name = cert_get("dns_name"), dns_provider = cert_get("dns_provider"), dns_email = cert_get("dns_email"),
            secret_saved = cert_get("dns_secret") ~= "" and 1 or 0, auto_renew = cert_get("auto_renew") == "1" and 1 or 0,
            present = present and 1 or 0, applied = https_enabled and 1 or 0, details = details,
            expires_at = expires_at, cert_state = cert_state,
            cert_file = cert_file, key_file = key_file, certificates = certificates }
    elseif method == "save_cert_settings" then
        local domain = clean(args.domain, 253):lower()
        local others = clean(args.other_domains, 1024):lower():gsub("%s+", "")
        local email = clean(args.acme_email, 253)
        local provider = tostring(args.dns_provider) == "cloudflare_global" and "cloudflare_global" or "cloudflare_token"
        local dns_email, secret = clean(args.dns_email, 253), clean(args.dns_secret, 512)
        local cert_id = clean(args.id, 80)
        if not cert_id:match("^cert_[A-Za-z0-9_]+$") then cert_id = "cert_" .. tostring(os.time()) .. tostring(math.random(100, 999)) end
        local cert_file = clean(args.cert_file, 512); local key_file = clean(args.key_file, 512)
        if cert_file == "" then cert_file = "/etc/be6500-certificates/" .. cert_id .. "/fullchain.pem" end
        if key_file == "" then key_file = "/etc/be6500-certificates/" .. cert_id .. "/privkey.pem" end
        local function valid_domain(name)
            name = tostring(name or "")
            if name:sub(1, 2) == "*." then name = name:sub(3) end
            return name:match("^[a-z0-9][a-z0-9%.%-]*[a-z0-9]$") ~= nil
        end
        if domain == "" or not valid_domain(domain) then return true, { status = 1, message = "请填写正确的主域名" } end
        for name in others:gmatch("[^,]+") do if not valid_domain(name) then return true, { status = 1, message = "附加域名格式不正确：" .. name } end end
        if email == "" or not email:match("^[^@]+@[^@]+$") then return true, { status = 1, message = "请填写正确的 ACME 邮箱" } end
        if provider == "cloudflare_global" and dns_email == "" then return true, { status = 1, message = "Global API Key 模式需要 Cloudflare 邮箱" } end
        local function valid_path(path) return path:sub(1, 1) == "/" and not path:find("%.%.", 1, true) and not path:find("[%z\1-\31]") end
        if not valid_path(cert_file) or not valid_path(key_file) or cert_file == key_file then
            return true, { status = 1, message = "证书和私钥必须使用两个不同的绝对路径，且不能包含 .." }
        end
        local q = (require "luci.util").shellquote
        local renew_enabled = args.auto_renew == true or tonumber(args.auto_renew) == 1
        local command = "/usr/libexec/be6500-cert-manager save " .. table.concat({ q(cert_id), q(domain), q(others), q(email), q(provider), q(dns_email), q(secret), q(renew_enabled and "1" or "0"), q(cert_file), q(key_file) }, " ")
        local code, output = marked_command(command)
        if code ~= 0 then return true, { status = 1, message = output ~= "" and output or "证书设置保存失败" } end
        return true, { status = 0, message = output, id = cert_id }
    elseif method == "save_cert_acme_account" then
        local name, email = clean(args.name, 80), clean(args.email, 253)
        local ca = tostring(args.provider or "letsencrypt")
        local allowed = { letsencrypt = true, zerossl = true, buypass = true, google = true }
        if not allowed[ca] then ca = "letsencrypt" end
        if email == "" or not email:match("^[^@]+@[^@]+$") then return true, { status = 1, message = "请填写正确的账户邮箱" } end
        if name == "" then name = "install-" .. ca end
        local q = (require "luci.util").shellquote
        luci.sys.call("uci set be6500_cert.main.acme_name=" .. q(name) .. "; uci set be6500_cert.main.acme_email=" .. q(email) .. "; uci set be6500_cert.main.ca=" .. q(ca) .. "; uci commit be6500_cert; chmod 600 /etc/config/be6500_cert")
        return true, { status = 0 }
    elseif method == "save_cert_dns_account" then
        local name = clean(args.name, 80); if name == "" then name = "cloudflare" end
        local provider = tostring(args.provider) == "cloudflare_global" and "cloudflare_global" or "cloudflare_token"
        local email, secret = clean(args.email, 253), clean(args.secret, 512)
        if provider == "cloudflare_global" and email == "" then return true, { status = 1, message = "Global API Key 模式需要 Cloudflare 邮箱" } end
        local q = (require "luci.util").shellquote
        local command = "uci set be6500_cert.main.dns_name=" .. q(name) .. "; uci set be6500_cert.main.dns_provider=" .. q(provider) .. "; uci set be6500_cert.main.dns_email=" .. q(email)
        if secret ~= "" then command = command .. "; uci set be6500_cert.main.dns_secret=" .. q(secret) end
        luci.sys.call(command .. "; uci commit be6500_cert; chmod 600 /etc/config/be6500_cert")
        return true, { status = 0 }
    elseif method == "set_certificate_auto_renew" then
        local enabled = tonumber(args.enabled) == 1 and "1" or "0"
        local cert_id = clean(args.id, 80)
        if not cert_id:match("^cert_[A-Za-z0-9_]+$") then return true, { status = 1, message = "证书 ID 不正确" } end
        local code, output = marked_command("/usr/libexec/be6500-cert-manager auto " .. cert_id .. " " .. enabled)
        return true, { status = code == 0 and 0 or 1, message = output }
    elseif method == "save_certificate_preferences" then
        local output, code = "", 0
        for item in tostring(args.auto_states or ""):gmatch("[^,]+") do
            local cert_id, enabled = item:match("^(cert_[A-Za-z0-9_]+):([01])$")
            if cert_id then code, output = marked_command("/usr/libexec/be6500-cert-manager auto " .. cert_id .. " " .. enabled); if code ~= 0 then break end end
        end
        local applied_id = clean(args.applied_id, 80)
        if code == 0 then
            if applied_id == "" then code, output = marked_command("/usr/libexec/be6500-cert-manager disable")
            elseif applied_id:match("^cert_[A-Za-z0-9_]+$") then code, output = marked_command("/usr/libexec/be6500-cert-manager apply " .. applied_id)
            else return true, { status = 1, message = "应用的证书 ID 不正确" } end
        end
        return true, { status = code == 0 and 0 or 1, message = output }
    elseif method == "issue_certificate" or method == "renew_certificate" or method == "apply_certificate" or method == "selfsign_certificate" then
        local actions = { issue_certificate = "issue", renew_certificate = "renew", apply_certificate = "apply", selfsign_certificate = "selfsigned" }
        local cert_id = clean(args.id, 80)
        if not cert_id:match("^cert_[A-Za-z0-9_]+$") then return true, { status = 1, message = "证书 ID 不正确" } end
        if method == "issue_certificate" then
            local q = (require "luci.util").shellquote
            local state_file = "/tmp/be6500-cert-" .. cert_id .. ".status"
            local task_log = "/tmp/be6500-cert-" .. cert_id .. ".log"
            luci.sys.call("echo applying >" .. q(state_file) .. "; (/usr/libexec/be6500-cert-manager issue " ..
                q(cert_id) .. " >" .. q(task_log) .. " 2>&1; rc=$?; if [ $rc -eq 0 ]; then echo success >" ..
                q(state_file) .. "; else echo failed >" .. q(state_file) .. "; fi) </dev/null >/dev/null 2>&1 &")
            return true, { status = 0, message = "证书申请已开始" }
        end
        local code, output = marked_command("/usr/libexec/be6500-cert-manager " .. actions[method] .. " " .. cert_id)
        if code ~= 0 then return true, { status = 1, message = output ~= "" and output or "证书操作失败，请查看日志" } end
        return true, { status = 0, message = output }
    elseif method == "upload_certificate" then
        local certificate, private_key = tostring(args.certificate or ""), tostring(args.private_key or "")
        if not certificate:find("-----BEGIN CERTIFICATE-----", 1, true) or not private_key:find("-----BEGIN", 1, true) or not private_key:find("PRIVATE KEY-----", 1, true) then
            return true, { status = 1, message = "证书或私钥 PEM 内容不正确" }
        end
        if #certificate > 131072 or #private_key > 32768 then return true, { status = 1, message = "证书文件过大" } end
        local cert_id = clean(args.id, 80)
        if not cert_id:match("^cert_[A-Za-z0-9_]+$") then return true, { status = 1, message = "证书 ID 不正确" } end
        local cert_file = trim(luci.sys.exec("uci -q get be6500_cert." .. cert_id .. ".cert_file") or ""); if cert_file == "" then cert_file = "/etc/be6500-certificates/" .. cert_id .. "/fullchain.pem" end
        local key_file = trim(luci.sys.exec("uci -q get be6500_cert." .. cert_id .. ".key_file") or ""); if key_file == "" then key_file = "/etc/be6500-certificates/" .. cert_id .. "/privkey.pem" end
        local q = (require "luci.util").shellquote
        luci.sys.call("mkdir -p " .. q(cert_file:match("^(.*)/[^/]+$") or "/etc/be6500-certificates") .. " " .. q(key_file:match("^(.*)/[^/]+$") or "/etc/be6500-certificates"))
        local cert_tmp, key_tmp = cert_file .. ".tmp", key_file .. ".tmp"
        local cf = io.open(cert_tmp, "w"); local kf = io.open(key_tmp, "w")
        if not cf or not kf then if cf then cf:close() end; if kf then kf:close() end; return true, { status = 1, message = "无法写入证书目录" } end
        cf:write(certificate); cf:close(); kf:write(private_key); kf:close()
        local check = luci.sys.call("openssl x509 -in " .. q(cert_tmp) .. " -noout >/dev/null 2>&1 && openssl pkey -in " .. q(key_tmp) .. " -noout >/dev/null 2>&1")
        if check ~= 0 then luci.sys.call("rm -f " .. q(cert_tmp) .. " " .. q(key_tmp)); return true, { status = 1, message = "证书或私钥校验失败" } end
        luci.sys.call("mv " .. q(cert_tmp) .. " " .. q(cert_file) .. "; mv " .. q(key_tmp) .. " " .. q(key_file) .. "; chmod 600 " .. q(cert_file) .. " " .. q(key_file))
        return true, { status = 0, message = "证书已上传" }
    elseif method == "delete_certificate" then
        local cert_id = clean(args.id, 80)
        if not cert_id:match("^cert_[A-Za-z0-9_]+$") then return true, { status = 1, message = "证书 ID 不正确" } end
        local code, output = marked_command("/usr/libexec/be6500-cert-manager delete " .. cert_id)
        return true, { status = code == 0 and 0 or 1, message = output }
    elseif method == "get_certificate_log" then
        return true, { status = 0, log = luci.sys.exec("/usr/libexec/be6500-cert-manager log 2>/dev/null") or "" }
    elseif method == "get_cf_ddns" then
        local fields = split_tabs(luci.sys.exec("/usr/libexec/be6500-ddns-manager info 2>/dev/null") or "")
        return true, { status = 0, enabled = tonumber(fields[2]) or 0, domain = fields[3] or "", zone = fields[4] or "",
            email = fields[5] or "", key = fields[6] or "", interval = fields[7] or "dial",
            enabled6 = tonumber(fields[8]) or 0, domain6 = fields[9] or "" }
    elseif method == "save_cf_ddns" then
        local enabled4 = tonumber(args.enabled) == 1 and "1" or "0"
        local enabled6 = tonumber(args.enabled6) == 1 and "1" or "0"
        local domain = clean(args.domain, 253):lower()
        local domain6 = clean(args.domain6, 253):lower()
        local zone = clean(args.zone, 253):lower()
        local email = clean(args.email, 253)
        local key = clean(args.key, 255)
        local interval = tostring(args.interval or "dial")
        local allowed = { dial = true, ["1"] = true, ["2"] = true, ["5"] = true, ["10"] = true, ["15"] = true, ["20"] = true, ["30"] = true, ["60"] = true }
        if not allowed[interval] then interval = "10" end
        local function valid_domain(name) return name ~= "" and name:match("^[a-z0-9][a-z0-9%.%-]*[a-z0-9]$") ~= nil end
        if enabled4 == "1" and not valid_domain(domain) then return true, { status = 1, message = "请填写正确的 IPv4 完整域名" } end
        if enabled6 == "1" and not valid_domain(domain6 ~= "" and domain6 or domain) then return true, { status = 1, message = "请填写正确的 IPv6 完整域名" } end
        if (enabled4 == "1" or enabled6 == "1") and (not valid_domain(zone) or email == "" or key == "") then
            return true, { status = 1, message = "请完整填写 Cloudflare 区域域名、邮箱和 Global API Key" }
        end
        local q = (require "luci.util").shellquote
        local command = "/usr/libexec/be6500-ddns-manager save " .. table.concat({ q(enabled4), q(domain), q(zone), q(email), q(key), q(interval), q(enabled6), q(domain6) }, " ")
        local code, output = marked_command(command)
        if code ~= 0 then return true, { status = 1, message = output ~= "" and output or "DDNS 保存失败" } end
        return true, { status = 0, message = output ~= "" and output or "DDNS 设置已保存" }
    elseif method == "get_cf_ddns_status" then
        local fields = split_tabs(luci.sys.exec("/usr/libexec/be6500-ddns-manager status 2>/dev/null") or "")
        return true, { status = 0, ipv4 = fields[2] or "-", record4 = fields[3] or "-", ipv6 = fields[4] or "-",
            record6 = fields[5] or "-", last_time = fields[6] ~= "" and fields[6] or "-", last_result = fields[7] ~= "" and fields[7] or "暂无运行记录",
            enabled6 = tonumber(fields[8]) or 0 }
    elseif method == "run_cf_ddns" then
        local code, output = marked_command("/usr/libexec/be6500-ddns-manager run")
        if code ~= 0 then return true, { status = 1, message = output ~= "" and output or "DDNS 更新失败" } end
        return true, { status = 0, message = output }
    elseif method == "get_cf_ddns_log" then
        return true, { status = 0, log = luci.sys.exec("/usr/libexec/be6500-ddns-manager log 2>/dev/null") or "" }
    elseif method == "web_get_ddns_status" then
        local info = {}; uci:foreach("ddns", "service", function(section)
            info[#info + 1] = { ddns_name = section[".name"], service = section.service_name or "--", domain = section.domain or "--", enabled = section.enabled == "1" and 1 or 0,
                wan_uptime = tonumber(ubus_interface("wan").uptime) or 0, wan_ip = first_ipv4(ubus_interface("wan")), conn_status = section.enabled == "1" and 1 or 0 }
        end); return true, { status = 0, info = info }
    elseif method == "web_get_ddns" then
        local name = safe_name(args.ddns_name, ""); if name == "" or not uci:get("ddns", name) then return true, { status = 1 } end
        return true, { status = 0, username = uci:get("ddns", name, "username") or "", passwd = uci:get("ddns", name, "password") or "", domain = uci:get("ddns", name, "domain") or "", service = uci:get("ddns", name, "service_name") or "", check_interval = tonumber((uci:get("ddns", name, "check_interval"))) or 10, force_interval = tonumber((uci:get("ddns", name, "force_interval"))) or 5 }
    elseif method == "web_config_ddns" then
        local name = safe_name(args.ddns_name, safe_name(args.domain, "be6500_ddns"))
        if tonumber(args.action) == 0 then if uci:get("ddns", name) then uci:delete("ddns", name); uci:commit("ddns") end; return true, status end
        if not uci:get("ddns", name) then uci:section("ddns", "service", name, {}) end
        uci:set("ddns", name, "service_name", clean(args.service, 64)); uci:set("ddns", name, "domain", clean(args.domain, 255)); uci:set("ddns", name, "username", clean(args.username, 255)); uci:set("ddns", name, "password", clean(args.passwd, 255)); uci:set("ddns", name, "check_interval", tostring(tonumber(args.check_interval) or 10)); uci:set("ddns", name, "check_unit", "minutes"); uci:set("ddns", name, "force_interval", tostring(tonumber(args.force_interval) or 5)); uci:set("ddns", name, "force_unit", "hours"); uci:set("ddns", name, "enabled", "1"); uci:set("ddns", name, "interface", "wan"); uci:set("ddns", name, "ip_source", "network"); uci:set("ddns", name, "ip_network", "wan"); uci:commit("ddns"); luci.sys.call("/etc/init.d/ddns restart >/dev/null 2>&1 &"); return true, status
    elseif method == "web_switch_ddns_service" then
        local name = safe_name(args.ddns_name, ""); if not uci:get("ddns", name) then return true, { status = 1 } end; uci:set("ddns", name, "enabled", tonumber(args.action) == 1 and "1" or "0"); uci:commit("ddns"); luci.sys.call("/etc/init.d/ddns restart >/dev/null 2>&1 &"); return true, status
    elseif method == "web_get_ddns_uptime" then
        local name = safe_name(args.ddns_name, ""); if name == "" then return true, { status = 1 } end; luci.sys.call("/usr/lib/ddns/dynamic_dns_updater.sh " .. name .. " 0 >/tmp/be6500-ddns-update.log 2>&1 &"); return true, status
    elseif method == "web_get_router_mode" then
        return true, { status = 0, mode = tonumber((uci:get("network", "lan", "be6500_router_mode"))) or 0 }
    elseif method == "web_get_wifi_scan_list" then
        local data, seen = {}, {}
        local function channel_from_frequency(frequency)
            frequency = tonumber(frequency) or 0
            if frequency == 2484 then return 14 end
            if frequency >= 2412 and frequency <= 2472 then return math.floor((frequency - 2407) / 5) end
            if frequency >= 5000 and frequency <= 5900 then return math.floor((frequency - 5000) / 5) end
            if frequency >= 5955 and frequency <= 7115 then return math.floor((frequency - 5950) / 5) end
            return 0
        end
        local function parse_iw_scan(output)
            local current
            for line in tostring(output or ""):gmatch("[^\n]+") do
                local bssid = line:match("^BSS%s+(%x%x:%x%x:%x%x:%x%x:%x%x:%x%x)")
                if bssid then
                    current = { bssid = bssid:upper(), rssi = -100, channel = 0, encryption = "none" }
                    data[#data + 1] = current
                elseif current then
                    local frequency = line:match("^%s*freq:%s*(%d+)")
                    if frequency then current.channel = channel_from_frequency(frequency) end
                    current.rssi = tonumber(line:match("^%s*signal:%s*([%-]?%d+%.?%d*)%s*dBm")) or current.rssi
                    local ssid = line:match("^%s*SSID:%s*(.*)$")
                    if ssid ~= nil then current.ssid = ssid end
                    if line:match("^%s*RSN:") then current.encryption = "psk2" end
                    if line:match("^%s*WPA:") then current.encryption = "psk-mixed" end
                    local suites = line:match("Authentication suites:%s*(.*)$")
                    if suites and suites:find("SAE", 1, true) then
                        current.encryption = suites:find("PSK", 1, true) and "sae-mixed" or "sae"
                    end
                end
            end
        end
        local function parse_iwinfo_scan(output)
            local current
            for line in tostring(output or ""):gmatch("[^\n]+") do
                local bssid = line:match("^Cell%s+%d+%s+%- Address:%s*(%x%x:%x%x:%x%x:%x%x:%x%x:%x%x)")
                if bssid then
                    current = { bssid = bssid:upper(), rssi = -100, channel = 0,
                        encryption = "none", ssid = "" }
                    data[#data + 1] = current
                elseif current then
                    local ssid = line:match('^%s*ESSID:%s*"(.*)"')
                    if ssid ~= nil then current.ssid = ssid end
                    if line:match("^%s*ESSID:%s*unknown") then current.ssid = "隐藏" end
                    current.channel = tonumber(line:match("Channel:%s*(%d+)")) or current.channel
                    current.rssi = tonumber(line:match("Signal:%s*([%-]?%d+)%s*dBm")) or current.rssi
                    local encryption = line:match("^%s*Encryption:%s*(.*)$")
                    if encryption then
                        if encryption:find("WPA3", 1, true) or encryption:find("SAE", 1, true) then
                            current.encryption = encryption:find("WPA2", 1, true) and "sae-mixed" or "sae"
                        elseif encryption:find("mixed WPA/WPA2", 1, true) then current.encryption = "psk-mixed"
                        elseif encryption:find("WPA2", 1, true) then current.encryption = "psk2"
                        elseif encryption:lower():find("none", 1, true) then current.encryption = "none" end
                    end
                end
            end
        end
        local interfaces = luci.sys.exec("iw dev 2>/dev/null | awk '/Interface/{print $2}'") or ""
        local scanned = false
        for iface in interfaces:gmatch("[^%s]+") do
            if iface:match("%-ap0$") then
                local output = luci.sys.exec("iwinfo " .. iface .. " scan 2>/dev/null") or ""
                if output:find("Cell ", 1, true) then
                    parse_iwinfo_scan(output)
                    scanned = true
                end
            end
        end
        if not scanned then
            for iface in interfaces:gmatch("[^%s]+") do
                parse_iw_scan(luci.sys.exec("iw dev " .. iface .. " scan 2>/dev/null") or "")
            end
        end
        local known_hidden = {}
        uci:foreach("wireless", "wifi-iface", function(section)
            local bssid = tostring(section.bssid or ""):upper()
            if valid_mac(bssid) and section.ssid and section.ssid ~= "" then
                known_hidden[bssid] = section.ssid
            end
        end)
        local filtered = {}
        for _, item in ipairs(data) do
            if item.ssid == "隐藏" and known_hidden[item.bssid] then item.ssid = known_hidden[item.bssid] end
            if tonumber(item.rssi) and (tonumber(item.rssi) < -110 or tonumber(item.rssi) > 0) then item.rssi = -100 end
            local key = tostring(item.ssid or "") .. "\0" .. tostring(item.bssid or "")
            if item.ssid and item.ssid ~= "" and not seen[key] then seen[key] = true; filtered[#filtered + 1] = item end
        end
        table.sort(filtered, function(a, b) return (a.rssi or -100) > (b.rssi or -100) end)
        return true, { status = 0, data = filtered }
    elseif method == "web_get_wds_config" then
        local sta
        uci:foreach("wireless", "wifi-iface", function(section)
            if section.mode == "sta" and section.be6500_role == "wds" then sta = section; return false end
        end)
        return true, { status = 0, enable = sta and sta.disabled ~= "1" and 1 or 0,
            ssid = sta and sta.ssid or "", encryption = sta and oem_encryption(sta.encryption) or "none",
            key = sta and sta.key or "", channel = sta and tonumber((uci:get("wireless", sta.device, "channel"))) or 0,
            band = sta and not tostring(sta.device):match("0$") and 1 or 0 }
    elseif method == "web_set_wds_config" then
        local enabled = tonumber(args.enable) == 1
        local sta_name
        uci:foreach("wireless", "wifi-iface", function(section)
            if section.mode == "sta" and section.be6500_role == "wds" then sta_name = section[".name"]; return false end
        end)
        if not enabled then
            if sta_name then uci:set("wireless", sta_name, "disabled", "1") end
            uci:set("network", "wan", "auto", "1")
            uci:set("network", "wan6", "auto", uci:get("network", "wan6", "disabled") == "1" and "0" or "1")
            uci:commit("network"); uci:commit("wireless")
            luci.sys.call("(ifdown wwan6 >/dev/null 2>&1; ifdown wwan >/dev/null 2>&1; wifi reload >/dev/null 2>&1; ifup wan >/dev/null 2>&1; sleep 2; ifup wan6 >/dev/null 2>&1) >/tmp/be6500-wds-disable.log 2>&1 &")
            return true, status
        end
        local ssid = clean(args.ssid, 32)
        local channel = tonumber(args.channel) or 0
        local encryption = native_encryption(args.encryption)
        local key = clean(args.key, 63)
        if ssid == "" or channel < 1 or channel > 196 then return true, { status = 1 } end
        if encryption ~= "none" and (#key < 8 or #key > 63) then return true, { status = 1 } end
        local device = radio_device(uci, channel > 14 and 1 or 0)
        if not device then return true, { status = 1, message = "无线设备不存在" } end
        ensure_wwan_interfaces(uci)
        if not sta_name then sta_name = uci:section("wireless", "wifi-iface", "be6500_wds", {}) end
        uci:set("wireless", sta_name, "device", device); uci:set("wireless", sta_name, "network", "wwan")
        uci:set("wireless", sta_name, "mode", "sta"); uci:set("wireless", sta_name, "be6500_role", "wds")
        uci:set("wireless", sta_name, "ssid", ssid); uci:set("wireless", sta_name, "encryption", encryption)
        uci:set("wireless", sta_name, "disabled", "0")
        -- This page implements a routed Wi-Fi relay. Four-address WDS requires
        -- matching support on the upstream AP and otherwise associates without
        -- passing DHCP traffic, so keep the station in normal three-address mode.
        uci:delete("wireless", sta_name, "wds")
        local bssid = tostring(args.bssid or ""):upper()
        if valid_mac(bssid) then uci:set("wireless", sta_name, "bssid", bssid)
        else uci:delete("wireless", sta_name, "bssid") end
        if encryption == "none" then uci:delete("wireless", sta_name, "key") else uci:set("wireless", sta_name, "key", key) end
        uci:set("wireless", device, "channel", tostring(channel))
        -- Wired WAN and routed relay are mutually exclusive uplinks.  Merely
        -- changing the UI selection is not enough because netifd otherwise
        -- keeps the old PPPoE/DHCP default route alive in parallel.
        uci:set("network", "wan", "auto", "0")
        uci:set("network", "wan6", "auto", "0")
        local wan_zone
        uci:foreach("firewall", "zone", function(section)
            if section.name == "wan" then wan_zone = section[".name"]; return false end
        end)
        if wan_zone then
            local networks = uci:get_list("firewall", wan_zone, "network") or {}
            local present = {}
            for _, network in ipairs(networks) do present[network] = true end
            for _, required in ipairs({ "wwan", "wwan6" }) do
                if not present[required] then networks[#networks + 1] = required end
            end
            set_uci_list(uci, "firewall", wan_zone, "network", networks)
        end
        uci:commit("network"); uci:commit("wireless"); uci:commit("firewall")
        luci.sys.call("(ifdown wan6 >/dev/null 2>&1; ifdown wan >/dev/null 2>&1; ubus call network reload >/dev/null 2>&1; /etc/init.d/firewall reload >/dev/null 2>&1; wifi reload; /usr/libexec/be6500-wds-attach) >/tmp/be6500-wds-connect.log 2>&1 &")
        return true, status
    elseif method == "get_wireless_relay_status" then
        return true, { status = ubus_interface("wwan").up and 0 or 1 }
    elseif method == "web_get_wireless_mesh_enable" then return true, { status = 0, enable = 0 }
    elseif method == "set_multi_pppoe" or method == "set_multi_pppoe_operate" then
        return true, { status = 0 }
    end
    return false
end

local function native_method_is_write(method)
    return method:match("^set_") ~= nil
        or method:match("^web_set_") ~= nil
        or method:match("^add_") ~= nil
        or method:match("^web_add_") ~= nil
        or method:match("^del_") ~= nil
        or method:match("^web_del_") ~= nil
        or method:match("^delete_") ~= nil
        or method:match("^web_config_") ~= nil
        or method:match("^web_switch_") ~= nil
end

local function native_method_is_blocked(method)
    return method:match("reboot") ~= nil
        or method:match("factory") ~= nil
        or method:match("upgrade") ~= nil
        or method:match("firmware") ~= nil
        or method:match("ota") ~= nil
        or method:match("password") ~= nil
end

local function call_native_jdcapi(uci, method, args)
    if uci:get("be6500_oem_api", "main", "enabled") == "0" then
        return nil, "native backend disabled"
    end
    if native_method_is_blocked(method) then
        return nil, "protected native method"
    end
    if native_method_is_write(method)
        and uci:get("be6500_oem_api", "main", "allow_native_writes") ~= "1" then
        return nil, "native write pending verification"
    end

    local loaded, ubus = pcall(require, "ubus")
    if not loaded or not ubus then return nil, "ubus module unavailable" end
    local connected, connection = pcall(ubus.connect)
    if not connected or not connection then return nil, "native backend unavailable" end
    local ok, result = pcall(connection.call, connection, "jdcapi.static", method, args or {})
    pcall(connection.close, connection)
    if not ok or type(result) ~= "table" then
        return nil, "native method unavailable"
    end
    return result
end

function action_jdcapi()
    local json = require "luci.jsonc"
    local request = original_json_request(json)
    local params = request.params or {}
    local method, args = params[3] or "", params[4] or {}
    local uci = require("luci.model.uci").cursor()
    ensure_oem_config(uci)
    local payload, code = { status = 0 }, 0
    if method == "get_initialization_info" then
        payload = { model = "RE-CS-06", mesh_role = 0, work_mode_flag = 0,
            initialized = 1, intialized = "1", status = 0 }
    elseif method == "web_get_router_info" then
        payload = { model = "RE-CS-06", product = "JDCloud BE6500",
            mesh_role = 0, work_mode = 0, status = 0 }
    elseif method == "web_get_wireless_mesh_role" then
        payload = { role = 0, mesh_role = 0, status = 0 }
    elseif method == "get_mesh_re_status" then
        payload = { enabled = 0, status = 0 }
    elseif method == "web_get_smart_gaming" or method == "get_game_info" then
        local enabled = uci:get("be6500_oem", "game", "enable") == "1" and 1 or 0
        local port = uci:get("be6500_oem", "game", "port") or "lan2"
        payload = { enabled = enabled, enable = enabled, port = port, status = 0 }
    elseif method == "web_set_smart_gaming" or method == "set_game_info" then
        local enabled = tonumber(args.enable or args.enabled) == 1
        local port = tostring(args.port or "lan2"):lower()
        if not iptv_ports[port] then
            payload = { status = 1, message = "请选择 LAN1、LAN2 或 LAN3 作为游戏口" }
        else
            local iptv_enabled = uci:get("network", "iptv", "be6500_enabled") == "1"
            local conflicts = iptv_enabled and (
                uci:get("network", "iptv", "be6500_stb_port") == port or
                (uci:get("network", "iptv", "be6500_access_mode") == "lan" and
                    uci:get("network", "iptv", "be6500_source_port") == port))
            if enabled and conflicts then
                payload = { status = 1, message = port:upper() .. " 已由 IPTV 使用，请选择其他游戏口" }
            else
                if not uci:get("be6500_oem", "game") then
                    uci:section("be6500_oem", "settings", "game", {})
                end
                uci:set("be6500_oem", "game", "enable", enabled and "1" or "0")
                uci:set("be6500_oem", "game", "port", port)
                if not uci:commit("be6500_oem") then
                    payload = { status = 1, message = "游戏口设置保存失败" }
                else
                    local rc = luci.sys.call("/etc/init.d/be6500-game-port restart >/tmp/be6500-game-port.log 2>&1")
                    payload = rc == 0 and { status = 0, enable = enabled and 1 or 0, enabled = enabled and 1 or 0, port = port,
                        message = "游戏口设置已即时应用" }
                        or { status = 1, message = "游戏口硬件优先级应用失败，请查看系统日志" }
                end
            end
        end
    elseif method == "get_wifi_freq_mode" then
        payload = { mode = tonumber((uci:get("wireless", "main", "freq_mode"))) or 0 }
    elseif method == "web_get_dual_frequency_optimization" then
        payload = { enabled = tonumber((uci:get("wireless", "main", "unified"))) or 0 }
    elseif method == "web_get_wifi6_80211ax" then
        payload = { enabled = tonumber((uci:get("wireless", "main", "wifi5_compatible"))) or 0,
            band = tonumber((uci:get("wireless", "main", "wifi5_band"))) or 0 }
    elseif method == "get_wifi_info" then
        local wifi_type = tonumber(args.type) or 0
        local role = wifi_type % 2 == 1 and "guest" or "main"
        local band_type = role == "guest" and wifi_type - 1 or wifi_type
        local device = radio_device(uci, band_type == 0 and 0 or band_type == 2 and 1 or 2)
        payload = { data = { oem_wifi_data(uci, device, role) } }
    elseif method == "set_wifi" then
        if not oem_set_wifi(uci, args) then payload = { status = 1 } end
    elseif method == "web_set_dual_frequency_optimization" then
        if not uci:get("wireless", "main") then uci:section("wireless", "be6500-profile", "main", {}) end
        uci:set("wireless", "main", "unified", tonumber(args.enable) == 1 and "1" or "0"); uci:commit("wireless")
    elseif method == "web_set_wifi6_80211ax" then
        if not uci:get("wireless", "main") then uci:section("wireless", "be6500-profile", "main", {}) end
        uci:set("wireless", "main", "wifi5_compatible", tonumber(args.enabled) == 1 and "1" or "0")
        uci:set("wireless", "main", "wifi5_band", tostring(args.band or 0))
        local compatible = tonumber(args.enabled) == 1
        local device0, device1, device2 = radio_device(uci, 0), radio_device(uci, 1), radio_device(uci, 2)
        local selected = tonumber(args.band) or 0
        if device0 then uci:set("wireless", device0, "hwmode", "11g"); uci:set("wireless", device0, "htmode", wifi_protocol_htmode(uci, device0, compatible and selected == 0)) end
        if device1 then uci:set("wireless", device1, "hwmode", "11a"); uci:set("wireless", device1, "htmode", wifi_protocol_htmode(uci, device1, compatible and selected == 1)) end
        if device2 then uci:set("wireless", device2, "hwmode", "11a"); uci:set("wireless", device2, "htmode", wifi_protocol_htmode(uci, device2, compatible and selected == 2)) end
        uci:commit("wireless"); luci.sys.call("wifi reload >/dev/null 2>&1 &")
    elseif method == "set_wifi_samessid" then
        local common = args.samessid or {}
        local common_enabled = tostring(common.enable) == "1"
        for index = 0, 2 do
            local device = radio_device(uci, index)
            if device then
                local iface = oem_iface(uci, device, "main")
                local section = iface[".name"]
                if not common_enabled then
                    if section then uci:delete("wireless", section) end
                else
                    section = section or ensure_wifi_iface(uci, device, "main")
                    uci:delete("wireless", section, "disabled")
                    uci:set("wireless", section, "ssid", clean(common.ssid, 32))
                    uci:set("wireless", section, "hidden", tostring(common.hidessid) == "1" and "1" or "0")
                    set_iface_encryption(uci, section, common.encryption)
                    if common.key and common.key ~= "" then uci:set("wireless", section, "key", clean(common.key, 63)) end
                end
            end
        end
        local radios = {}
        if radio_device(uci, 0) then radios[radio_device(uci, 0)] = args.radio_2g end
        if radio_device(uci, 1) then radios[radio_device(uci, 1)] = args.radio_5g end
        if radio_device(uci, 2) then radios[radio_device(uci, 2)] = args.radio_52g end
        for device, radio in pairs(radios) do
            if radio and uci:get("wireless", device) then
                uci:set("wireless", device, "channel", tostring(radio.channel or 0))
                uci:set("wireless", device, "htmode", htmode_from_oem(device, radio.htmode))
                local power = normalize_wifi_power(radio.txpower)
                uci:set("wireless", device, "be6500_power", tostring(power))
                uci:set("wireless", device, "txpower", tostring(wifi_power_dbm(power)))
            end
        end
        if not uci:get("wireless", "main") then uci:section("wireless", "be6500-profile", "main", {}) end
        uci:set("wireless", "main", "unified", "1"); uci:commit("wireless")
        luci.sys.call("wifi reload >/dev/null 2>&1 &"); payload = { status = 0 }
    elseif method == "web_get_wds_config" then
        local _, current = extended_jdcapi(method, args, uci)
        payload = current or { enabled = 0, enable = 0, status = 0 }
    elseif method == "web_get_wireless_mesh_enable" then
        payload = { enable = 0, enabled = 0, status = 0 }
    elseif method == "web_get_credit_mode" then
        payload = { status = 0, mode = uci:get("be6500_oem", "qos", "mode") or "1" }
    elseif method == "get_mesh_topo_map" then payload = { data = {} }
    elseif method == "get_lan_ip" then
        payload = { ipaddr = uci:get("network", "lan", "ipaddr") or "192.168.1.1",
            netmask = uci:get("network", "lan", "netmask") or "255.255.255.0" }
    elseif method == "set_lan_ip" then
        if not valid_ipv4(args.ipaddr) or not valid_ipv4(args.netmask) then
            payload = { status = 11 }
        else
            uci:set("network", "lan", "ipaddr", args.ipaddr); uci:set("network", "lan", "netmask", args.netmask)
            uci:commit("network"); luci.sys.call("ubus call network reload >/dev/null 2>&1 &"); payload = { status = 0 }
        end
    elseif method == "get_lan_dhcp" or method == "get_lan_dhcp_expand" then
        local start = tonumber((uci:get("dhcp", "lan", "start"))) or 100
        local limit = tonumber((uci:get("dhcp", "lan", "limit"))) or 150
        local lease = tostring(uci:get("dhcp", "lan", "leasetime") or "12h")
        local minutes = lease:match("^(%d+)m$") or (tonumber(lease:match("^(%d+)h$")) or 12) * 60
        local dns = uci:get_list("network", "lan", "dns") or {}
        payload = { enable = uci:get("dhcp", "lan", "ignore") == "1" and 0 or 1,
            start = start, ["end"] = math.min(254, start + limit - 1), leasetime = tonumber(minutes),
            gateway = uci:get("network", "lan", "ipaddr") or "192.168.1.1", dns1 = dns[1] or "", dns2 = dns[2] or "" }
    elseif method == "set_lan_dhcp" or method == "set_lan_dhcp_expand" then
        local start = type(args.start) == "table" and tonumber(args.start[#args.start]) or tonumber(args.start)
        local ending = type(args["end"]) == "table" and tonumber(args["end"][#args["end"]]) or tonumber(args["end"])
        if not start or not ending or start < 1 or ending > 254 or ending < start then
            payload = { status = 12 }
        else
            uci:set("dhcp", "lan", "ignore", tostring(args.enable) == "0" and "1" or "0")
            uci:set("dhcp", "lan", "start", tostring(start)); uci:set("dhcp", "lan", "limit", tostring(ending - start + 1))
            local leasetime = tostring(args.leasetime or "720")
            if leasetime:match("^%d+$") then leasetime = leasetime .. "m" end
            uci:set("dhcp", "lan", "leasetime", leasetime)
            set_uci_list(uci, "network", "lan", "dns", { args.dns1, args.dns2 })
            uci:commit("dhcp"); uci:commit("network"); luci.sys.call("/etc/init.d/dnsmasq restart >/dev/null 2>&1 &")
            payload = { status = 0 }
        end
    elseif method == "set_wifi_freq_mode" then
        local mode = tonumber(args.mode)
        if mode ~= 0 and mode ~= 1 then
            payload = { status = 1, message = "invalid radio mode" }
        else
            local rc = luci.sys.call(string.format("/usr/sbin/be6500-switch-wifi-mode %d >/tmp/be6500-switch-wifi-api.log 2>&1", mode))
            local result = trim(luci.sys.exec("tail -n 1 /tmp/be6500-switch-wifi-api.log 2>/dev/null"))
            if rc == 0 then
                payload = { status = 0, reboot = result == "reboot_required" and 1 or 0,
                    apply = result == "reboot_required" and "reboot_required" or
                        (result == "unchanged" and "saved" or "wireless_restart") }
            else
                code, payload = 1, { status = 1, reboot = 0,
                    message = result ~= "" and result or "wireless mode switch failed" }
            end
        end
    else
        local handled, extended_payload, extended_code = extended_jdcapi(method, args, uci)
        if handled then payload, code = extended_payload or { status = 0 }, extended_code or 0
        else
            local native, native_error = call_native_jdcapi(uci, method, args)
            if native then
                payload = native
            else
                code, payload = 1, { status = 1,
                    message = "unsupported: " .. method,
                    backend = native_error }
            end
        end
    end
    json_reply({ jsonrpc = "2.0", id = request.id or 1, result = { code, payload } })
end
