# Source adapters

Use capability negotiation before platform-specific assumptions. The adapter's job is to enumerate authorised evidence read-only and emit the neutral source snapshot; it is not the knowledge model.

## Adapter families

| Family | Common examples | Preferred route | Important losses or cautions |
|---|---|---|---|
| Local filesystem | Windows, macOS, Linux, NAS mount | Local deterministic scan | Local access does not reveal cloud sharing, comment history, or authoritative versions. |
| Synced cloud folder | OneDrive, SharePoint sync, Google Drive Desktop, Dropbox, Box Drive | Local scan labelled `synced-folder` | Placeholders may not be hydrated; ACLs, native document content, versions, comments, stable web IDs, and change history may be absent. |
| Cloud file/document platform | Google Drive and Docs, OneDrive and SharePoint, Dropbox, Box | Approved host connector or read-only API | Connector scopes vary. Native documents may need export for body text. Preserve web IDs, URLs, versions, owners, and modified times when exposed. |
| Collaboration and messaging | Slack, Teams, email, project comments | Approved connector or bounded export | Threads, edits, reactions, retention rules, private channels, attachments, and deleted content affect meaning and coverage. |
| Knowledge and work management | Notion, Confluence, Airtable, Asana, Trello, ClickUp | Approved connector/API or export | Database relations, page hierarchy, field types, automations, comments, and row permissions can be lost in flat exports. |
| Creative and design | Figma, Canva, Adobe, Frame.io, DAM/PIM/PLM systems | Approved connector/API or structured export | Renditions are not originals; component relationships, approvals, usage rights, comments, and asset versions are consequential. |
| Object/database storage | S3-compatible stores, data warehouses, SQL/NoSQL databases | Read-only inventory/query adapter | Do not pull full tables by default. Record schema, partitions, sensitivity boundary, row sampling, and query provenance. |
| Web and publishing | Websites, CMSs, intranets, public URLs | Sitemap/API/export or authorised crawl | Robots and login boundaries matter; published pages may not represent drafts, permissions, or current internal authority. |
| Archive/export | ZIP, Takeout, PST/MBOX, CSV, JSON, HTML export | Local scan plus export-specific parser | It is a point-in-time derivative. Record export date, original platform, and metadata lost during export. |
| Unknown | Any future or proprietary platform | Generic snapshot adapter | State every capability as available, partial, unavailable, unknown, or not-requested. Never invent native support. |

## Google Drive and Docs

Prefer a connector or Drive API route when stable file IDs, MIME types, owners, sharing, modified times, and native Docs/Sheets/Slides exports matter. A desktop-synced folder is acceptable for inventory, but it may expose shortcuts or placeholders rather than document bodies and rarely represents sharing or version history completely.

Treat a Google Docs export as a derivative. Keep the original file ID or web URL when available, the export format, and export time.

## Microsoft OneDrive and SharePoint

Prefer an approved Microsoft Graph or host connector route when site/library identity, item IDs, web URLs, sharing, version history, or sensitivity labels matter. A synced folder is a local projection and may omit cloud-only metadata or contain unhydrated Files On-Demand placeholders.

Record whether the scope is a personal OneDrive, a SharePoint document library, or a Teams-backed library; the visible folder name alone may not establish this.

## Connector decision rule

Use the least invasive route that can answer the consequential question. Do not require an API integration when a bounded export is sufficient. Do not accept an export as complete when authority, versions, comments, ACLs, or change tracking determine the recommendation.

If the host lacks an approved connector, ask for one of these instead:

1. an authorised locally synced folder;
2. a bounded export with export time and scope;
3. a source-owner walkthrough with attributed answers;
4. a later connector phase recorded as a coverage gap.

Never ask the user to paste credentials into the case or prompt.

