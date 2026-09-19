/*
 * hostapd / IEEE 802.11 authentication (ACL)
 * Copyright (c) 2003-2022, Jouni Malinen <j@w1.fi>
 *
 * This software may be distributed under the terms of the BSD license.
 * See README for more details.
 *
 * Access control list for IEEE 802.11 authentication can uses statically
 * configured ACL from configuration files or an external RADIUS server.
 * Results from external RADIUS queries are cached to allow faster
 * authentication frame processing.
 */

#include "utils/includes.h"

#include <stdio.h>
#include <unistd.h>
#include <fcntl.h>

#include "utils/common.h"
#include "utils/eloop.h"
#include "radius/radius.h"
#include "radius/radius_client.h"
#include "hostapd.h"
#include "ap_config.h"
#include "ap_drv_ops.h"
#include "sta_info.h"
#include "wpa_auth.h"
#include "ieee802_11.h"
#include "ieee802_1x.h"
#include "ieee802_11_auth.h"

#define RADIUS_ACL_TIMEOUT 30

#define WIFI_REJECT_RECORD_FILE "/tmp/wifi_reject.json"
#define WIFI_REJECT_LOCK_FILE "/tmp/wifi_reject.lock"
#define WIFI_REJECT_RECORD_MAX 100

/* utils/json.h conflicts with json-c pulled in by QCA's ucode headers.  The
 * record file is written only by this module, so use a small bounded reader
 * for that fixed format and retain hostapd's escaping helper for writing. */
void json_escape_string(char *txt, size_t maxlen, const char *data, size_t len);

struct wifi_reject_record {
	int used;
	u8 mac[ETH_ALEN];
	u8 bssid[ETH_ALEN];
	u8 ssid[SSID_MAX_LEN];
	size_t ssid_len;
	char ifname[IFNAMSIZ + 1];
	char phy[16];
	char reason[16];
	long long first_seen;
	long long last_seen;
	unsigned int count;
};

static struct wifi_reject_record
	wifi_reject_records[WIFI_REJECT_RECORD_MAX];
static void wifi_reject_write_json(void);

/*
 * There is one hostapd process per radio on this target.  The JSON file, not
 * a process-local static array, is the source of truth: lock it, reload it,
 * merge this actual ACL rejection, then atomically replace it.  This keeps
 * records from every radio and means a LuCI clear cannot be revived from a
 * different hostapd process' stale memory.
 */
static int wifi_reject_lock(void)
{
	struct flock lock;
	int fd;

	fd = open(WIFI_REJECT_LOCK_FILE, O_RDWR | O_CREAT, 0600);
	if (fd < 0)
		return -1;
	os_memset(&lock, 0, sizeof(lock));
	lock.l_type = F_WRLCK;
	lock.l_whence = SEEK_SET;
	if (fcntl(fd, F_SETLKW, &lock) < 0) {
		close(fd);
		return -1;
	}
	return fd;
}

static void wifi_reject_unlock(int fd)
{
	struct flock lock;

	if (fd < 0)
		return;
	os_memset(&lock, 0, sizeof(lock));
	lock.l_type = F_UNLCK;
	lock.l_whence = SEEK_SET;
	(void) fcntl(fd, F_SETLK, &lock);
	close(fd);
}

static const char * wifi_reject_json_value(const char *begin, const char *end,
					   const char *key)
{
	const char *p = begin;
	size_t key_len = os_strlen(key);

	while (p && p < end) {
		p = memchr(p, '"', end - p);
		if (!p || p + key_len + 1 >= end)
			return NULL;
		if (os_memcmp(p + 1, key, key_len) == 0 &&
		    p[1 + key_len] == '"') {
			p += key_len + 2;
			while (p < end && (*p == ' ' || *p == '\t' || *p == '\n'))
				p++;
			if (p < end && *p == ':') {
				p++;
				while (p < end && (*p == ' ' || *p == '\t' || *p == '\n'))
					p++;
				return p;
			}
		}
		p++;
	}
	return NULL;
}

static int wifi_reject_json_hex(char c)
{
	if (c >= '0' && c <= '9')
		return c - '0';
	if (c >= 'a' && c <= 'f')
		return c - 'a' + 10;
	if (c >= 'A' && c <= 'F')
		return c - 'A' + 10;
	return -1;
}

static int wifi_reject_json_read_string(const char *begin, const char *end,
					const char *key, char *out, size_t out_len)
{
	const char *p = wifi_reject_json_value(begin, end, key);
	size_t used = 0;

	if (!p || p >= end || *p != '"' || !out || out_len < 1)
		return -1;
	p++;
	while (p < end && *p != '"') {
		char c = *p++;

		if (c == '\\') {
			if (p >= end)
				return -1;
			c = *p++;
			switch (c) {
			case 'b': c = '\b'; break;
			case 'f': c = '\f'; break;
			case 'n': c = '\n'; break;
			case 'r': c = '\r'; break;
			case 't': c = '\t'; break;
			case 'u': {
				int hi, lo;
				if (p + 4 > end)
					return -1;
				hi = wifi_reject_json_hex(p[2]);
				lo = wifi_reject_json_hex(p[3]);
				if (p[0] != '0' || p[1] != '0' || hi < 0 || lo < 0)
					return -1;
				c = (char) ((hi << 4) | lo);
				p += 4;
				break;
			}
			case '"': case '\\': case '/': break;
			default:
				return -1;
			}
		}
		if (used + 1 >= out_len)
			return -1;
		out[used++] = c;
	}
	if (p >= end)
		return -1;
	out[used] = '\0';
	return 0;
}

static int wifi_reject_json_number(const char *begin, const char *end,
				   const char *key, long long *out)
{
	const char *p = wifi_reject_json_value(begin, end, key);
	char *tail;

	if (!p || p >= end || !out)
		return -1;
	*out = strtoll(p, &tail, 10);
	return tail != p && tail <= end ? 0 : -1;
}

static const char * wifi_reject_json_object_end(const char *begin,
						 const char *end)
{
	const char *p;
	int depth = 0, quoted = 0, escaped = 0;

	for (p = begin; p < end; p++) {
		if (quoted) {
			if (escaped)
				escaped = 0;
			else if (*p == '\\')
				escaped = 1;
			else if (*p == '"')
				quoted = 0;
			continue;
		}
		if (*p == '"')
			quoted = 1;
		else if (*p == '{')
			depth++;
		else if (*p == '}' && --depth == 0)
			return p;
	}
	return NULL;
}

