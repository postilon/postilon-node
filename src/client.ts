import { errorFromResponse } from "./errors.js";
import { verifyWebhookSignature, type VerifySignatureOptions } from "./signature.js";
import type {
  CreateDomainParams,
  CreateSuppressionParams,
  CreateTemplateParams,
  CreateWebhookParams,
  Deleted,
  Domain,
  DomainVerification,
  Email,
  FileObject,
  InboundEmail,
  List,
  ListEmailsParams,
  ListInboundParams,
  ListParams,
  ListWebhookDeliveriesParams,
  SendBatchParams,
  SendBatchResponse,
  SendEmailOptions,
  SendEmailParams,
  SendEmailResponse,
  Suppression,
  Template,
  UpdateDomainParams,
  UpdateTemplateParams,
  UpdateWebhookParams,
  UploadFileParams,
  Webhook,
  WebhookDelivery,
  WebhookEventType,
} from "./types.js";

export interface PostilonOptions {
  /** Defaults to `https://api.postilon.com`. */
  baseUrl?: string;
}

type Query = Record<string, string | number | undefined>;

interface RequestOptions {
  query?: Query;
  body?: unknown;
  idempotencyKey?: string;
  /** How to read a successful response: JSON (the default), bytes or text. */
  as?: "json" | "bytes" | "text";
}

type RequestFn = <T>(method: string, path: string, options?: RequestOptions) => Promise<T>;

const id = (value: string) => encodeURIComponent(value);

/**
 * Client for the Postilon API. Every method resolves with the parsed JSON response, and
 * rejects with a `PostilonError` when the API answers with an error.
 *
 * ```ts
 * const postilon = new Postilon(process.env.POSTILON_API_KEY!);
 * await postilon.emails.send({ from: "hello@acme.com", to: "jane@example.com", subject: "Hi", text: "Hello" });
 * ```
 */
export class Postilon {
  readonly emails: Emails;
  readonly domains: Domains;
  readonly templates: Templates;
  readonly files: Files;
  readonly suppressions: Suppressions;
  readonly webhooks: Webhooks;
  readonly inbound: Inbound;

  /** @param apiKey A `ps_live_…` or `ps_test_…` key. */
  constructor(apiKey: string, options: PostilonOptions = {}) {
    if (!apiKey) throw new Error("Postilon: an API key is required (ps_live_… or ps_test_…).");
    const baseUrl = (options.baseUrl ?? "https://api.postilon.com").replace(/\/+$/, "");

    const request: RequestFn = async <T>(method: string, path: string, { query, body, idempotencyKey, as }: RequestOptions = {}) => {
      const url = new URL(baseUrl + path);
      for (const [key, value] of Object.entries(query ?? {})) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      };
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

      const res = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.ok && as === "bytes") return new Uint8Array(await res.arrayBuffer()) as T;
      const text = await res.text();
      if (!res.ok) throw errorFromResponse(res.status, res.headers, text);
      return (as === "text" ? text : JSON.parse(text)) as T;
    };

    this.emails = new Emails(request);
    this.domains = new Domains(request);
    this.templates = new Templates(request);
    this.files = new Files(request);
    this.suppressions = new Suppressions(request);
    this.webhooks = new Webhooks(request);
    this.inbound = new Inbound(request);
  }
}

export class Emails {
  constructor(private readonly request: RequestFn) {}

  /** `POST /v1/emails`. `idempotencyKey` is sent as the `Idempotency-Key` header. */
  send(params: SendEmailParams, options: SendEmailOptions = {}): Promise<SendEmailResponse> {
    return this.request("POST", "/v1/emails", { body: params, idempotencyKey: options.idempotencyKey });
  }

  /** `POST /v1/emails/batch`: up to 100 emails, all or nothing. */
  sendBatch(params: SendBatchParams): Promise<SendBatchResponse> {
    return this.request("POST", "/v1/emails/batch", { body: params });
  }

  /** `GET /v1/emails/{id}`, with its events. */
  get(emailId: string): Promise<Email> {
    return this.request("GET", `/v1/emails/${id(emailId)}`);
  }

  /** `GET /v1/emails`, newest first. */
  list(params: ListEmailsParams = {}): Promise<List<Email>> {
    return this.request("GET", "/v1/emails", { query: { ...params } });
  }

  /** `POST /v1/emails/{id}/cancel`: a queued or scheduled email; fails with `409 cannot_cancel` once delivery started. */
  cancel(emailId: string): Promise<Omit<Email, "source">> {
    return this.request("POST", `/v1/emails/${id(emailId)}/cancel`);
  }
}

export class Domains {
  constructor(private readonly request: RequestFn) {}

  create(params: CreateDomainParams): Promise<Domain> {
    return this.request("POST", "/v1/domains", { body: params });
  }

  list(params: ListParams = {}): Promise<List<Domain>> {
    return this.request("GET", "/v1/domains", { query: { ...params } });
  }

  get(domainId: string): Promise<Domain> {
    return this.request("GET", `/v1/domains/${id(domainId)}`);
  }

  /** Checks the domain's DNS records now. */
  verify(domainId: string): Promise<DomainVerification> {
    return this.request("POST", `/v1/domains/${id(domainId)}/verify`);
  }

  /** Turns open or click tracking on or off, or inbound email (`inbound_domain`, `""` for off). */
  update(domainId: string, params: UpdateDomainParams): Promise<Domain> {
    return this.request("PATCH", `/v1/domains/${id(domainId)}`, { body: params });
  }

