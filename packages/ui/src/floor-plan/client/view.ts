/** The plan's viewport: a scale and an offset in screen pixels. Pure, so the browser and the tests share it. */
export interface View {
	k: number;
	tx: number;
	ty: number;
}

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 40;

export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

export function clampZoom(k: number): number {
	return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, k));
}

/** Zooms by `factor` keeping the point (px, py) of the stage where it is. */
export function zoomAt(v: View, factor: number, px: number, py: number): View {
	const k = clampZoom(v.k * factor);
	const f = k / v.k;
	return { k, tx: px - (px - v.tx) * f, ty: py - (py - v.ty) * f };
}

export function panBy(v: View, dx: number, dy: number): View {
	return { ...v, tx: v.tx + dx, ty: v.ty + dy };
}

/** The view that shows `box` (plan units) whole in a stage of `width` × `height` pixels, with `pad` pixels around it. */
export function fitBox(box: Box, width: number, height: number, pad: number, maxK = 14): View {
	if (box.w <= 0 || box.h <= 0 || width <= 0 || height <= 0) return { k: 1, tx: 0, ty: 0 };
	const k = clampZoom(Math.min(maxK, (width - 2 * pad) / box.w, (height - 2 * pad) / box.h));
	return { k, tx: (width - box.w * k) / 2 - box.x * k, ty: (height - box.h * k) / 2 - box.y * k };
}

export function toWorld(v: View, px: number, py: number): { x: number; y: number } {
	return { x: (px - v.tx) / v.k, y: (py - v.ty) / v.k };
}

/** A pinch: the view after two fingers moved from (a0, b0) to (a1, b1). */
export function pinch(v: View, a0: Pt, b0: Pt, a1: Pt, b1: Pt): View {
	const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y);
	const d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y);
	const c0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
	const c1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
	const zoomed = d0 < 1 ? v : zoomAt(v, d1 / d0, c0.x, c0.y);
	return panBy(zoomed, c1.x - c0.x, c1.y - c0.y);
}

export interface Pt {
	x: number;
	y: number;
}

export function transformOf(v: View): string {
	return `matrix(${v.k} 0 0 ${v.k} ${v.tx} ${v.ty})`;
}