static void wifi_reject_load_json(void)
{
	char *data, mac[18], ssid[SSID_MAX_LEN + 1], bssid[18];
	const char *cursor, *end, *object_end;
	size_t data_len;
	int index = 0;

	os_memset(wifi_reject_records, 0, sizeof(wifi_reject_records));
	data = os_readfile(WIFI_REJECT_RECORD_FILE, &data_len);
	if (!data || data_len > 65536) {
		os_free(data);
		return;
	}
	cursor = data;
	end = data + data_len;
	while (cursor < end && index < WIFI_REJECT_RECORD_MAX) {
		struct wifi_reject_record *record;
		long long value;

		cursor = memchr(cursor, '{', end - cursor);
		if (!cursor)
			break;
		object_end = wifi_reject_json_object_end(cursor, end);
		if (!object_end)
			break;
		if (wifi_reject_json_read_string(cursor, object_end, "mac", mac,
					    sizeof(mac)) ||
		    wifi_reject_json_read_string(cursor, object_end, "ssid", ssid,
					    sizeof(ssid)) ||
		    hwaddr_aton(mac, wifi_reject_records[index].mac) < 0) {
			cursor = object_end + 1;
			continue;
		}

		record = &wifi_reject_records[index++];
		record->used = 1;
		record->ssid_len = os_strlen(ssid);
		os_memcpy(record->ssid, ssid, record->ssid_len);
		if (!wifi_reject_json_read_string(cursor, object_end, "bssid", bssid,
					     sizeof(bssid)))
			(void) hwaddr_aton(bssid, record->bssid);
		(void) wifi_reject_json_read_string(cursor, object_end, "ifname",
					      record->ifname, sizeof(record->ifname));
		(void) wifi_reject_json_read_string(cursor, object_end, "phy",
					      record->phy, sizeof(record->phy));
		(void) wifi_reject_json_read_string(cursor, object_end, "reason",
					      record->reason, sizeof(record->reason));
		record->first_seen = !wifi_reject_json_number(cursor, object_end,
						       "first_seen", &value) ? value : 0;
		record->last_seen = !wifi_reject_json_number(cursor, object_end,
						      "last_seen", &value) ? value : record->first_seen;
		record->count = !wifi_reject_json_number(cursor, object_end, "count",
						  &value) && value > 0 ?
			(unsigned int) value : 1;
		cursor = object_end + 1;
	}
	os_free(data);
}

static void wifi_reject_json_string(FILE *f, const void *data, size_t len)
{
	char escaped[SSID_MAX_LEN * 6 + 1];

	json_escape_string(escaped, sizeof(escaped), data, len);
	fprintf(f, "\"%s\"", escaped);
}

static void wifi_reject_write_json(void)
{
	char tmp[sizeof(WIFI_REJECT_RECORD_FILE) + 32];
	FILE *f;
	int i, first = 1;

	os_snprintf(tmp, sizeof(tmp), "%s.tmp.%ld", WIFI_REJECT_RECORD_FILE,
		    (long) getpid());
	f = fopen(tmp, "w");
	if (!f)
		return;

	fputs("[", f);
	for (i = 0; i < WIFI_REJECT_RECORD_MAX; i++) {
		struct wifi_reject_record *record = &wifi_reject_records[i];
		if (!record->used)
			continue;
		if (!first)
			fputs(",", f);
		first = 0;

		fprintf(f, "{\"mac\":\"" MACSTR "\",\"ssid\":",
			MAC2STR(record->mac));
		wifi_reject_json_string(f, record->ssid, record->ssid_len);
		fputs(",\"ifname\":", f);
		wifi_reject_json_string(f, record->ifname,
					os_strlen(record->ifname));
		fputs(",\"phy\":", f);
		wifi_reject_json_string(f, record->phy,
					os_strlen(record->phy));
		fprintf(f, ",\"bssid\":\"" MACSTR "\",\"reason\":",
			MAC2STR(record->bssid));
		wifi_reject_json_string(f, record->reason,
					os_strlen(record->reason));
		fprintf(f, ",\"first_seen\":%lld,\"last_seen\":%lld,\"count\":%u}",
			record->first_seen, record->last_seen, record->count);
	}
	fputs("]\n", f);
	if (fclose(f) < 0) {
		unlink(tmp);
		return;
	}
	if (rename(tmp, WIFI_REJECT_RECORD_FILE) < 0)
		unlink(tmp);
}

static const char * wifi_reject_acl_reason(struct hostapd_data *hapd,
					    const u8 *addr)
{
	int mode, in_accept, in_deny;

	if (!hapd || !hapd->conf || !addr)
		return NULL;
	mode = hapd->conf->macaddr_acl;
	in_accept = hostapd_acl_maclist_found(hapd->conf, true, addr, NULL);
	in_deny = hostapd_acl_maclist_found(hapd->conf, false, addr, NULL);

	/* Mirror hostapd_check_acl() ordering exactly so the recorded reason is
	 * the branch that actually rejected this Authentication/Association. */
	if (mode == ACCEPT_IF_WHITELIST_AND_NOT_BLACKLIST) {
		if (!in_accept)
			return "mac_whitelist";
		if (in_deny)
			return "mac_blacklist";
		return NULL;
	}
	if (in_accept)
		return NULL;
	if (in_deny)
		return "mac_blacklist";
	if (mode == DENY_UNLESS_ACCEPTED)
		return "mac_whitelist";

	return NULL;
}

static void wifi_reject_record(struct hostapd_data *hapd, const u8 *addr,
			       const char *reason)
{
	struct wifi_reject_record *record = NULL;
	struct os_time now;
	int fd, i, free_index = -1, oldest_index = -1;
	long long oldest_seen = 0;
	size_t ssid_len;

	if (!hapd || !hapd->conf || !hapd->iface || !addr || !reason ||
	    os_get_time(&now) < 0)
		return;

	ssid_len = hapd->conf->ssid.ssid_len;
	if (ssid_len > SSID_MAX_LEN)
		ssid_len = SSID_MAX_LEN;

	fd = wifi_reject_lock();
	if (fd < 0)
		return;
	wifi_reject_load_json();

	for (i = 0; i < WIFI_REJECT_RECORD_MAX; i++) {
		struct wifi_reject_record *candidate = &wifi_reject_records[i];

		if (!candidate->used) {
			if (free_index < 0)
				free_index = i;
			continue;
		}
		if (ether_addr_equal(candidate->mac, addr) &&
		    candidate->ssid_len == ssid_len &&
		    os_memcmp(candidate->ssid, hapd->conf->ssid.ssid,
			       ssid_len) == 0) {
			record = candidate;
			break;
		}
		if (oldest_index < 0 || candidate->last_seen < oldest_seen) {
			oldest_index = i;
			oldest_seen = candidate->last_seen;
		}
	}

	if (record) {
		record->last_seen = now.sec;
		os_strlcpy(record->reason, reason, sizeof(record->reason));
		if (record->count != (unsigned int) -1)
			record->count++;
		wifi_reject_write_json();
		wifi_reject_unlock(fd);
		return;
	}

	if (free_index < 0)
		free_index = oldest_index;
	if (free_index < 0) {
		wifi_reject_unlock(fd);
		return;
	}

	record = &wifi_reject_records[free_index];
	os_memset(record, 0, sizeof(*record));
	record->used = 1;
	os_memcpy(record->mac, addr, ETH_ALEN);
	os_memcpy(record->bssid, hapd->own_addr, ETH_ALEN);
	os_memcpy(record->ssid, hapd->conf->ssid.ssid, ssid_len);
	record->ssid_len = ssid_len;
	os_strlcpy(record->ifname, hapd->conf->iface,
		   sizeof(record->ifname));
	os_strlcpy(record->phy, hapd->iface->phy, sizeof(record->phy));
	os_strlcpy(record->reason, reason, sizeof(record->reason));
	record->first_seen = now.sec;
	record->last_seen = now.sec;
	record->count = 1;
	wifi_reject_write_json();
	wifi_reject_unlock(fd);
}


