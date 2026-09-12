/*
 * hostapd / Neighboring APs DB
 * Copyright(c) 2013 - 2016 Intel Mobile Communications GmbH.
 * Copyright(c) 2011 - 2016 Intel Corporation. All rights reserved.
 *
 * This software may be distributed under the terms of the BSD license.
 * See README for more details.
 */

#ifndef NEIGHBOR_DB_H
#define NEIGHBOR_DB_H

struct hostapd_neighbor_entry *
hostapd_neighbor_get(struct hostapd_data *hapd, const u8 *bssid,
		     const struct wpa_ssid_value *ssid);
int hostapd_neighbor_show(struct hostapd_data *hapd, char *buf, size_t buflen);
int hostapd_neighbor_set(struct hostapd_data *hapd, const u8 *bssid,
			 const struct wpa_ssid_value *ssid,
			 const struct wpabuf *nr, const struct wpabuf *lci,
			 const struct wpabuf *civic, int stationary,
			 u8 bss_parameters);
void hostapd_neighbor_set_own_report(struct hostapd_data *hapd);
int hostapd_prepare_neighbor_buf(struct hostapd_data *hapd,
				 const u8 *bssid, struct wpabuf *nrbuf);
int hostapd_neighbor_sync_own_report(struct hostapd_data *hapd);
int hostapd_neighbor_remove(struct hostapd_data *hapd, const u8 *bssid,
			    const struct wpa_ssid_value *ssid);
void hostapd_free_neighbor_db(struct hostapd_data *hapd);
int hostapd_add_candidate_own(struct hostapd_data *hapd, int pref,
			      u8 *links, u8 num_links,
			      u8 *nei_rep, size_t nei_rep_len);
int hostapd_neighbor_set_ifaces_scan_report(struct hostapd_data *hapd,
					    const struct wpa_ssid_value *ssid,
					    u32 bands);

void hostapd_oce_survey_timer(void *eloop_ctx, void *timeout_ctx);
void hostapd_oce_survey_timer_start(struct hostapd_iface *iface);
void hostapd_oce_survey_timer_cancel(struct hostapd_iface *iface);

#endif /* NEIGHBOR_DB_H */
