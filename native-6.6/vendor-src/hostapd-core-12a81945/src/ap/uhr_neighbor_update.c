/*
 * hostapd / IEEE 802.11bn UHR SMD Neighborhood Update
 *
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause-Clear
*/

#include "utils/includes.h"
#include "utils/common.h"
#include "utils/eloop.h"
#include "common/ieee802_11_defs.h"
#include "hostapd.h"
#include "neighbor_db.h"
#include "uhr_neighbor_update.h"

#define SMD_NEIGHBOR_UPDATE_SUFFIX 0x08
#define SMD_NEIGHBOR_FETCH_SUFFIX 0x09

/*
 * Neighborhood Update TLV (payload carried in ETH_P_OUI)
 *
 * Element ID | Length | Update Type | BSSID | BSSID Info | OpClass | Channel |
 * PHY Type | Optional Subelements
 */
#define SMD_NEIGHBOR_TLV_EID 0xdd
/* Fixed body fields in nr->nr: BSSID + BSSID Info + Op Class + Channel + PHY Type */
#define NR_BODY_FIXED_LEN (ETH_ALEN + 4 + 1 + 1 + 1)
/* SMD TLV header: EID + Len + Update Type */
#define SMD_NEIGHBOR_TLV_HDR_LEN 3
#define SMD_NEIGHBOR_TLV_LEN_FIELD_SIZE 1
#define SMD_NEIGHBOR_REPORT_PAYLOAD_LEN (1 + ETH_ALEN + 4 + 1 + 1 + 1)

static bool smd_neighbor_update_validate_rx_addr(struct hostapd_data *hapd,
						 const u8 *dst_addr)
{
	return hapd && dst_addr && (is_broadcast_ether_addr(dst_addr) ||
				    ether_addr_equal(dst_addr, hapd->own_addr));
}

static struct smd_neighbor_update_entry *
smd_neighbor_update_get_entry(struct smd_neighbor_update_ctx *ctx,
			      const u8 *bssid)
{
	struct smd_neighbor_update_entry *e;

	if (!ctx || !bssid)
		return NULL;

	dl_list_for_each(e, &ctx->entries, struct smd_neighbor_update_entry, list) {
		if (ether_addr_equal(e->bssid, bssid))
			return e;
	}
	return NULL;
}

static struct smd_neighbor_update_entry *
smd_neighbor_update_add_entry(struct smd_neighbor_update_ctx *ctx,
			      const u8 *bssid)
{
	struct smd_neighbor_update_entry *e;

	if (!ctx || !bssid)
		return NULL;

	e = smd_neighbor_update_get_entry(ctx, bssid);
	if (e)
		return e;

	e = os_zalloc(sizeof(*e));
	if (!e)
		return NULL;

	os_memcpy(e->bssid, bssid, ETH_ALEN);
	os_get_time(&e->last_update);
	dl_list_add(&ctx->entries, &e->list);

	return e;
}

static void smd_neighbor_update_set_timestamp(struct smd_neighbor_update_ctx *ctx,
					      const u8 *bssid)
{
	struct smd_neighbor_update_entry *e;

	e = smd_neighbor_update_add_entry(ctx, bssid);
	if (!e)
		return;

	os_get_time(&e->last_update);
	e->pull_retry_count = 0;
}


static void smd_neighbor_update_free_entry(struct smd_neighbor_update_ctx *ctx,
					   const u8 *bssid)
{
	struct smd_neighbor_update_entry *e;

	e = smd_neighbor_update_get_entry(ctx, bssid);
	if (!e)
		return;

	dl_list_del(&e->list);
	os_free(e);
}

static int smd_neighbor_update_build_tlv(struct hostapd_data *hapd,
					 enum smd_neighbor_update_type update_type,
					 struct wpabuf **tlv)
{
	struct hostapd_neighbor_entry *nr;
	struct wpabuf *buf;
	u8 *len_pos;

	/* Ensure own Neighbor Report entry is up-to-date */
	hostapd_neighbor_set_own_report(hapd);

	nr = hostapd_neighbor_get(hapd, hapd->own_addr, NULL);
	if (!nr || !nr->nr)
		return -1;

	if (wpabuf_len(nr->nr) < NR_BODY_FIXED_LEN)
		return -1;

	buf = wpabuf_alloc(SMD_NEIGHBOR_TLV_HDR_LEN + wpabuf_len(nr->nr));
	if (!buf)
		return -1;