struct hostapd_cached_radius_acl {
	struct os_reltime timestamp;
	macaddr addr;
	int accepted; /* HOSTAPD_ACL_* */
	struct hostapd_cached_radius_acl *next;
	struct radius_sta info;
};


struct hostapd_acl_query_data {
	struct os_reltime timestamp;
	u8 radius_id;
	macaddr addr;
	u8 *auth_msg; /* IEEE 802.11 authentication frame from station */
	size_t auth_msg_len;
	struct hostapd_acl_query_data *next;
	bool radius_psk;
	int akm;
	u8 *anonce;
	u8 *eapol;
	size_t eapol_len;
};


#ifndef CONFIG_NO_RADIUS
static void hostapd_acl_cache_free_entry(struct hostapd_cached_radius_acl *e)
{
	os_free(e->info.identity);
	os_free(e->info.radius_cui);
	hostapd_free_psk_list(e->info.psk);
	os_free(e);
}


static void hostapd_acl_cache_free(struct hostapd_cached_radius_acl *acl_cache)
{
	struct hostapd_cached_radius_acl *prev;

	while (acl_cache) {
		prev = acl_cache;
		acl_cache = acl_cache->next;
		hostapd_acl_cache_free_entry(prev);
	}
}


static int hostapd_acl_cache_get(struct hostapd_data *hapd, const u8 *addr,
				 struct radius_sta *out)
{
	struct hostapd_cached_radius_acl *entry;
	struct os_reltime now;

	os_get_reltime(&now);

	for (entry = hapd->acl_cache; entry; entry = entry->next) {
		if (!ether_addr_equal(entry->addr, addr))
			continue;

		if (os_reltime_expired(&now, &entry->timestamp,
				       RADIUS_ACL_TIMEOUT))
			return -1; /* entry has expired */
		*out = entry->info;

		return entry->accepted;
	}

	return -1;
}
#endif /* CONFIG_NO_RADIUS */


static void hostapd_acl_query_free(struct hostapd_acl_query_data *query)
{
	if (!query)
		return;
	os_free(query->auth_msg);
	os_free(query->anonce);
	os_free(query->eapol);
	os_free(query);
}


#ifndef CONFIG_NO_RADIUS
static int hostapd_radius_acl_query(struct hostapd_data *hapd, const u8 *addr,
				    struct hostapd_acl_query_data *query)
{
	struct radius_msg *msg;
	char buf[128];

	query->radius_id = radius_client_get_id(hapd->radius);
	msg = radius_msg_new(RADIUS_CODE_ACCESS_REQUEST, query->radius_id);
	if (!msg)
		return -1;

	if (radius_msg_make_authenticator(msg) < 0) {
		wpa_printf(MSG_INFO, "Could not make Request Authenticator");
		goto fail;
	}

	if (!radius_msg_add_msg_auth(msg))
		goto fail;

	os_snprintf(buf, sizeof(buf), RADIUS_ADDR_FORMAT, MAC2STR(addr));
	if (!radius_msg_add_attr(msg, RADIUS_ATTR_USER_NAME, (u8 *) buf,
				 os_strlen(buf))) {
		wpa_printf(MSG_DEBUG, "Could not add User-Name");
		goto fail;
	}

	if (!radius_msg_add_attr_user_password(
		    msg, (u8 *) buf, os_strlen(buf),
		    hapd->conf->radius->auth_server->shared_secret,
		    hapd->conf->radius->auth_server->shared_secret_len)) {
		wpa_printf(MSG_DEBUG, "Could not add User-Password");
		goto fail;
	}

	if (add_common_radius_attr(hapd, hapd->conf->radius_auth_req_attr,
				   NULL, msg) < 0)
		goto fail;

	os_snprintf(buf, sizeof(buf), RADIUS_802_1X_ADDR_FORMAT,
		    MAC2STR(addr));
	if (!radius_msg_add_attr(msg, RADIUS_ATTR_CALLING_STATION_ID,
				 (u8 *) buf, os_strlen(buf))) {
		wpa_printf(MSG_DEBUG, "Could not add Calling-Station-Id");
		goto fail;
	}

	os_snprintf(buf, sizeof(buf), "CONNECT 11Mbps 802.11b");
	if (!radius_msg_add_attr(msg, RADIUS_ATTR_CONNECT_INFO,
				 (u8 *) buf, os_strlen(buf))) {
		wpa_printf(MSG_DEBUG, "Could not add Connect-Info");
		goto fail;
	}

	if (query->akm &&
	    !radius_msg_add_attr_int32(msg, RADIUS_ATTR_WLAN_AKM_SUITE,
				       wpa_akm_to_suite(query->akm))) {
		wpa_printf(MSG_DEBUG, "Could not add WLAN-AKM-Suite");
		goto fail;
	}

	if (query->anonce &&
	    !radius_msg_add_ext_vs(msg, RADIUS_ATTR_EXT_VENDOR_SPECIFIC_5,
				   RADIUS_VENDOR_ID_FREERADIUS,
				   RADIUS_VENDOR_ATTR_FREERADIUS_802_1X_ANONCE,
				   query->anonce, WPA_NONCE_LEN)) {
		wpa_printf(MSG_DEBUG, "Could not add FreeRADIUS-802.1X-Anonce");
		goto fail;
	}

