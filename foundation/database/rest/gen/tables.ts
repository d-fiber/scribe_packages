// Copyright (C) 2026 Fiber
//
// This file is part of scribe and is made available under the PolyForm Shield
// License 1.0.0. The full terms are in the LICENSE file at the root of this
// repository, and at https://polyformproject.org/licenses/shield/1.0.0
//
// What you may do:
// - Use this software for any purpose, including commercially, and build and
//   sell your own products on top of it.
// - Change it, and create new works based on it.
// - Distribute copies of it, with or without your changes.
//
// The one thing you may not do:
// - Use it to provide any product that competes with scribe, or with any
//   product Fiber or its affiliates provide using scribe. Products compete
//   even when they are offered free of charge, through a different kind of
//   interface, or for a different technical platform.
//
// If you pass this software on:
// - Anyone who receives any part of it from you must also receive these terms,
//   or the URL above, together with the "Required Notice" line carried by the
//   LICENSE file.
//
// Disclaimer:
// AS FAR AS THE LAW ALLOWS, THIS SOFTWARE COMES AS IS, WITHOUT ANY WARRANTY OR
// CONDITION, AND THE LICENSOR WILL NOT BE LIABLE TO YOU FOR ANY DAMAGES ARISING
// OUT OF THESE TERMS OR THE USE OR NATURE OF THE SOFTWARE, UNDER ANY KIND OF
// LEGAL CLAIM.
//
// This header is a summary written for convenience. Where it differs from the
// LICENSE file, the LICENSE file governs.

// This file is auto-generated do not edit manually.
// Run: poppin gen code

import { from, TablesBase } from "@scribe/core/clients/database/tables.ts";
import type { TypedQueryBuilder } from "@scribe/core/clients/database/query/builder.ts";
import type {
  InternalTAdminUsersPermissionsRelations,
  InternalTAdminUsersRelations,
  InternalTAdminUsersRolesRelations,
  InternalTAppUserDevicesRelations,
  InternalTAppUsersRelations,
  InternalTDynamicLinksRelations,
  InternalTEmailTemplatesRelations,
  InternalTInAppNotificationTemplatesRelations,
  InternalTInAppNotificationsRelations,
  InternalTMailsRelations,
  InternalTNotificationPushesRelations,
  InternalTPushTemplatesRelations,
  InternalTRemoteConfigsRelations,
  InternalTSmtpAccountsRelations,
} from "./relations.ts";
import type {
  InternalTAdminTopicMembersRow,
  InternalTAdminUsersRow,
  InternalTAdminUsersDevicesRow,
  InternalTAdminUsersPermissionsRow,
  InternalTAdminUsersProfilesRow,
  InternalTAdminUsersRolePermissionsRow,
  InternalTAdminUsersRolesRow,
  InternalTAdminUsersSettingsRow,
  InternalTAdminUsersVpnRow,
  InternalTAppUserDevicesRow,
  InternalTAppUserFeedbackRow,
  InternalTAppUserIssueReportsRow,
  InternalTAppUserSettingsRow,
  InternalTAppUsersRow,
  InternalTDynamicLinkStatisticsRow,
  InternalTDynamicLinksRow,
  InternalTEmailCampaignsRow,
  InternalTEmailTemplatesRow,
  InternalTInAppNotificationCampaignsRow,
  InternalTInAppNotificationOpensRow,
  InternalTInAppNotificationReadsRow,
  InternalTInAppNotificationTemplatesRow,
  InternalTInAppNotificationsRow,
  InternalTMailStatisticsRow,
  InternalTMailsRow,
  InternalTNotificationPushOpensRow,
  InternalTNotificationPushesRow,
  InternalTOtpPendingTokensRow,
  InternalTPushCampaignsRow,
  InternalTPushTemplatesRow,
  InternalTRemoteConfigStatisticsRow,
  InternalTRemoteConfigsRow,
  InternalTResponsesRow,
  InternalTSmtpAccountsRow,
  InternalTSyncEventsRow,
  InternalTUserTopicMembersRow,
} from "./rows.ts";

