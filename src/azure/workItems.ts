import * as azdev from "azure-devops-node-api";
import type { IWorkItemTrackingApi } from "azure-devops-node-api/WorkItemTrackingApi";
import { config } from "../config/env";

const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;
const MAX_ATTACHMENTS = 10;

export interface BugDetails {
  id: number;
  title: string;
  description: string;
  reproSteps: string;
  acceptanceCriteria: string;
  attachments: AttachmentInfo[];
}

export interface AttachmentInfo {
  name: string;
  url: string;
  mimeType: string;
  content?: string;
  base64?: string;
}

let witApi: IWorkItemTrackingApi | null = null;

async function getWitApi(): Promise<IWorkItemTrackingApi> {
  if (witApi) return witApi;
  const authHandler = azdev.getPersonalAccessTokenHandler(config.ado.pat);
  const connection = new azdev.WebApi(config.ado.orgUrl, authHandler);
  witApi = await connection.getWorkItemTrackingApi();
  return witApi;
}

function stripHtml(html: string | undefined): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(div|p|li|ul|ol|h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function fetchBugDetails(ticketId: number): Promise<BugDetails> {
  const api = await getWitApi();

  const workItem = await api.getWorkItem(
    ticketId,
    [
      "System.Title",
      "System.Description",
      "Microsoft.VSTS.TCM.ReproSteps",
      "Microsoft.VSTS.Common.AcceptanceCriteria",
    ],
    undefined,
    undefined,
    config.ado.project
  );

  if (!workItem || !workItem.fields) {
    throw new Error(`Work item #${ticketId} not found`);
  }

  const fields = workItem.fields;
  const attachments = await fetchAttachments(ticketId);

  return {
    id: ticketId,
    title: fields["System.Title"] || "Untitled",
    description: stripHtml(fields["System.Description"]),
    reproSteps: stripHtml(fields["Microsoft.VSTS.TCM.ReproSteps"]),
    acceptanceCriteria: stripHtml(fields["Microsoft.VSTS.Common.AcceptanceCriteria"]),
    attachments,
  };
}

async function fetchAttachments(ticketId: number): Promise<AttachmentInfo[]> {
  const api = await getWitApi();
  const workItem = await api.getWorkItem(ticketId, undefined, undefined, 4 /* All */, config.ado.project);

  if (!workItem?.relations) return [];

  const attachmentRelations = workItem.relations.filter(
    (r) => r.rel === "AttachedFile" && r.url
  );

  const results: AttachmentInfo[] = [];

  for (const rel of attachmentRelations.slice(0, MAX_ATTACHMENTS)) {
    const name = rel.attributes?.["name"] || "unknown";
    const url = rel.url!;
    const mimeType = (rel.attributes?.["resourceMimeType"] as string) || "application/octet-stream";

    const info: AttachmentInfo = { name, url, mimeType };

    try {
      const isImage = mimeType.startsWith("image/");
      const isText =
        mimeType.startsWith("text/") ||
        mimeType === "application/json" ||
        name.endsWith(".log") ||
        name.endsWith(".txt") ||
        name.endsWith(".json");

      if (isImage || isText) {
        const attachmentId = url.split("/").pop()!;
        const stream = await api.getAttachmentContent(attachmentId, undefined, config.ado.project);

        const chunks: Buffer[] = [];
        let totalSize = 0;
        for await (const chunk of stream as AsyncIterable<Buffer>) {
          totalSize += chunk.length;
          if (totalSize > MAX_ATTACHMENT_SIZE) break;
          chunks.push(chunk);
        }

        if (totalSize > MAX_ATTACHMENT_SIZE) {
          console.warn(`Attachment ${name} exceeds ${MAX_ATTACHMENT_SIZE / (1024 * 1024)}MB limit, skipping content`);
        } else {
          const buffer = Buffer.concat(chunks);
          if (isImage) {
            info.base64 = buffer.toString("base64");
          } else {
            info.content = buffer.toString("utf-8");
          }
        }
      }
    } catch (err) {
      console.warn(`Failed to download attachment ${name}:`, err);
    }

    results.push(info);
  }

  if (attachmentRelations.length > MAX_ATTACHMENTS) {
    console.warn(`Ticket #${ticketId} has ${attachmentRelations.length} attachments, only processing first ${MAX_ATTACHMENTS}`);
  }

  return results;
}