	if (query->eapol &&
	    !radius_msg_add_ext_vs(msg, RADIUS_ATTR_EXT_VENDOR_SPECIFIC_5,
				   RADIUS_VENDOR_ID_FREERADIUS,
				   RADIUS_VENDOR_ATTR_FREERADIUS_802_1X_EAPOL_KEY_MSG,
				   query->eapol, query->eapol_len)) {
		wpa_printf(MSG_DEBUG, "Could not add FreeRADIUS-802.1X-EAPoL-Key-Msg");
		goto fail;
	}

	if (radius_client_send(hapd->radius, msg, RADIUS_AUTH, addr) < 0)
		goto fail;
	return 0;

 fail:
	radius_msg_free(msg);
	return -1;
}
#endif /* CONFIG_NO_RADIUS */

/**
 * hostapd_check_acl_deny_with_timed_allow - Check ACL with timed allow window
 * @hapd: hostapd BSS data
 * @addr: MAC address of the STA
 * @vlan_id:  vlan id
 * Returns: HOSTAPD_ACL_ACCEPT or HOSTAPD_ACL_REJECT
 *
 * Mode 4: STAs not in the deny list are always accepted.
 * STAs in the deny list go through a two-phase timer:
 *   Phase 1 (deny):  reject for acl_deny_wait_time seconds.
 *   Phase 2 (allow): accept for acl_deny_allow_time seconds.
 * The timer starts on the STA's first connection attempt after being
 * blacklisted. After the allow phase expires, the next connection attempt
 * resets the entry back to Phase 1.
 */
static int hostapd_check_acl_deny_with_timed_allow(struct hostapd_data *hapd,
						   const u8 *addr,
						   struct vlan_description *vlan_id)
{
	struct acl_timed_deny_entry *entry;
	struct os_reltime now;
	unsigned int deny_duration, allow_duration;
	bool deny_phase_expired, allow_phase_expired;

	/* Check if STA is in the deny list */
	if (!hostapd_acl_maclist_found(hapd->conf, false, addr, vlan_id))
		return HOSTAPD_ACL_ACCEPT;

	os_get_reltime(&now);
	deny_duration = hapd->conf->acl_deny_wait_time;
	allow_duration = hapd->conf->acl_deny_allow_time;

	/* Search for existing timing state for this STA */
	for (entry = hapd->conf->acl_timed_deny_list; entry;
	     entry = entry->next) {
		if (ether_addr_equal(entry->addr, addr))
			break;
	}

	if (!entry) {
		/* First connection attempt: create entry and start deny
		 * phase */
		entry = os_zalloc(sizeof(*entry));
		if (!entry)
			return HOSTAPD_ACL_REJECT;

		os_memcpy(entry->addr, addr, ETH_ALEN);
		entry->phase_start = now;
		entry->in_allow_phase = false;
		entry->next = hapd->conf->acl_timed_deny_list;
		hapd->conf->acl_timed_deny_list = entry;

		wpa_printf(MSG_DEBUG,
			   "ACL: " MACSTR " entered deny phase (%u s)",
			   MAC2STR(addr), deny_duration);
		return HOSTAPD_ACL_REJECT;
	}

	/* Entry exists - check current phase and timing */
	if (!entry->in_allow_phase) {
		/* Currently in deny phase */
		deny_phase_expired = os_reltime_expired(&now, &entry->phase_start,
							deny_duration);

		if (!deny_phase_expired)
			return HOSTAPD_ACL_REJECT;

		/* Deny phase complete - transition to allow phase */
		entry->in_allow_phase = true;
		entry->phase_start = now;
		wpa_printf(MSG_DEBUG,
			   "ACL: " MACSTR " entered allow phase (%u s)",
			   MAC2STR(addr), allow_duration);
		return HOSTAPD_ACL_ACCEPT;
	}

	/* Currently in allow phase */
	allow_phase_expired = os_reltime_expired(&now, &entry->phase_start,
						 allow_duration);

	if (!allow_phase_expired)
		return HOSTAPD_ACL_ACCEPT;

	/* Allow phase complete - restart deny phase */
	entry->phase_start = now;
	entry->in_allow_phase = false;
	wpa_printf(MSG_DEBUG,
		   "ACL: " MACSTR " re-entered deny phase (%u s)",
		   MAC2STR(addr), deny_duration);
	return HOSTAPD_ACL_REJECT;
}

/**
 * hostapd_check_acl - Check a specified STA against accept/deny ACLs
 * @hapd: hostapd BSS data
 * @addr: MAC address of the STA
 * @vlan_id: Buffer for returning VLAN ID
 * Returns: HOSTAPD_ACL_ACCEPT, HOSTAPD_ACL_REJECT, or HOSTAPD_ACL_PENDING
 */
int hostapd_check_acl(struct hostapd_data *hapd, const u8 *addr,
		      struct vlan_description *vlan_id)
{
	int in_accept, in_deny;
#ifdef CONFIG_WPS
	/* According to WPS spec 2.0, disable MAC address filtering
	 * if WPS is active on the AP.
	 */
	if (hapd->wps_stats.pbc_status == WPS_PBC_STATUS_ACTIVE)
		 return HOSTAPD_ACL_ACCEPT;
#endif /*CONFIG_WPS */

	if (hapd->conf->macaddr_acl == ACCEPT_IF_WHITELIST_AND_NOT_BLACKLIST) {
		in_accept = hostapd_acl_maclist_found(hapd->conf, true,
						      addr, vlan_id);
		if (!in_accept)
			return HOSTAPD_ACL_REJECT;

		in_deny = hostapd_acl_maclist_found(hapd->conf, false,
						    addr, vlan_id);
		if (in_deny)
			return HOSTAPD_ACL_REJECT;

		return HOSTAPD_ACL_ACCEPT;
	}

	if (hapd->conf->macaddr_acl == DENY_WITH_TIMED_ALLOW_WINDOW)
		return hostapd_check_acl_deny_with_timed_allow(hapd, addr,
							       vlan_id);

	if (hostapd_acl_maclist_found(hapd->conf, true, addr, vlan_id))
		return HOSTAPD_ACL_ACCEPT;

	if (hostapd_acl_maclist_found(hapd->conf, false, addr, vlan_id))
		return HOSTAPD_ACL_REJECT;

	if (hapd->iface->drv_flags == WPA_DRIVER_FLAGS_WIRED)
	{
		return HOSTAPD_ACL_PENDING;
	}

	if (hapd->conf->macaddr_acl == ACCEPT_UNLESS_DENIED)
		return HOSTAPD_ACL_ACCEPT;
	if (hapd->conf->macaddr_acl == DENY_UNLESS_ACCEPTED)
		return HOSTAPD_ACL_REJECT;

	return HOSTAPD_ACL_PENDING;
}