	wpabuf_put_u8(buf, SMD_NEIGHBOR_TLV_EID);
	len_pos = wpabuf_put(buf, 1);
	wpabuf_put_u8(buf, update_type);
	wpabuf_put_buf(buf, nr->nr);

	*len_pos = wpabuf_len(buf) - 2;
	*tlv = buf;
	return 0;
}

static int smd_neighbor_update_parse_tlv(struct smd_neighbor_update_ctx *ctx,
					const u8 *src_addr,
					const u8 *data, size_t data_len)
{
	struct hostapd_data *hapd = ctx->hapd;
	const u8 *pos = data;
	const u8 *end = data + data_len;
	const u8 *tlv_end;
	u8 update_type;
	const u8 *bssid;
	u32 bssid_info;
	u8 op_class, channel, phy_type;
	struct wpa_ssid_value ssid;
	struct wpabuf *nr;
	const u8 *subelems;
	size_t subelems_len;
	size_t raw_subelems_len;
#ifdef CONFIG_IEEE80211BN
	bool same_smd = false;
	const u8 *smd_info_start = NULL;
	const u8 *smd_info_end = NULL;
#endif

	if (data_len < 2)
		return -1;

	if (*pos++ != SMD_NEIGHBOR_TLV_EID)
		return -1;
	if (pos >= end)
		return -1;

	if (pos[0] > end - pos - 1)
		return -1;
	if (pos[0] < SMD_NEIGHBOR_REPORT_PAYLOAD_LEN)
		return -1;

	tlv_end = pos + SMD_NEIGHBOR_TLV_LEN_FIELD_SIZE + pos[0];
	pos++;
	update_type = *pos++;
	bssid = pos;
	pos += ETH_ALEN;
	bssid_info = WPA_GET_LE32(pos);
	pos += 4;
	op_class = *pos++;
	channel = *pos++;
	phy_type = *pos++;

	subelems = pos;
	raw_subelems_len = tlv_end - pos;
	subelems_len = raw_subelems_len;
	/* Parse SSID from optional subelements if present */
	os_memset(&ssid, 0, sizeof(ssid));
	while (subelems_len >= 2) {
		u8 id = subelems[0];
		u8 elen = subelems[1];

		if (2 + elen > subelems_len)
			break;
		if (id == WLAN_EID_SSID && elen <= SSID_MAX_LEN) {
			ssid.ssid_len = elen;
			os_memcpy(ssid.ssid, subelems + 2, elen);
		}
#ifdef CONFIG_IEEE80211BN
		if (id == WNM_NEIGHBOR_SMD_INFO) {
			smd_info_start = subelems;
			smd_info_end = subelems + 2 + elen;
			if (elen >= ETH_ALEN && hapd->conf->smd.enabled &&
			    os_memcmp(subelems + 2, hapd->conf->smd.smd_identifier,
				      ETH_ALEN) == 0)
				same_smd = true;
		}
#endif
		subelems += 2 + elen;
		subelems_len -= 2 + elen;
	}

	/* If SSID is not present, use our own SSID as default */
	if (!ssid.ssid_len) {
		ssid.ssid_len = hapd->conf->ssid.ssid_len;
		os_memcpy(ssid.ssid, hapd->conf->ssid.ssid, ssid.ssid_len);
	}

#ifdef CONFIG_IEEE80211BN
	/* Always recompute SAME_SMD locally rather than trusting the sender's
	 * value, since only this AP knows its own SMD identifier. */
	bssid_info &= ~NEI_REP_BSSID_INFO_SAME_SMD;
	if (same_smd)
		bssid_info |= NEI_REP_BSSID_INFO_SAME_SMD;
#endif

	if (update_type == SMD_NEIGHBOR_UPDATE_REMOVE_AP) {
		hostapd_neighbor_remove(hapd, bssid, &ssid);
		smd_neighbor_update_free_entry(ctx, bssid);
		wpa_printf(MSG_DEBUG,
			   "SMD Neighbor: Removed " MACSTR " (from " MACSTR ")",
			   MAC2STR(bssid), MAC2STR(src_addr));
		return 0;
	}

	if (update_type != SMD_NEIGHBOR_UPDATE_NEW_AP &&
	    update_type != SMD_NEIGHBOR_UPDATE_MODIFY_AP)
		return -1;

	/* Build Neighbor Report payload (no EID/len) */
	nr = wpabuf_alloc(SMD_NEIGHBOR_REPORT_PAYLOAD_LEN - 1 + (tlv_end - pos));
	if (!nr)
		return -1;

	wpabuf_put_data(nr, bssid, ETH_ALEN);
	wpabuf_put_le32(nr, bssid_info);
	wpabuf_put_u8(nr, op_class);
	wpabuf_put_u8(nr, channel);
	wpabuf_put_u8(nr, phy_type);
	if (raw_subelems_len) {
#ifdef CONFIG_IEEE80211BN
		if (same_smd && smd_info_start) {
			/* Strip WNM_NEIGHBOR_SMD_INFO from the neighbor report:
			 * the STA already knows the SMD ID when SAME_SMD is set,
			 * so advertising it again is redundant. */
			wpabuf_put_data(nr, pos, smd_info_start - pos);
			wpabuf_put_data(nr, smd_info_end,
					pos + raw_subelems_len - smd_info_end);
		} else
#endif
		{
			wpabuf_put_data(nr, pos, raw_subelems_len);
		}
	}

	if (hostapd_neighbor_set(hapd, bssid, &ssid, nr, NULL, NULL, 0, 0) < 0) {
		wpabuf_free(nr);
		return -1;
	}

	smd_neighbor_update_set_timestamp(ctx, bssid);
	wpabuf_free(nr);

	wpa_printf(MSG_DEBUG,
		   "SMD Neighbor: Updated " MACSTR " (type=0x%02x from " MACSTR ")",
		   MAC2STR(bssid), update_type, MAC2STR(src_addr));

	if (update_type == SMD_NEIGHBOR_UPDATE_NEW_AP)
		smd_neighbor_update_send(hapd, SMD_NEIGHBOR_UPDATE_MODIFY_AP);

	return 0;
}