  delete(domainId: string): Promise<Deleted> {
    return this.request("DELETE", `/v1/domains/${id(domainId)}`);
  }
}

export class Templates {
  constructor(private readonly request: RequestFn) {}

  create(params: CreateTemplateParams): Promise<Template> {
    return this.request("POST", "/v1/templates", { body: params });
  }

  list(params: ListParams = {}): Promise<List<Template>> {
    return this.request("GET", "/v1/templates", { query: { ...params } });
  }

  get(templateId: string): Promise<Template> {
    return this.request("GET", `/v1/templates/${id(templateId)}`);
  }

  update(templateId: string, params: UpdateTemplateParams): Promise<Template> {
    return this.request("PATCH", `/v1/templates/${id(templateId)}`, { body: params });
  }

  delete(templateId: string): Promise<Deleted> {
    return this.request("DELETE", `/v1/templates/${id(templateId)}`);
  }
}

export class Files {
  constructor(private readonly request: RequestFn) {}

  /** Uploads an attachment to reuse in many emails as `{ file_id }`. */
  upload(params: UploadFileParams): Promise<FileObject> {
    return this.request("POST", "/v1/files", { body: params });
  }

  list(params: ListParams = {}): Promise<List<FileObject>> {
    return this.request("GET", "/v1/files", { query: { ...params } });
  }

  delete(fileId: string): Promise<Deleted> {
    return this.request("DELETE", `/v1/files/${id(fileId)}`);
  }
}

export class Suppressions {
  constructor(private readonly request: RequestFn) {}

  list(params: ListParams = {}): Promise<List<Suppression>> {
    return this.request("GET", "/v1/suppressions", { query: { ...params } });
  }

  create(params: CreateSuppressionParams): Promise<Suppression> {
    return this.request("POST", "/v1/suppressions", { body: params });
  }

  /** Removes a suppression (`sup_…`), so the address can be sent to again. */
  delete(suppressionId: string): Promise<Deleted> {
    return this.request("DELETE", `/v1/suppressions/${id(suppressionId)}`);
  }
}

export class Webhooks {
  constructor(private readonly request: RequestFn) {}

  /** The response's `signing_secret` is the key for `verifySignature`. */
  create(params: CreateWebhookParams): Promise<Webhook> {
    return this.request("POST", "/v1/webhooks", { body: params });
  }

  list(params: ListParams = {}): Promise<List<Webhook>> {
    return this.request("GET", "/v1/webhooks", { query: { ...params } });
  }

  get(webhookId: string): Promise<Webhook> {
    return this.request("GET", `/v1/webhooks/${id(webhookId)}`);
  }

  update(webhookId: string, params: UpdateWebhookParams): Promise<Webhook> {
    return this.request("PATCH", `/v1/webhooks/${id(webhookId)}`, { body: params });
  }

  delete(webhookId: string): Promise<Deleted> {
    return this.request("DELETE", `/v1/webhooks/${id(webhookId)}`);
  }

  /** Sends a `webhook.test` event to the endpoint. */
  test(webhookId: string): Promise<WebhookDelivery> {
    return this.request("POST", `/v1/webhooks/${id(webhookId)}/test`);
  }

  /** `GET /v1/webhooks/events`: the event types an endpoint can subscribe to. */
  listEventTypes(): Promise<{ data: WebhookEventType[] }> {
    return this.request("GET", "/v1/webhooks/events");
  }

  /** Recent deliveries, optionally of one endpoint (`webhook_id`). */
  listDeliveries(params: ListWebhookDeliveriesParams = {}): Promise<List<WebhookDelivery>> {
    return this.request("GET", "/v1/webhooks/deliveries", { query: { ...params } });
  }

  /** Sends a delivery again, as a new delivery. */
  replayDelivery(deliveryId: string): Promise<WebhookDelivery> {
    return this.request("POST", `/v1/webhooks/deliveries/${id(deliveryId)}/replay`);
  }

  /** See `verifyWebhookSignature`. */
  verifySignature(
    rawBody: string | Uint8Array,
    header: string | null | undefined,
    secret: string,
    options?: VerifySignatureOptions,
  ): boolean {
    return verifyWebhookSignature(rawBody, header, secret, options);
  }
}

/** Email received on an inbound domain (https://postilon.com/docs/inbound). */
export class Inbound {
  constructor(private readonly request: RequestFn) {}

  /** `GET /v1/inbound`, newest first; `q` searches the subject, sender and recipient. */
  list(params: ListInboundParams = {}): Promise<List<InboundEmail>> {
    return this.request("GET", "/v1/inbound", { query: { ...params } });
  }

  /** `GET /v1/inbound/{id}`, with its headers. */
  get(inboundId: string): Promise<InboundEmail> {
    return this.request("GET", `/v1/inbound/${id(inboundId)}`);
  }

  /** Attachment `index` (from 0, as in `attachments`), as bytes. */
  attachment(inboundId: string, index: number): Promise<Uint8Array> {
    return this.request("GET", `/v1/inbound/${id(inboundId)}/attachments/${index}`, { as: "bytes" });
  }

  /** The message as received (RFC 5322). */
  raw(inboundId: string): Promise<string> {
    return this.request("GET", `/v1/inbound/${id(inboundId)}/raw`, { as: "text" });
  }
}