/**
 * hostapd_allowed_address - Check whether a specified STA can be authenticated
 * @hapd: hostapd BSS data
 * @addr: MAC address of the STA
 * @msg: Authentication message
 * @len: Length of msg in octets
 * @out.session_timeout: Buffer for returning session timeout (from RADIUS)
 * @out.acct_interim_interval: Buffer for returning account interval (from
 *	RADIUS)
 * @out.vlan_id: Buffer for returning VLAN ID
 * @out.psk: Linked list buffer for returning WPA PSK
 * @out.identity: Buffer for returning identity (from RADIUS)
 * @out.radius_cui: Buffer for returning CUI (from RADIUS)
 * @is_probe_req: Whether this query for a Probe Request frame
 * Returns: HOSTAPD_ACL_ACCEPT, HOSTAPD_ACL_REJECT, or HOSTAPD_ACL_PENDING
 *
 * The caller is responsible for properly cloning the returned out->identity and
 * out->radius_cui and out->psk values.
 */
int hostapd_allowed_address(struct hostapd_data *hapd, const u8 *addr,
			    const u8 *msg, size_t len, struct radius_sta *out,
			    int is_probe_req)
{
	int res;
	const char *reject_reason;

	os_memset(out, 0, sizeof(*out));

	res = hostapd_check_acl(hapd, addr, &out->vlan_id);
	/*
	 * Record only a real Authentication/Association management frame.  A
	 * probe request and internal ACL re-checks pass through this function too,
	 * but must not create a Wi-Fi ACL rejection record.
	 */
	if (res == HOSTAPD_ACL_REJECT && msg && !is_probe_req) {
		reject_reason = wifi_reject_acl_reason(hapd, addr);
		if (reject_reason)
			wifi_reject_record(hapd, addr, reject_reason);
	}
	if (res != HOSTAPD_ACL_PENDING)
		return res;

	if (hapd->conf->macaddr_acl == USE_EXTERNAL_RADIUS_AUTH) {
#ifdef CONFIG_NO_RADIUS
		return HOSTAPD_ACL_REJECT;
#else /* CONFIG_NO_RADIUS */
		struct hostapd_acl_query_data *query;

		if (is_probe_req) {
			/* Skip RADIUS queries for Probe Request frames to avoid
			 * excessive load on the authentication server. */
			return HOSTAPD_ACL_ACCEPT;
		};

		if (hapd->conf->ssid.dynamic_vlan == DYNAMIC_VLAN_DISABLED)
			os_memset(&out->vlan_id, 0, sizeof(out->vlan_id));

		/* Check whether ACL cache has an entry for this station */
		res = hostapd_acl_cache_get(hapd, addr, out);
		if (res == HOSTAPD_ACL_ACCEPT ||
		    res == HOSTAPD_ACL_ACCEPT_TIMEOUT)
			return res;
		if (res == HOSTAPD_ACL_REJECT)
			return HOSTAPD_ACL_REJECT;

		query = hapd->acl_queries;
		while (query) {
			if (ether_addr_equal(query->addr, addr)) {
				/* pending query in RADIUS retransmit queue;
				 * do not generate a new one */
				return HOSTAPD_ACL_PENDING;
			}
			query = query->next;
		}

		if (!hapd->conf->radius->auth_server)
			return HOSTAPD_ACL_REJECT;

		/* No entry in the cache - query external RADIUS server */
		query = os_zalloc(sizeof(*query));
		if (!query) {
			wpa_printf(MSG_ERROR, "ACL : malloc for query data failed");
			return HOSTAPD_ACL_REJECT;
		}
		os_get_reltime(&query->timestamp);
		os_memcpy(query->addr, addr, ETH_ALEN);
		if (hostapd_radius_acl_query(hapd, addr, query)) {
			wpa_printf(MSG_DEBUG,
				   "ACL : Failed to send Access-Request for ACL query.");
			hostapd_acl_query_free(query);
			return HOSTAPD_ACL_REJECT;
		}

		query->auth_msg = os_memdup(msg, len);
		if (!query->auth_msg) {
			wpa_printf(MSG_ERROR,
				   "ACL : Failed to allocate memory for auth frame.");
			hostapd_acl_query_free(query);
			return HOSTAPD_ACL_REJECT;
		}
		query->auth_msg_len = len;
		query->next = hapd->acl_queries;
		hapd->acl_queries = query;

		/* Queued data will be processed in hostapd_acl_recv_radius()
		 * when RADIUS server replies to the sent Access-Request. */
		return HOSTAPD_ACL_PENDING;
#endif /* CONFIG_NO_RADIUS */
	}

	return HOSTAPD_ACL_REJECT;
}

/**
 * hostapd_check_ml_acl - Check a specified STA against accept/deny ACLs in
 * 			that mld AP
 * @hapd: hostapd BSS data
 * @addr: MAC address of the STA
 * Returns: HOSTAPD_ACL_ACCEPT, HOSTAPD_ACL_REJECT, or HOSTAPD_ACL_PENDING
 */