static void smd_neighbor_update_timer(void *eloop_ctx, void *timeout_ctx)
{
	struct smd_neighbor_update_ctx *ctx = eloop_ctx;
	struct smd_neighbor_update_entry *e, *prev;
	struct os_time now;
	struct os_time diff;

	if (!ctx)
		return;

	os_get_time(&now);

	dl_list_for_each_safe(e, prev, &ctx->entries,
			      struct smd_neighbor_update_entry, list) {
		os_time_sub(&now, &e->last_update, &diff);
		if (diff.sec < 0)
			continue;
		if ((unsigned int) diff.sec < ctx->expire_sec)
			continue;

		if (e->pull_retry_count >= ctx->pull_retry_max) {
			wpa_printf(MSG_DEBUG,
				   "SMD Neighbor: Expired " MACSTR
				   " (age=%ld sec) - removing after %u retries",
				   MAC2STR(e->bssid), diff.sec, e->pull_retry_count);
			hostapd_neighbor_remove(ctx->hapd, e->bssid, NULL);
			smd_neighbor_update_free_entry(ctx, e->bssid);
			continue;
		}

		e->pull_retry_count++;
		wpa_printf(MSG_DEBUG,
			   "SMD Neighbor: Expired " MACSTR
			   " (age=%ld sec) - pull retry %u/%u",
			   MAC2STR(e->bssid), diff.sec, e->pull_retry_count,
			   ctx->pull_retry_max);
		smd_neighbor_update_send_pull_ucast(ctx->hapd, e->bssid);
	}

	eloop_register_timeout(ctx->pull_period_sec, 0,
			       smd_neighbor_update_timer, ctx, NULL);
}


static void smd_neighbor_update_rx_frame(struct smd_neighbor_update_ctx *ctx,
					 const u8 *src_addr, const u8 *dst_addr,
					 const u8 *data, size_t data_len)
{
	struct hostapd_data *hapd;

	if (!ctx)
		return;

	hapd = ctx->hapd;
	if (!hapd)
		return;

	if (!smd_neighbor_update_validate_rx_addr(hapd, dst_addr)) {
		wpa_printf(MSG_DEBUG, "SMD Neighbor: Frame not for this BSS");
		return;
	}

	if (ether_addr_equal(src_addr, hapd->own_addr))
		return;

	if (smd_neighbor_update_parse_tlv(ctx, src_addr, data, data_len) < 0)
		wpa_printf(MSG_ERROR, "SMD Neighbor: Failed to parse update");
}