export class Tables extends TablesBase {
  internal_t__admin_topic_members(): TypedQueryBuilder<InternalTAdminTopicMembersRow> {
    return from<InternalTAdminTopicMembersRow>(this.db, "internal_t__admin_topic_members");
  }
  internal_t__admin_users(): TypedQueryBuilder<InternalTAdminUsersRow, InternalTAdminUsersRow, InternalTAdminUsersRelations> {
    return from<InternalTAdminUsersRow, InternalTAdminUsersRelations>(this.db, "internal_t__admin_users");
  }
  internal_t__admin_users_devices(): TypedQueryBuilder<InternalTAdminUsersDevicesRow> {
    return from<InternalTAdminUsersDevicesRow>(this.db, "internal_t__admin_users_devices");
  }
  internal_t__admin_users_permissions(): TypedQueryBuilder<InternalTAdminUsersPermissionsRow, InternalTAdminUsersPermissionsRow, InternalTAdminUsersPermissionsRelations> {
    return from<InternalTAdminUsersPermissionsRow, InternalTAdminUsersPermissionsRelations>(this.db, "internal_t__admin_users_permissions");
  }
  internal_t__admin_users_profiles(): TypedQueryBuilder<InternalTAdminUsersProfilesRow> {
    return from<InternalTAdminUsersProfilesRow>(this.db, "internal_t__admin_users_profiles");
  }
  internal_t__admin_users_role_permissions(): TypedQueryBuilder<InternalTAdminUsersRolePermissionsRow> {
    return from<InternalTAdminUsersRolePermissionsRow>(this.db, "internal_t__admin_users_role_permissions");
  }
  internal_t__admin_users_roles(): TypedQueryBuilder<InternalTAdminUsersRolesRow, InternalTAdminUsersRolesRow, InternalTAdminUsersRolesRelations> {
    return from<InternalTAdminUsersRolesRow, InternalTAdminUsersRolesRelations>(this.db, "internal_t__admin_users_roles");
  }
  internal_t__admin_users_settings(): TypedQueryBuilder<InternalTAdminUsersSettingsRow> {
    return from<InternalTAdminUsersSettingsRow>(this.db, "internal_t__admin_users_settings");
  }
  internal_t__admin_users_vpn(): TypedQueryBuilder<InternalTAdminUsersVpnRow> {
    return from<InternalTAdminUsersVpnRow>(this.db, "internal_t__admin_users_vpn");
  }
  internal_t__app_user_devices(): TypedQueryBuilder<InternalTAppUserDevicesRow, InternalTAppUserDevicesRow, InternalTAppUserDevicesRelations> {
    return from<InternalTAppUserDevicesRow, InternalTAppUserDevicesRelations>(this.db, "internal_t__app_user_devices");
  }
  internal_t__app_user_feedback(): TypedQueryBuilder<InternalTAppUserFeedbackRow> {
    return from<InternalTAppUserFeedbackRow>(this.db, "internal_t__app_user_feedback");
  }
  internal_t__app_user_issue_reports(): TypedQueryBuilder<InternalTAppUserIssueReportsRow> {
    return from<InternalTAppUserIssueReportsRow>(this.db, "internal_t__app_user_issue_reports");
  }
  internal_t__app_user_settings(): TypedQueryBuilder<InternalTAppUserSettingsRow> {
    return from<InternalTAppUserSettingsRow>(this.db, "internal_t__app_user_settings");
  }
  internal_t__app_users(): TypedQueryBuilder<InternalTAppUsersRow, InternalTAppUsersRow, InternalTAppUsersRelations> {
    return from<InternalTAppUsersRow, InternalTAppUsersRelations>(this.db, "internal_t__app_users");
  }
  internal_t__dynamic_link_statistics(): TypedQueryBuilder<InternalTDynamicLinkStatisticsRow> {
    return from<InternalTDynamicLinkStatisticsRow>(this.db, "internal_t__dynamic_link_statistics");
  }
  internal_t__dynamic_links(): TypedQueryBuilder<InternalTDynamicLinksRow, InternalTDynamicLinksRow, InternalTDynamicLinksRelations> {
    return from<InternalTDynamicLinksRow, InternalTDynamicLinksRelations>(this.db, "internal_t__dynamic_links");
  }
  internal_t__email_campaigns(): TypedQueryBuilder<InternalTEmailCampaignsRow> {
    return from<InternalTEmailCampaignsRow>(this.db, "internal_t__email_campaigns");
  }
  internal_t__email_templates(): TypedQueryBuilder<InternalTEmailTemplatesRow, InternalTEmailTemplatesRow, InternalTEmailTemplatesRelations> {
    return from<InternalTEmailTemplatesRow, InternalTEmailTemplatesRelations>(this.db, "internal_t__email_templates");
  }
  internal_t__in_app_notification_campaigns(): TypedQueryBuilder<InternalTInAppNotificationCampaignsRow> {
    return from<InternalTInAppNotificationCampaignsRow>(this.db, "internal_t__in_app_notification_campaigns");
  }
  internal_t__in_app_notification_opens(): TypedQueryBuilder<InternalTInAppNotificationOpensRow> {
    return from<InternalTInAppNotificationOpensRow>(this.db, "internal_t__in_app_notification_opens");
  }
  internal_t__in_app_notification_reads(): TypedQueryBuilder<InternalTInAppNotificationReadsRow> {
    return from<InternalTInAppNotificationReadsRow>(this.db, "internal_t__in_app_notification_reads");
  }
  internal_t__in_app_notification_templates(): TypedQueryBuilder<InternalTInAppNotificationTemplatesRow, InternalTInAppNotificationTemplatesRow, InternalTInAppNotificationTemplatesRelations> {
    return from<InternalTInAppNotificationTemplatesRow, InternalTInAppNotificationTemplatesRelations>(this.db, "internal_t__in_app_notification_templates");
  }
  internal_t__in_app_notifications(): TypedQueryBuilder<InternalTInAppNotificationsRow, InternalTInAppNotificationsRow, InternalTInAppNotificationsRelations> {
    return from<InternalTInAppNotificationsRow, InternalTInAppNotificationsRelations>(this.db, "internal_t__in_app_notifications");
  }
  internal_t__mail_statistics(): TypedQueryBuilder<InternalTMailStatisticsRow> {
    return from<InternalTMailStatisticsRow>(this.db, "internal_t__mail_statistics");
  }
  internal_t__mails(): TypedQueryBuilder<InternalTMailsRow, InternalTMailsRow, InternalTMailsRelations> {
    return from<InternalTMailsRow, InternalTMailsRelations>(this.db, "internal_t__mails");
  }
  internal_t__notification_push_opens(): TypedQueryBuilder<InternalTNotificationPushOpensRow> {
    return from<InternalTNotificationPushOpensRow>(this.db, "internal_t__notification_push_opens");
  }
  internal_t__notification_pushes(): TypedQueryBuilder<InternalTNotificationPushesRow, InternalTNotificationPushesRow, InternalTNotificationPushesRelations> {
    return from<InternalTNotificationPushesRow, InternalTNotificationPushesRelations>(this.db, "internal_t__notification_pushes");
  }
  internal_t__otp_pending_tokens(): TypedQueryBuilder<InternalTOtpPendingTokensRow> {
    return from<InternalTOtpPendingTokensRow>(this.db, "internal_t__otp_pending_tokens");
  }
  internal_t__push_campaigns(): TypedQueryBuilder<InternalTPushCampaignsRow> {
    return from<InternalTPushCampaignsRow>(this.db, "internal_t__push_campaigns");
  }
  internal_t__push_templates(): TypedQueryBuilder<InternalTPushTemplatesRow, InternalTPushTemplatesRow, InternalTPushTemplatesRelations> {
    return from<InternalTPushTemplatesRow, InternalTPushTemplatesRelations>(this.db, "internal_t__push_templates");
  }
  internal_t__remote_config_statistics(): TypedQueryBuilder<InternalTRemoteConfigStatisticsRow> {
    return from<InternalTRemoteConfigStatisticsRow>(this.db, "internal_t__remote_config_statistics");
  }
  internal_t__remote_configs(): TypedQueryBuilder<InternalTRemoteConfigsRow, InternalTRemoteConfigsRow, InternalTRemoteConfigsRelations> {
    return from<InternalTRemoteConfigsRow, InternalTRemoteConfigsRelations>(this.db, "internal_t__remote_configs");
  }
  internal_t__responses(): TypedQueryBuilder<InternalTResponsesRow> {
    return from<InternalTResponsesRow>(this.db, "internal_t__responses");
  }
  internal_t__smtp_accounts(): TypedQueryBuilder<InternalTSmtpAccountsRow, InternalTSmtpAccountsRow, InternalTSmtpAccountsRelations> {
    return from<InternalTSmtpAccountsRow, InternalTSmtpAccountsRelations>(this.db, "internal_t__smtp_accounts");
  }
  internal_t__sync_events(): TypedQueryBuilder<InternalTSyncEventsRow> {
    return from<InternalTSyncEventsRow>(this.db, "internal_t__sync_events");
  }
  internal_t__user_topic_members(): TypedQueryBuilder<InternalTUserTopicMembersRow> {
    return from<InternalTUserTopicMembersRow>(this.db, "internal_t__user_topic_members");
  }
}
