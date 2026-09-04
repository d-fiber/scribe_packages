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

import {
  Build,
  Deploy,
  env,
  Image,
  Outputs,
  Recipe,
  resource,
  Role,
  Service,
  setting,
  sizingToken,
  template,
  Terraform,
} from "@scribe/alchemy";

const PRE_FUNCTION_ACCESS = `-- Read only, so no write may come through the gateway.
-- A 404 rather than a 405, so as not to reveal that the route exists.
local method = kong.request.get_method()
if method ~= "GET" and method ~= "HEAD" then
  return kong.response.exit(404, '{"message":"Not found"}', {["Content-Type"] = "application/json"})
end

-- Everything past the method belongs to storage-api: it is the
-- one place that actually verifies a bearer token's signature,
-- so this gateway does not pretend to check identity on its own
-- behalf. See storage.md for what used to live here and why it
-- was decorative.`;

@Deploy({
  db: {
    provisioning: {
      roles: [
        Role("supabase_storage_admin", {
          passwordEnv: "STORAGE_ADMIN_PASSWORD",
          attributes: ["LOGIN", "NOINHERIT", "CREATEROLE"],
        }),
      ],
    },
  },
  services: [
    Service("storage", {
      source: Build("Dockerfile"),
      securityOpt: ["no-new-privileges:true"],
      capDrop: ["ALL"],
      networks: ["app", "data"],
      volumes: ["storage-data:/var/lib/storage"],
      environment: {
        ANON_KEY: env("ANON_KEY"),
        SERVICE_KEY: env("SERVICE_KEY"),
        POSTGREST_URL: template("${REST_INTERNAL_URL:-http://rest:3000}"),
        AUTH_JWT_SECRET: env("JWT_SECRET"),
        DATABASE_URL: template(
          "postgres://supabase_storage_admin:${STORAGE_ADMIN_PASSWORD}@{{resource_postgres_host}}:{{resource_postgres_port}}/{{resource_postgres_database}}",
        ),
        FILE_SIZE_LIMIT: setting("max_object_bytes"),
        STORAGE_BACKEND: resource("objects", "backend"),
        FILE_STORAGE_BACKEND_PATH: "/var/lib/storage",
        GLOBAL_S3_BUCKET: resource("objects", "name"),
        GLOBAL_S3_ENDPOINT: resource("objects", "endpoint"),
        GLOBAL_S3_PROTOCOL: "https",
        GLOBAL_S3_FORCE_PATH_STYLE: "true",
        AWS_DEFAULT_REGION: resource("objects", "region"),
        AWS_ACCESS_KEY_ID: resource("objects", "access_key"),
        AWS_SECRET_ACCESS_KEY: resource("objects", "secret_key"),
        TENANT_ID: "stub",
        ENABLE_IMAGE_TRANSFORMATION: setting("image_transformation"),
        IMGPROXY_URL: "http://imgproxy:5001",
        REQUEST_ALLOW_X_FORWARDED_PATH: "true",
      },
      healthcheck: {
        command: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://127.0.0.1:5000/status"],
        interval: "5s",
        timeout: "5s",
        retries: 3,
        startPeriod: "60s",
      },
      dependsOn: { provision: "completed", rest: "started", imgproxy: "started" },
      capacity: { weight: 188, runtime: "node", min: "256Mi", dev: "256Mi", cpuSharesTotal: 4096 },
      tuning: { UV_THREADPOOL_SIZE: sizingToken("storage_uv_threadpool") },
      kong: {
        name: "storage-v1",
        url: "http://storage:5000/",
        routes: [{ name: "storage-v1-all", stripPath: true, paths: ["/storage/v1/"] }],
        plugins: [
          { name: "pre-function", config: { access: [PRE_FUNCTION_ACCESS] } },
          {
            name: "request-transformer",
            config: {
              add: { headers: ["Authorization: $LUA_AUTH_EXPR"] },
              replace: { headers: ["Authorization: $LUA_AUTH_EXPR"] },
            },
          },
        ],
      },
    }),
    Service("imgproxy", {
      source: Image("darthsim/imgproxy:v3.30.1"),
      networks: ["app"],
      volumes: ["storage-data:/var/lib/storage:ro"],
      environment: {
        IMGPROXY_BIND: ":5001",
        IMGPROXY_LOCAL_FILESYSTEM_ROOT: "/",
        IMGPROXY_USE_S3: template("${IMGPROXY_USE_S3:-false}"),
        IMGPROXY_S3_ENDPOINT: resource("objects", "endpoint"),
        IMGPROXY_S3_REGION: resource("objects", "region"),
        AWS_ACCESS_KEY_ID: resource("objects", "access_key"),
        AWS_SECRET_ACCESS_KEY: resource("objects", "secret_key"),
        IMGPROXY_USE_ETAG: "true",
        IMGPROXY_AUTO_WEBP: "true",
        IMGPROXY_MAX_SRC_RESOLUTION: "16.8",
      },
      healthcheck: {
        command: ["CMD", "imgproxy", "health"],
        interval: "5s",
        timeout: "5s",
        retries: 3,
        startPeriod: "20s",
      },
      capacity: { weight: 280, runtime: "go", min: "64Mi", dev: "256Mi", cpuShares: 1024 },
      tuning: {
        IMGPROXY_WORKERS: sizingToken("imgproxy_workers"),
        GOMAXPROCS: sizingToken("imgproxy_gomaxprocs"),
      },
    }),
  ],
  recipes: [
    Recipe("bucket", {
      contract: ["backend", "name", "endpoint", "region", "access_key", "secret_key"],
      classes: {
        container: Outputs({ backend: "file", name: "stub", endpoint: "", region: "", access_key: "", secret_key: "" }),
        external: Outputs({
          backend: "s3",
          name: env("S3_BUCKET"),
          endpoint: env("S3_ENDPOINT"),
          region: env("S3_REGION"),
          access_key: env("S3_ACCESS_KEY"),
          secret_key: env("S3_SECRET_KEY"),
        }),
        "aws-s3": Terraform(
          {
            terraform: { required_providers: { aws: { source: "hashicorp/aws", version: "6.19.0" } } },
            provider: { aws: { region: "{{region}}" } },
            resource: {
              aws_s3_bucket: { bucket: { bucket: "{{name}}", force_destroy: false } },
              aws_iam_user: { bucket: { name: "{{name}}" } },
              aws_iam_access_key: { bucket: { user: "${aws_iam_user.bucket.name}" } },
              aws_iam_user_policy: {
                bucket: {
                  name: "{{name}}",
                  user: "${aws_iam_user.bucket.name}",
                  policy:
                    '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject","s3:ListBucket"],"Resource":["${aws_s3_bucket.bucket.arn}","${aws_s3_bucket.bucket.arn}/*"]}]}',
                },
              },
            },
            output: {
              backend: { value: "s3" },
              name: { value: "${aws_s3_bucket.bucket.bucket}" },
              endpoint: { value: "" },
              region: { value: "{{region}}" },
              access_key: { value: "${aws_iam_access_key.bucket.id}" },
              secret_key: { value: "${aws_iam_access_key.bucket.secret}", sensitive: true },
            },
          },
          { region: "eu-west-3" },
        ),
        "gcp-gcs": Terraform(
          {
            terraform: { required_providers: { google: { source: "hashicorp/google", version: "6.14.1" } } },
            provider: { google: { project: "{{project}}", region: "{{region}}" } },
            resource: {
              google_storage_bucket: {
                bucket: { name: "{{name}}", location: "{{location}}", force_destroy: false, uniform_bucket_level_access: true },
              },
              google_service_account: {
                bucket: { account_id: '${substr("scribe-{{name}}", 0, 30)}', display_name: "{{name}}" },
              },
              google_storage_bucket_iam_member: {
                bucket: {
                  bucket: "${google_storage_bucket.bucket.name}",
                  role: "roles/storage.objectAdmin",
                  member: "serviceAccount:${google_service_account.bucket.email}",
                },
              },
              google_storage_hmac_key: { bucket: { service_account_email: "${google_service_account.bucket.email}" } },
            },
            output: {
              backend: { value: "s3" },
              name: { value: "${google_storage_bucket.bucket.name}" },
              endpoint: { value: "https://storage.googleapis.com" },
              region: { value: "{{location}}" },
              access_key: { value: "${google_storage_hmac_key.bucket.access_id}" },
              secret_key: { value: "${google_storage_hmac_key.bucket.secret}", sensitive: true },
            },
          },
          { project: "my-gcp-project", region: "europe-west1", location: "EU" },
        ),
      },
    }),
  ],
  configuration: {
    settings: {
      max_object_bytes: {
        doc: "The largest object the API accepts, in bytes, refused at the door above it.",
        type: "integer",
        default: 104857600,
      },
      image_transformation: {
        doc: "Whether an image may be asked for at another size, which starts imgproxy.",
        type: "boolean",
        default: true,
      },
    },
    requires: [{ name: "objects", type: "bucket" }],
    env: {
      STORAGE_INTERNAL_URL: "http://storage:5000",
      APP_URL: env("APP_URL"),
      ADMIN_URL: env("ADMIN_URL"),
    },
  },
})
class StorageDeploy {}

export {};