static void smd_neighbor_fetch_rx_frame(struct smd_neighbor_update_ctx *ctx,
				  const u8 *src_addr, const u8 *dst_addr,
				  const u8 *data, size_t data_len)
{
	int ret;
	struct wpabuf *tlv = NULL;
	struct hostapd_data *hapd;

	if (!ctx)
		return;

	hapd = ctx->hapd;
	if (!hapd)
		return;

	if (ctx->hapd != hapd)
		return;

	if (!smd_neighbor_update_validate_rx_addr(hapd, dst_addr))
		return;

	/* Respond with our current neighbor info */
	ret = smd_neighbor_update_build_tlv(hapd, SMD_NEIGHBOR_UPDATE_MODIFY_AP,
					    &tlv);
	if (ret < 0)
		return;

	/* TBD: send TLV via the transport mechanism. */

	wpabuf_free(tlv);
}


void smd_neighbor_update_rx(struct hostapd_data *hapd, const u8 *src_addr,
			      const u8 *dst_addr, const u8 *data, size_t data_len,
			      u8 oui_suffix)
{
	struct smd_neighbor_update_ctx *ctx;

	if (!hapd || !hapd->smd_neighbor_update_ctx)
		return;

	ctx = hapd->smd_neighbor_update_ctx;

	switch (oui_suffix) {
	case SMD_NEIGHBOR_FETCH_SUFFIX:
		smd_neighbor_fetch_rx_frame(ctx, src_addr, dst_addr, data, data_len);
		break;
	case SMD_NEIGHBOR_UPDATE_SUFFIX:
		smd_neighbor_update_rx_frame(ctx, src_addr, dst_addr, data, data_len);
		break;
	default:
		wpa_printf(MSG_DEBUG,
			   "SMD Neighbor: Incorrect OUI suffix %u", oui_suffix);
		break;
	}
}

int smd_neighbor_update_send(struct hostapd_data *hapd,
			     enum smd_neighbor_update_type update_type)
{
	struct wpabuf *tlv = NULL;
	int ret;

	ret = smd_neighbor_update_build_tlv(hapd, update_type, &tlv);
	if (ret < 0)
		return -1;

	/* TBD: send TLV via the transport mechanism. */
	wpabuf_free(tlv);
	return ret;
}

int smd_neighbor_update_send_pull_ucast(struct hostapd_data *hapd,
				 const u8 *dst_addr)
{
	if (!hapd || !hapd->smd_neighbor_update_ctx || !dst_addr)
		return -1;

	/* TBD: send pull request via the transport mechanism. */
	return 0;
}

int smd_neighbor_update_init(struct hostapd_data *hapd)
{
	struct smd_neighbor_update_ctx *ctx;

	if (!hapd)
		return -1;

	if (hapd->smd_neighbor_update_ctx)
		return 0;

	ctx = os_zalloc(sizeof(*ctx));
	if (!ctx)
		return -1;

	ctx->hapd = hapd;
	ctx->expire_sec = hapd->conf->smd_neighbor_expiry_time;
	ctx->pull_period_sec = hapd->conf->smd_neighbor_pull_interval;
	ctx->pull_retry_max = SMD_NEIGHBOR_PULL_RETRY_MAX;
	dl_list_init(&ctx->entries);

	hapd->smd_neighbor_update_ctx = ctx;

	eloop_register_timeout(ctx->pull_period_sec, 0,
			       smd_neighbor_update_timer, ctx, NULL);

	/* Announce presence */
	smd_neighbor_update_send(hapd, SMD_NEIGHBOR_UPDATE_NEW_AP);
	return 0;
}

void smd_neighbor_update_deinit(struct hostapd_data *hapd)
{
	struct smd_neighbor_update_ctx *ctx;
	struct smd_neighbor_update_entry *e, *prev;

	if (!hapd)
		return;

	ctx = hapd->smd_neighbor_update_ctx;
	if (!ctx)
		return;

	eloop_cancel_timeout(smd_neighbor_update_timer, ctx, NULL);

	dl_list_for_each_safe(e, prev, &ctx->entries,
			      struct smd_neighbor_update_entry, list) {
		dl_list_del(&e->list);
		os_free(e);
	}

	hapd->smd_neighbor_update_ctx = NULL;
	os_free(ctx);
}
