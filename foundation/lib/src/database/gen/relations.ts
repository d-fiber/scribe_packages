// Copyright (C) 2026 Fiber
//
// This Source Code Form is subject to the terms of the Mozilla Public License,
// v. 2.0. If a copy of the MPL was not distributed with this file, You can
// obtain one at https://mozilla.org/MPL/2.0/.
//
// What you may do:
// - Use this software for any purpose, including commercially, and build and
//   sell your own products on top of it.
// - Change it, and create new works based on it.
// - Distribute copies of it, with or without your changes.
// - Combine it with files under any other licence, proprietary ones included,
//   and licence that larger work on your own terms.
//
// What you must do in return:
// - Keep this notice on every file you received it on.
// - Publish, under these same terms, the source of every file covered by them
//   that you distribute, including the ones you changed, so that whoever
//   receives your version can obtain that source.
// - Leave Fiber out of it: the name "Fiber", its branding, its logos and its
//   trademarks may not be used to endorse or promote what you build, and this
//   licence grants no right to them.
//
// Disclaimer:
// AS FAR AS THE LAW ALLOWS, THIS SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY
// OR CONDITION OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
// WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR
// NON-INFRINGEMENT. IN NO EVENT SHALL FIBER BE LIABLE FOR ANY DIRECT, INDIRECT,
// INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING BUT NOT
// LIMITED TO LOSS OF USE, DATA, PROFITS, OR BUSINESS INTERRUPTION) ARISING OUT
// OF OR RELATED TO THESE TERMS OR THE USE OR NATURE OF THE SOFTWARE, UNDER ANY
// KIND OF LEGAL CLAIM.
//
// This header is a summary written for convenience. Where it differs from the
// LICENSE file, the LICENSE file governs.

// This file is auto-generated do not edit manually.
// Run: poppin gen code

import type {
  InternalTAdminTopicMembersRow,
  InternalTAdminUsersDevicesRow,
  InternalTAdminUsersPermissionsRow,
  InternalTAdminUsersProfilesRow,
  InternalTAdminUsersRolePermissionsRow,
  InternalTAdminUsersRolesRow,
  InternalTAdminUsersRow,
  InternalTAdminUsersSettingsRow,
  InternalTAdminUsersVpnRow,
  InternalTAppUserDevicesRow,
  InternalTAppUserFeedbackRow,
  InternalTAppUserIssueReportsRow,
  InternalTAppUserSettingsRow,
  InternalTAppUsersRow,
  InternalTDynamicLinksRow,
  InternalTDynamicLinkStatisticsRow,
  InternalTEmailCampaignsRow,
  InternalTEmailTemplatesRow,
  InternalTInAppNotificationCampaignsRow,
  InternalTInAppNotificationOpensRow,
  InternalTInAppNotificationReadsRow,
  InternalTInAppNotificationsRow,
  InternalTMailsRow,
  InternalTMailStatisticsRow,
  InternalTNotificationPushesRow,
  InternalTNotificationPushOpensRow,
  InternalTPushCampaignsRow,
  InternalTRemoteConfigsRow,
  InternalTRemoteConfigStatisticsRow,
  InternalTResponsesRow,
  InternalTSmtpAccountsRow,
  InternalTUserTopicMembersRow,
} from "./rows.ts";

export type InternalTAdminUsersRelations = {
  internal_t__admin_topic_members: { row: InternalTAdminTopicMembersRow; many: true };
  internal_t__admin_users_devices: { row: InternalTAdminUsersDevicesRow; many: true };
  internal_t__admin_users_profiles: { row: InternalTAdminUsersProfilesRow; many: false };
  internal_t__admin_users_settings: { row: InternalTAdminUsersSettingsRow; many: false };
  internal_t__admin_users_vpn: { row: InternalTAdminUsersVpnRow; many: false };
  internal_t__responses: { row: InternalTResponsesRow; many: true };
};

export type InternalTAdminUsersPermissionsRelations = {
  internal_t__admin_users_role_permissions: {
    row: InternalTAdminUsersRolePermissionsRow;
    many: true;
    relations: {
      internal_t__admin_users_roles: { row: InternalTAdminUsersRolesRow; many: false };
    };
  };
};

