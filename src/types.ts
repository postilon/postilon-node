// Request and response shapes of the Postilon API (https://postilon.com/docs/api).
// Field names are the API's own, in snake_case. Times are RFC 3339 strings in UTC.

/** Paging for every list: newest first, `limit` defaults to 100 (at most 1000). */
export interface ListParams {
  limit?: number;
  offset?: number;
}

/** One page of a list. Ask for the next with `offset + count` while `has_more` is true. */
export interface List<T> {
  object: "list";
  data: T[];
  /** Items in this page. */
  count: number;
  /** Items that match in all. */
  total: number;
  has_more: boolean;
}

export interface Deleted {
  deleted: true;
}

// Emails

export type EmailStatus =
  | "scheduled"
  | "queued"
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "complained"
  | "suppressed"
  | "failed"
  | "canceled";

export interface Tag {
  name: string;
  value: string;
}

/** A file sent inline, its `content` encoded in Base64. */
export interface InlineAttachment {
  filename: string;
  content_type: string;
  content: string;
}

/** A file uploaded earlier with `files.upload`. */
export interface FileAttachment {
  file_id: string;
  filename?: string;
  content_type?: string;
}

export type Attachment = InlineAttachment | FileAttachment;

export interface SendEmailParams {
  /** `hello@acme.com` or `Acme <hello@acme.com>`. With a live key, the domain must be verified. */
  from: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  /** Required unless `template_id` is set. */
  subject?: string;
  html?: string;
  text?: string;
  reply_to?: string;
  template_id?: string;
  /** Values for `{{ variable }}` placeholders. */
  variables?: Record<string, string>;
  attachments?: Attachment[];
  /** Extra email headers, such as `{ "X-Entity-Ref-ID": "order-123" }`. */
  headers?: Record<string, string>;
  tags?: Tag[];
  /** RFC 3339 time to send at, such as `2026-11-01T09:00:00Z`. */
  scheduled_at?: string;
}

export interface SendEmailOptions {
  /**
   * Sent as the `Idempotency-Key` header. A retry with the same key and body returns the
   * original response instead of sending again; the same key with a different body fails
   * with `409 idempotency_key_reused`.
   */
  idempotencyKey?: string;
}

export interface SendEmailResponse {
  id: string;
  status: "queued" | "scheduled";
  from: string;
  to: string[];
  environment: "live" | "test";
  credits_used: number;
  scheduled_at: string | null;
  created_at: string;
}

export interface SendBatchParams {
  from: string;
  subject?: string;
  html?: string;
  text?: string;
  template_id?: string;
  /** 1 to 100 emails, each with its own recipient and variables. */
  batch: Array<{ to: string; variables?: Record<string, string> }>;
}

export interface SendBatchResponse {
  object: "batch_result";
  count: number;
  data: Array<{ id: string; to: string; status: "queued" }>;
}

export interface ListEmailsParams extends ListParams {
  status?: EmailStatus;
  /** Searches the subject, ID, sender and recipients. */
  q?: string;
  source?: "api" | "smtp";
  /** Only emails created in the last N days. */
  days?: number;
}

export interface EmailEvent {
  id: string;
  email_id: string;
  event_type: string;
  recipient: string;
  metadata?: Record<string, string>;
  occurred_at: string;
}

export interface Email {
  id: string;
  workspace_id: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  reply_to?: string;
  subject: string;
  /** The content is deleted 30 days after the email was created; `content_purged_at` then says when. */
  html?: string;
  text?: string;
  attachments?: Attachment[];
  variables?: Record<string, string>;
  headers?: Record<string, string>;
  template_id?: string;
  tags?: Tag[];
  status: EmailStatus;
  environment: "live" | "test";
  transport: "rest_api" | "rest_api_batch" | "smtp_relay";
  source: "api" | "smtp";
  credits_used: number;
  dkim_signed: boolean;
  events: EmailEvent[];
  scheduled_at?: string;
  sent_at?: string;
  delivered_at?: string;
  created_at: string;
  content_purged_at?: string;
}

// Domains