int hostapd_check_ml_acl(struct hostapd_data *hapd, struct sta_info *sta)
{
#ifdef CONFIG_IEEE80211BE
	struct hostapd_data *tmp_hapd;
	int acl_res, acl_res_linkaddr, accept = 0;

	if (!ap_sta_is_mld(hapd, sta)) {
		if (hostapd_check_acl(hapd, sta->addr, NULL) != HOSTAPD_ACL_ACCEPT) {
			wpa_printf(MSG_INFO, "ACL : STA " MACSTR " not allowed to connect",
				   MAC2STR(sta->addr));
			return HOSTAPD_ACL_REJECT;
		}
		return HOSTAPD_ACL_ACCEPT;
	}


        for_each_mld_link(tmp_hapd, hapd) {
                struct mld_link_info *link;


                link = &sta->mld_info.links[tmp_hapd->mld_link_id];
		if (!link->valid)
			continue;

		acl_res = hostapd_check_acl(tmp_hapd, sta->addr, NULL);
		acl_res_linkaddr = hostapd_check_acl(tmp_hapd, link->peer_addr, NULL);

		/* For DENY_WITH_TIMED_ALLOW_WINDOW mode, hostapd_check_acl()
		 * already returns the final decision based on deny list and
		 * timing state. Reject if any MAC is rejected. */
		if (hapd->conf->macaddr_acl == DENY_WITH_TIMED_ALLOW_WINDOW) {
			if (acl_res == HOSTAPD_ACL_REJECT) {
				wpa_printf(MSG_INFO,
					   "ACL : STA " MACSTR " not allowed to connect (timed deny)",
					   MAC2STR(sta->addr));
				return HOSTAPD_ACL_REJECT;
			}
			if (acl_res_linkaddr == HOSTAPD_ACL_REJECT) {
				wpa_printf(MSG_INFO,
					   "ACL : link addr " MACSTR " not allowed to connect (timed deny)",
					   MAC2STR(link->peer_addr));
				return HOSTAPD_ACL_REJECT;
			}
			continue;
		}

		/* For ACCEPT_IF_WHITELIST_AND_NOT_BLACKLIST mode, track if any
		 * link is accepted. Also check if address is in blacklist on any link. */
		if (hapd->conf->macaddr_acl == ACCEPT_IF_WHITELIST_AND_NOT_BLACKLIST) {
			/* Check if MLD address is in blacklist on this link */
			if (hostapd_maclist_found(tmp_hapd->conf->deny_mac,
						  tmp_hapd->conf->num_deny_mac,
						  sta->addr, NULL)) {
				wpa_printf(MSG_INFO,
					   "ACL : STA " MACSTR " in blacklist on link %d",
					   MAC2STR(sta->addr), tmp_hapd->mld_link_id);
				return HOSTAPD_ACL_REJECT;
			}
			/* Check if link address is in blacklist on this link */
			if (hostapd_maclist_found(tmp_hapd->conf->deny_mac,
						  tmp_hapd->conf->num_deny_mac,
						  link->peer_addr, NULL)) {
				wpa_printf(MSG_INFO,
					   "ACL : link addr " MACSTR " in blacklist on link %d",
					   MAC2STR(link->peer_addr), tmp_hapd->mld_link_id);
				return HOSTAPD_ACL_REJECT;
			}
			/* If either MLD address or link address is in whitelist, mark it */
			if (acl_res == HOSTAPD_ACL_ACCEPT ||
			    acl_res_linkaddr == HOSTAPD_ACL_ACCEPT) {
				wpa_printf(MSG_DEBUG, "ACL : MLD addr or link addr found in whitelist on link %d", tmp_hapd->mld_link_id);
				accept = 1;
			}
			continue;
		}

		if (hapd->conf->macaddr_acl == ACCEPT_UNLESS_DENIED &&
		    acl_res != HOSTAPD_ACL_ACCEPT) {
			wpa_printf(MSG_INFO, "ACL : STA " MACSTR
				   " not allowed to connect",
				   MAC2STR(sta->addr));
			return HOSTAPD_ACL_REJECT;
		}

		if (hapd->conf->macaddr_acl == ACCEPT_UNLESS_DENIED &&
		    acl_res_linkaddr != HOSTAPD_ACL_ACCEPT) {
			wpa_printf(MSG_INFO, "ACL : link addr" MACSTR
				   " not allowed to connect",
				   MAC2STR(link->peer_addr));
			return HOSTAPD_ACL_REJECT;
		}

		if (hapd->conf->macaddr_acl == DENY_UNLESS_ACCEPTED &&
		    (acl_res_linkaddr != HOSTAPD_ACL_REJECT ||
		     acl_res != HOSTAPD_ACL_REJECT)) {
			wpa_printf(MSG_DEBUG, "ACL : Accepted via link addr or MLD addr on link %d", tmp_hapd->mld_link_id);
			accept = 1;
			break;
		}

        }

	if ((hapd->conf->macaddr_acl == ACCEPT_IF_WHITELIST_AND_NOT_BLACKLIST ||
	     hapd->conf->macaddr_acl == DENY_UNLESS_ACCEPTED) && !accept) {
		wpa_printf(MSG_INFO, "ACL : STA " MACSTR " not accepted on any link",
			   MAC2STR(sta->addr));
		return HOSTAPD_ACL_REJECT;
	}

#endif /* CONFIG_IEEE80211BE */
     return HOSTAPD_ACL_ACCEPT;
}

#ifndef CONFIG_NO_RADIUS

/**
 * ACL cache and queries expiration for specific wired station
 */
void hostapd_acl_expire_sta(struct hostapd_data *hapd,
		const u8 *addr)
{
	struct hostapd_cached_radius_acl *prev, *entry, *tmp;
	struct hostapd_acl_query_data *prev_query, *entry_query, *tmp_query;

	prev = NULL;
	entry = hapd->acl_cache;

	while (entry) {
		if (os_memcmp(entry->addr, addr, ETH_ALEN) == 0) {
			wpa_printf(MSG_DEBUG, "Flush Cached ACL entry for " MACSTR,
						MAC2STR(entry->addr));
			if (prev)
				prev->next = entry->next;
			else
				hapd->acl_cache = entry->next;
			hostapd_drv_set_radius_acl_expire(hapd, entry->addr);
			tmp = entry;
			entry = entry->next;
			hostapd_acl_cache_free_entry(tmp);
			break;
		}

		prev = entry;
		entry = entry->next;
	}

	prev_query = NULL;
	entry_query = hapd->acl_queries;

	while (entry_query) {
		if (os_memcmp(entry_query->addr, addr, ETH_ALEN) == 0) {
			wpa_printf(MSG_DEBUG, "Flush ACL query for " MACSTR,
						MAC2STR(entry_query->addr));
			if (prev_query)
				prev_query->next = entry_query->next;
			else
				hapd->acl_queries = entry_query->next;

			tmp_query = entry_query;
			entry_query = entry_query->next;
			hostapd_acl_query_free(tmp_query);
			break;
		}

		prev_query = entry_query;
		entry_query = entry_query->next;
	}
}

static void hostapd_acl_expire_cache(struct hostapd_data *hapd,
				     struct os_reltime *now)
{
	struct hostapd_cached_radius_acl *prev, *entry, *tmp;

	prev = NULL;
	entry = hapd->acl_cache;

	while (entry) {
		if (os_reltime_expired(now, &entry->timestamp,
				       RADIUS_ACL_TIMEOUT)) {
			wpa_printf(MSG_DEBUG, "Cached ACL entry for " MACSTR
				   " has expired.", MAC2STR(entry->addr));
			if (prev)
				prev->next = entry->next;
			else
				hapd->acl_cache = entry->next;
			hostapd_drv_set_radius_acl_expire(hapd, entry->addr);
			tmp = entry;
			entry = entry->next;
			hostapd_acl_cache_free_entry(tmp);
			continue;
		}

		prev = entry;
		entry = entry->next;
	}
}


static void hostapd_acl_expire_queries(struct hostapd_data *hapd,
				       struct os_reltime *now)
{
	struct hostapd_acl_query_data *prev, *entry, *tmp;

	prev = NULL;
	entry = hapd->acl_queries;