export type InternalTAdminUsersRolesRelations = {
  internal_t__admin_users: { row: InternalTAdminUsersRow; many: true };
  internal_t__admin_users_role_permissions: {
    row: InternalTAdminUsersRolePermissionsRow;
    many: true;
    relations: {
      internal_t__admin_users_permissions: { row: InternalTAdminUsersPermissionsRow; many: false };
    };
  };
};

export type InternalTAppUserDevicesRelations = {
  internal_t__notification_pushes: {
    row: InternalTNotificationPushesRow;
    many: true;
    relations: {
      internal_t__in_app_notifications: { row: InternalTInAppNotificationsRow; many: false };
    };
  };
};

export type InternalTAppUsersRelations = {
  internal_t__app_user_devices: { row: InternalTAppUserDevicesRow; many: true };
  internal_t__app_user_feedback: { row: InternalTAppUserFeedbackRow; many: true };
  internal_t__app_user_issue_reports: { row: InternalTAppUserIssueReportsRow; many: true };
  internal_t__app_user_settings: { row: InternalTAppUserSettingsRow; many: false };
  internal_t__dynamic_link_statistics: {
    row: InternalTDynamicLinkStatisticsRow;
    many: true;
    relations: {
      internal_t__dynamic_links: { row: InternalTDynamicLinksRow; many: false };
    };
  };
  internal_t__in_app_notification_reads: { row: InternalTInAppNotificationReadsRow; many: false };
  internal_t__in_app_notifications: { row: InternalTInAppNotificationsRow; many: true };
  internal_t__remote_config_statistics: {
    row: InternalTRemoteConfigStatisticsRow;
    many: true;
    relations: {
      internal_t__remote_configs: { row: InternalTRemoteConfigsRow; many: false };
    };
  };
  internal_t__user_topic_members: { row: InternalTUserTopicMembersRow; many: true };
};

export type InternalTDynamicLinksRelations = {
  internal_t__dynamic_link_statistics: {
    row: InternalTDynamicLinkStatisticsRow;
    many: true;
    relations: {
      internal_t__app_users: { row: InternalTAppUsersRow; many: false };
    };
  };
};

export type InternalTEmailTemplatesRelations = {
  internal_t__email_campaigns: { row: InternalTEmailCampaignsRow; many: true };
  internal_t__mails: {
    row: InternalTMailsRow;
    many: true;
    relations: {
      internal_t__smtp_accounts: { row: InternalTSmtpAccountsRow; many: false };
    };
  };
};

export type InternalTInAppNotificationTemplatesRelations = {
  internal_t__in_app_notification_campaigns: { row: InternalTInAppNotificationCampaignsRow; many: true };
};

export type InternalTInAppNotificationsRelations = {
  internal_t__in_app_notification_opens: { row: InternalTInAppNotificationOpensRow; many: true };
  internal_t__notification_pushes: {
    row: InternalTNotificationPushesRow;
    many: true;
    relations: {
      internal_t__app_user_devices: { row: InternalTAppUserDevicesRow; many: false };
    };
  };
};

export type InternalTMailsRelations = {
  internal_t__mail_statistics: { row: InternalTMailStatisticsRow; many: true };
};

export type InternalTNotificationPushesRelations = {
  internal_t__notification_push_opens: { row: InternalTNotificationPushOpensRow; many: true };
};

export type InternalTPushTemplatesRelations = {
  internal_t__push_campaigns: { row: InternalTPushCampaignsRow; many: true };
};

export type InternalTRemoteConfigsRelations = {
  internal_t__remote_config_statistics: {
    row: InternalTRemoteConfigStatisticsRow;
    many: true;
    relations: {
      internal_t__app_users: { row: InternalTAppUsersRow; many: false };
    };
  };
};

export type InternalTSmtpAccountsRelations = {
  internal_t__mails: {
    row: InternalTMailsRow;
    many: true;
    relations: {
      internal_t__email_templates: { row: InternalTEmailTemplatesRow; many: false };
    };
  };
};