export interface DnsRecord {
  type: string;
  name: string;
  value: string;
  priority?: number;
  purpose: string;
  status: "pending" | "verified";
  /** False for a recommended record (DMARC), which is not needed to verify the domain. */
  required: boolean;
}

export interface Domain {
  id: string;
  workspace_id: string;
  domain_name: string;
  status: "pending" | "verified" | "failed";
  dkim_selector: string;
  dkim_public_key: string;
  dmarc_record: string;
  return_path_domain: string;
  dns_records: DnsRecord[];
  open_tracking_enabled: boolean;
  click_tracking_enabled: boolean;
  verified_at?: string;
  created_at: string;
}

export interface CreateDomainParams {
  domain_name: string;
}

export interface UpdateDomainParams {
  open_tracking_enabled?: boolean;
  click_tracking_enabled?: boolean;
}

export interface DomainVerification {
  domain: Domain;
  dns_verification: {
    dns_lookup_performed: boolean;
    dkim_host: string;
    dkim_found_in_dns: boolean;
    return_path_found_in_dns: boolean;
    dmarc_found_in_dns: boolean;
    mode: "verified" | "pending_dns_propagation";
  };
}

// Templates

export interface Template {
  id: string;
  workspace_id: string;
  name: string;
  subject_template: string;
  html_template: string;
  text_template: string;
  /** The variable names the template uses, for reference. */
  variables: string[];
  updated_at: string;
  created_at: string;
}

export interface CreateTemplateParams {
  name: string;
  subject_template?: string;
  html_template?: string;
  text_template?: string;
  variables?: string[];
}

/** Fields left out (or empty) keep their current value. */
export type UpdateTemplateParams = Partial<CreateTemplateParams>;

// Files

export interface UploadFileParams {
  filename: string;
  /** The file encoded in Base64, such as `buffer.toString("base64")`. */
  content: string;
  content_type?: string;
}

export interface FileObject {
  id: string;
  workspace_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  expires_at: string;
  created_at: string;
}

// Suppressions

export interface Suppression {
  id: string;
  workspace_id: string;
  email_address: string;
  reason: "hard_bounce" | "complaint" | "unsubscribe" | "manual";
  source_email_id?: string;
  created_at: string;
}

export interface CreateSuppressionParams {
  email_address: string;
}

// Webhooks

export type WebhookEventType =
  | "email.sent"
  | "email.delivered"
  | "email.bounced"
  | "email.complained"
  | "email.opened"
  | "email.clicked"
  | "email.failed";

export interface Webhook {
  id: string;
  workspace_id: string;
  url: string;
  description: string;
  /** `whsec_…`: the key for `verifySignature`. */
  signing_secret: string;
  subscribed_events: WebhookEventType[];
  is_active: boolean;
  created_at: string;
}

export interface CreateWebhookParams {
  /** HTTPS and reachable from the internet. */
  url: string;
  description?: string;
  /** Leave out to receive every event. */
  subscribed_events?: WebhookEventType[];
}

export interface UpdateWebhookParams {
  url?: string;
  description?: string;
  subscribed_events?: WebhookEventType[];
  is_active?: boolean;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  workspace_id: string;
  url: string;
  event_type: WebhookEventType | "webhook.test";
  /** The JSON body that was sent, as a string. */
  payload: string;
  signature: string;
  response_status: number;
  attempt_count: number;
  status: "pending" | "delivered" | "failed";
  next_attempt_at?: string;
  last_error?: string;
  created_at: string;
}

export interface ListWebhookDeliveriesParams extends ListParams {
  webhook_id?: string;
}

/** The JSON body Postilon posts to a webhook endpoint. Narrow on `type`. */
export type WebhookEvent = EmailWebhookEvent | TestWebhookEvent;

export interface EmailWebhookEvent {
  id: string;
  type: WebhookEventType;
  created_at: string;
  workspace_id: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    recipient: string;
    status: EmailStatus;
    metadata: Record<string, string> | null;
    tags: Tag[] | null;
  };
}

/** Sent by `webhooks.test` and the dashboard's test button. */
export interface TestWebhookEvent {
  id: string;
  type: "webhook.test";
  created_at: string;
  workspace_id: string;
  data: { message: string; status: string };
}