	while (entry) {
		if (os_reltime_expired(now, &entry->timestamp,
				       RADIUS_ACL_TIMEOUT)) {
			wpa_printf(MSG_DEBUG, "ACL query for " MACSTR
				   " has expired.", MAC2STR(entry->addr));
			if (prev)
				prev->next = entry->next;
			else
				hapd->acl_queries = entry->next;

			tmp = entry;
			entry = entry->next;
			hostapd_acl_query_free(tmp);
			continue;
		}

		prev = entry;
		entry = entry->next;
	}
}


/**
 * hostapd_acl_expire - ACL cache expiration callback
 * @hapd: struct hostapd_data *
 */
void hostapd_acl_expire(struct hostapd_data *hapd)
{
	struct os_reltime now;

	os_get_reltime(&now);
	hostapd_acl_expire_cache(hapd, &now);
	hostapd_acl_expire_queries(hapd, &now);
}


static void decode_tunnel_passwords(struct hostapd_data *hapd,
				    const u8 *shared_secret,
				    size_t shared_secret_len,
				    struct radius_msg *msg,
				    struct radius_msg *req,
				    struct hostapd_cached_radius_acl *cache)
{
	int passphraselen;
	char *passphrase;
	size_t i;
	struct hostapd_sta_wpa_psk_short *psk;

	/*
	 * Decode all tunnel passwords as PSK and save them into a linked list.
	 */
	for (i = 0; ; i++) {
		passphrase = radius_msg_get_tunnel_password(
			msg, &passphraselen, shared_secret, shared_secret_len,
			req, i);
		/*
		 * Passphrase is NULL iff there is no i-th Tunnel-Password
		 * attribute in msg.
		 */
		if (!passphrase)
			break;

		/*
		 * Passphase should be 8..63 chars (to be hashed with SSID)
		 * or 64 chars hex string (no separate hashing with SSID).
		 */

		if (passphraselen < MIN_PASSPHRASE_LEN ||
		    passphraselen > MAX_PASSPHRASE_LEN + 1)
			goto free_pass;

		/*
		 * passphrase does not contain the NULL termination.
		 * Add it here as pbkdf2_sha1() requires it.
		 */
		psk = os_zalloc(sizeof(struct hostapd_sta_wpa_psk_short));
		if (psk) {
			if ((passphraselen == MAX_PASSPHRASE_LEN + 1) &&
			    (hexstr2bin(passphrase, psk->psk, PMK_LEN) < 0)) {
				hostapd_logger(hapd, cache->addr,
					       HOSTAPD_MODULE_RADIUS,
					       HOSTAPD_LEVEL_WARNING,
					       "invalid hex string (%d chars) in Tunnel-Password",
					       passphraselen);
				goto skip;
			} else if (passphraselen <= MAX_PASSPHRASE_LEN) {
				os_memcpy(psk->passphrase, passphrase,
					  passphraselen);
				psk->is_passphrase = 1;
			}
			psk->next = cache->info.psk;
			cache->info.psk = psk;
			psk = NULL;
		}
skip:
		os_free(psk);
free_pass:
		os_free(passphrase);
	}
}


/**
 * hostapd_acl_recv_radius - Process incoming RADIUS Authentication messages
 * @msg: RADIUS response message
 * @req: RADIUS request message
 * @shared_secret: RADIUS shared secret
 * @shared_secret_len: Length of shared_secret in octets
 * @data: Context data (struct hostapd_data *)
 * Returns: RADIUS_RX_PROCESSED if RADIUS message was a reply to ACL query (and
 * was processed here) or RADIUS_RX_UNKNOWN if not.
 */
