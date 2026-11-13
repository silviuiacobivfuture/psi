import { Banner, EmptyState, Icon, OverflowMenu, Sheet } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { ActionBar, actionsFor, EmptyActions, menuItems } from "../actions/render";
import type { Ctx } from "../lib/context";
import { at } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import { type ClientFile, FILE_MAX_BYTES, FILE_TYPES } from "../port/schema-clinical";
import { stampText } from "./client-notes";
import { SheetButtons } from "./client-sheets";

export const sizeText = (bytes: number): string =>
	bytes < 1024
		? `${bytes} B`
		: bytes < 1024 * 1024
			? `${(bytes / 1024).toFixed(0)} kB`
			: `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/** What a browser can show in a tab without running anything from the file. */
export const previewable = (contentType: string): boolean =>
	contentType.startsWith("image/") ||
	contentType === "application/pdf" ||
	contentType === "text/plain";

export function FilesTab({
	ctx,
	clientId,
	files,
	notice,
}: {
	ctx: Ctx;
	clientId: string;
	files: ReadonlyArray<ClientFile>;
	notice: "invalid" | "too-big" | null;
}): JSX.Element {
	const o = at(ctx.locale);
	const entity = { clientId };
	return (
		<div class="cl-tab">
			{notice === null ? null : (
				<Banner tone="error" icon="alert">
					{notice === "too-big"
						? m.cl_file_too_big({ mb: FILE_MAX_BYTES / 1_000_000 }, o)
						: m.cl_file_invalid({}, o)}
				</Banner>
			)}
			<ActionBar ctx={ctx} screen="client.files" entity={entity} />
			{files.length === 0 ? (
				<EmptyState
					icon="archive"
					title={m.files_empty_title({}, o)}
					text={m.files_empty_text({}, o)}
				>
					<EmptyActions ctx={ctx} screen="client.files" entity={entity} />
				</EmptyState>
			) : (
				<ul class="cl-rows" aria-label={m.tab_files({}, o)}>
					{files.map((f) => {
						const e = { clientId, id: f.id };
						const download = actionsFor(ctx, "client.files", "menu", e).find(
							(a) => a.id === "file.download",
						);
						const href = download?.to?.(e);
						return (
							<li key={f.id} class="cl-row" data-file={f.id}>
								<Icon name="file" />
								<div class="cl-row__main">
									<strong class="cl-row__name">{f.name}</strong>
									<span class="adm-muted">
										{sizeText(f.size)} · {f.uploadedByName} · {stampText(ctx.locale, f.createdAt)}
									</span>
								</div>
								{href !== undefined && previewable(f.contentType) ? (
									<a
										class="adm-iconbtn"
										data-action="file.download"
										href={`${href}?inline=1`}
										target="_blank"
										rel="noopener"
										aria-label={m.cl_file_preview({}, o)}
									>
										<Icon name="file" />
									</a>
								) : null}
								{href === undefined ? null : (
									<a
										class="adm-iconbtn"
										data-action="file.download"
										href={href}
										aria-label={m.ac_file_download({}, o)}
									>
										<Icon name="download" />
									</a>
								)}
								<OverflowMenu
									id={`file-${f.id}`}
									label={m.client_more({}, o)}
									items={menuItems(ctx, "client.files", e).filter((i) => i.key !== "file.download")}
								/>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}

/**
 * Drop files, pick them, or take a photo; several at once; a bar per file while it goes up. Without scripting the form
 * still posts the picked files in one request.
 */
const UPLOAD_JS = `(() => {
  const form = document.querySelector('[data-form=file-upload]');
  if (!form) return;
  const drop = form.querySelector('[data-drop]');
  const input = form.querySelector('input[name=files]');
  const camera = form.querySelector('input[data-camera]');
  const list = form.querySelector('[data-queue]');
  const go = form.querySelector('[data-go]');
  let files = [];
  const draw = () => {
    list.replaceChildren(...files.map((f) => { const li = document.createElement('li'); li.className = 'cl-queue__item'; li.textContent = f.name + ' · ' + Math.max(1, Math.round(f.size / 1024)) + ' kB'; const bar = document.createElement('progress'); bar.max = 100; bar.value = 0; bar.setAttribute('aria-label', f.name); li.append(bar); return li; }));
    go.disabled = files.length === 0;
  };
  const add = (picked) => { files = files.concat([...picked]); draw(); };
  input.addEventListener('change', () => { add(input.files); input.value = ''; });
  camera?.addEventListener('change', () => { add(camera.files); camera.value = ''; });
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.dataset.over = 'true'; }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.dataset.over = 'false'; }));
  drop.addEventListener('drop', (e) => add(e.dataTransfer?.files ?? []));
  form.addEventListener('submit', (e) => {
    if (files.length === 0) { e.preventDefault(); return; }
    e.preventDefault();
    const body = new FormData();
    files.forEach((f) => body.append('files', f, f.name));
    const bars = list.querySelectorAll('progress');
    const xhr = new XMLHttpRequest();
    xhr.open('POST', form.action);
    xhr.upload.addEventListener('progress', (ev) => { if (ev.lengthComputable) bars.forEach((b) => { b.value = Math.round((ev.loaded / ev.total) * 100); }); });
    xhr.addEventListener('load', () => { window.location.assign(xhr.responseURL || window.location.href); });
    xhr.addEventListener('error', () => { form.dataset.failed = 'true'; go.disabled = false; });
    go.disabled = true;
    xhr.send(body);
  });
  draw();
})();`;

export function UploadSheet({ ctx, clientId }: { ctx: Ctx; clientId: string }): JSX.Element {
	const o = at(ctx.locale);
	return (
		<Sheet signal="newFile" title={m.ac_file_upload({}, o)} closeLabel={m.close({}, o)}>
			<form
				method="post"
				action={`/clients/${clientId}/files`}
				enctype="multipart/form-data"
				class="cl-form"
				data-form="file-upload"
			>
				<label class="cl-drop" data-drop>
					<Icon name="download" />
					<strong>{m.cl_file_drop({}, o)}</strong>
					<span class="adm-muted">{m.cl_file_or_pick({}, o)}</span>
					<input class="adm-sr" type="file" name="files" multiple accept={FILE_TYPES.join(",")} />
				</label>
				<label class="adm-btn cl-camera">
					<Icon name="plus" />
					{m.cl_file_camera({}, o)}
					<input class="adm-sr" type="file" accept="image/*" capture="environment" data-camera />
				</label>
				<ul class="cl-queue" data-queue aria-live="polite" />
				<p class="adm-muted">{m.cl_file_limits({ mb: FILE_MAX_BYTES / 1_000_000 }, o)}</p>
				<div class="cl-buttons">
					<button class="adm-btn adm-btn--primary" type="submit" data-go>
						{m.cl_file_send({}, o)}
					</button>
					<button class="adm-btn" type="button" data-on:click="$newFile = false">
						{m.cancel({}, o)}
					</button>
				</div>
			</form>
			<script dangerouslySetInnerHTML={{ __html: UPLOAD_JS }} />
		</Sheet>
	);
}

export function RenameSheet({
	ctx,
	clientId,
	file,
}: {
	ctx: Ctx;
	clientId: string;
	file: ClientFile;
}): JSX.Element {
	const o = at(ctx.locale);
	return (
		<Sheet signal="renameFile" title={m.ac_file_rename({}, o)} closeLabel={m.close({}, o)}>
			<form
				method="post"
				action={`/clients/${clientId}/files/${file.id}/rename`}
				class="cl-form"
				data-form="file-rename"
			>
				<input type="hidden" name="clientId" value={clientId} />
				<input type="hidden" name="id" value={file.id} />
				<label class="adm-field">
					<span>{m.cl_file_name({}, o)}</span>
					<input class="adm-input" name="name" required maxlength={200} value={file.name} />
				</label>
				<SheetButtons go={m.cl_save({}, o)} signal="renameFile" cancel={m.cancel({}, o)} />
			</form>
		</Sheet>
	);
}