static RadiusRxResult
hostapd_acl_recv_radius(struct radius_msg *msg, struct radius_msg *req,
			const u8 *shared_secret, size_t shared_secret_len,
			void *data)
{
	struct hostapd_data *hapd = data;
	struct hostapd_acl_query_data *query, *prev;
	struct hostapd_cached_radius_acl *cache;
	struct radius_sta *info;
	struct radius_hdr *hdr = radius_msg_get_hdr(msg);

	query = hapd->acl_queries;
	prev = NULL;
	while (query) {
		if (query->radius_id == hdr->identifier)
			break;
		prev = query;
		query = query->next;
	}
	if (!query)
		return RADIUS_RX_UNKNOWN;

	wpa_printf(MSG_DEBUG,
		   "Found matching Access-Request for RADIUS message (id=%d)",
		   query->radius_id);

	if (radius_msg_verify(
		    msg, shared_secret, shared_secret_len, req,
		    hapd->conf->radius_require_message_authenticator)) {
		wpa_printf(MSG_INFO,
			   "Incoming RADIUS packet did not have correct authenticator - dropped");
		return RADIUS_RX_INVALID_AUTHENTICATOR;
	}

	if (hdr->code != RADIUS_CODE_ACCESS_ACCEPT &&
	    hdr->code != RADIUS_CODE_ACCESS_REJECT) {
		wpa_printf(MSG_DEBUG,
			   "Unknown RADIUS message code %d to ACL query",
			   hdr->code);
		return RADIUS_RX_UNKNOWN;
	}

	/* Insert Accept/Reject info into ACL cache */
	cache = os_zalloc(sizeof(*cache));
	if (!cache) {
		wpa_printf(MSG_DEBUG, "Failed to add ACL cache entry");
		goto done;
	}
	os_get_reltime(&cache->timestamp);
	os_memcpy(cache->addr, query->addr, sizeof(cache->addr));
	info = &cache->info;
	if (hdr->code == RADIUS_CODE_ACCESS_ACCEPT) {
		u8 *buf;
		size_t len;

		if (radius_msg_get_attr_int32(msg, RADIUS_ATTR_SESSION_TIMEOUT,
					      &info->session_timeout) == 0)
			cache->accepted = HOSTAPD_ACL_ACCEPT_TIMEOUT;
		else
			cache->accepted = HOSTAPD_ACL_ACCEPT;

		if (radius_msg_get_attr_int32(
			    msg, RADIUS_ATTR_ACCT_INTERIM_INTERVAL,
			    &info->acct_interim_interval) == 0 &&
		    info->acct_interim_interval < 60) {
			wpa_printf(MSG_DEBUG,
				   "Ignored too small Acct-Interim-Interval %d for STA "
				   MACSTR,
				   info->acct_interim_interval,
				   MAC2STR(query->addr));
			info->acct_interim_interval = 0;
		}

		if (hapd->conf->ssid.dynamic_vlan != DYNAMIC_VLAN_DISABLED)
			info->vlan_id.notempty = !!radius_msg_get_vlanid(
				msg, &info->vlan_id.untagged,
				MAX_NUM_TAGGED_VLAN, info->vlan_id.tagged);

		decode_tunnel_passwords(hapd, shared_secret, shared_secret_len,
					msg, req, cache);

		if (radius_msg_get_attr_ptr(msg, RADIUS_ATTR_USER_NAME,
					    &buf, &len, NULL) == 0) {
			info->identity = os_zalloc(len + 1);
			if (info->identity)
				os_memcpy(info->identity, buf, len);
		}
		if (radius_msg_get_attr_ptr(
			    msg, RADIUS_ATTR_CHARGEABLE_USER_IDENTITY,
			    &buf, &len, NULL) == 0) {
			info->radius_cui = os_zalloc(len + 1);
			if (info->radius_cui)
				os_memcpy(info->radius_cui, buf, len);
		}

		if (hapd->conf->wpa_psk_radius == PSK_RADIUS_REQUIRED &&
		    !info->psk)
			cache->accepted = HOSTAPD_ACL_REJECT;

		if (info->vlan_id.notempty &&
		    !hostapd_vlan_valid(hapd->conf->vlan, &info->vlan_id)) {
			hostapd_logger(hapd, query->addr,
				       HOSTAPD_MODULE_RADIUS,
				       HOSTAPD_LEVEL_INFO,
				       "Invalid VLAN %d%s received from RADIUS server",
				       info->vlan_id.untagged,
				       info->vlan_id.tagged[0] ? "+" : "");
			os_memset(&info->vlan_id, 0, sizeof(info->vlan_id));
		}
		if (hapd->conf->ssid.dynamic_vlan == DYNAMIC_VLAN_REQUIRED &&
		    !info->vlan_id.notempty)
			cache->accepted = HOSTAPD_ACL_REJECT;
	} else
		cache->accepted = HOSTAPD_ACL_REJECT;
	cache->next = hapd->acl_cache;
	hapd->acl_cache = cache;

	if (query->radius_psk) {
		struct sta_info *sta;
		bool success = cache->accepted == HOSTAPD_ACL_ACCEPT ||
			cache->accepted == HOSTAPD_ACL_ACCEPT_TIMEOUT;

		sta = ap_get_sta(hapd, query->addr);
		if (!sta || !sta->wpa_sm) {
			wpa_printf(MSG_DEBUG,
				   "No STA/SM entry found for the RADIUS PSK response");
			goto done;
		}
#ifdef NEED_AP_MLME
		if (success &&
		    (ieee802_11_set_radius_info(hapd, sta, cache->accepted,
						info) < 0 ||
		     ap_sta_bind_vlan(hapd, sta) < 0))
			success = false;
#endif /* NEED_AP_MLME */
		wpa_auth_sta_radius_psk_resp(sta->wpa_sm, success);
	} else {
#ifdef CONFIG_DRIVER_RADIUS_ACL
		hostapd_drv_set_radius_acl_auth(hapd, query->addr,
						cache->accepted,
						info->session_timeout);
#else /* CONFIG_DRIVER_RADIUS_ACL */
#ifdef NEED_AP_MLME
		/* Re-send original authentication frame for 802.11 processing
		 */
		wpa_printf(MSG_DEBUG,
			   "Re-sending authentication frame after successful RADIUS ACL query");
		ieee802_11_mgmt(hapd, query->auth_msg, query->auth_msg_len,
				NULL);
#endif /* NEED_AP_MLME */
#endif /* CONFIG_DRIVER_RADIUS_ACL */
	}

 done:
	if (!prev)
		hapd->acl_queries = query->next;
	else
		prev->next = query->next;

	hostapd_acl_query_free(query);

	return RADIUS_RX_PROCESSED;
}
#endif /* CONFIG_NO_RADIUS */


/**
 * hostapd_acl_init: Initialize IEEE 802.11 ACL
 * @hapd: hostapd BSS data
 * Returns: 0 on success, -1 on failure
 */
int hostapd_acl_init(struct hostapd_data *hapd)
{
#ifndef CONFIG_NO_RADIUS
	if (radius_client_register(hapd->radius, RADIUS_AUTH,
				   hostapd_acl_recv_radius, hapd))
		return -1;
#endif /* CONFIG_NO_RADIUS */

	return 0;
}


/**
 * hostapd_acl_deinit - Deinitialize IEEE 802.11 ACL
 * @hapd: hostapd BSS data
 */
void hostapd_acl_deinit(struct hostapd_data *hapd)
{
	struct hostapd_acl_query_data *query, *prev;

#ifndef CONFIG_NO_RADIUS
	hostapd_acl_cache_free(hapd->acl_cache);
	hapd->acl_cache = NULL;
#endif /* CONFIG_NO_RADIUS */

	query = hapd->acl_queries;
	hapd->acl_queries = NULL;
	while (query) {
		prev = query;
		query = query->next;
		hostapd_acl_query_free(prev);
	}
}


void hostapd_copy_psk_list(struct hostapd_sta_wpa_psk_short **psk,
			   struct hostapd_sta_wpa_psk_short *src)
{
	if (!psk)
		return;

	if (src)
		src->ref++;

	*psk = src;
}


void hostapd_free_psk_list(struct hostapd_sta_wpa_psk_short *psk)
{
	if (psk && psk->ref) {
		/* This will be freed when the last reference is dropped. */
		psk->ref--;
		return;
	}

	while (psk) {
		struct hostapd_sta_wpa_psk_short *prev = psk;
		psk = psk->next;
		bin_clear_free(prev, sizeof(*prev));
	}
}


#ifndef CONFIG_NO_RADIUS
void hostapd_acl_req_radius_psk(struct hostapd_data *hapd, const u8 *addr,
				int key_mgmt, const u8 *anonce,
				const u8 *eapol, size_t eapol_len)
{
	struct hostapd_acl_query_data *query;

	query = os_zalloc(sizeof(*query));
	if (!query)
		return;

	query->radius_psk = true;
	query->akm = key_mgmt;
	os_get_reltime(&query->timestamp);
	os_memcpy(query->addr, addr, ETH_ALEN);
	if (anonce)
		query->anonce = os_memdup(anonce, WPA_NONCE_LEN);
	if (eapol) {
		query->eapol = os_memdup(eapol, eapol_len);
		query->eapol_len = eapol_len;
	}
	if (hostapd_radius_acl_query(hapd, addr, query)) {
		wpa_printf(MSG_DEBUG,
			   "Failed to send Access-Request for RADIUS PSK/ACL query");
		hostapd_acl_query_free(query);
		return;
	}

	query->next = hapd->acl_queries;
	hapd->acl_queries = query;
}
#endif /* CONFIG_NO_RADIUS */
