/**
 * ادغام/جداسازی توضیحات چندکاربره — جداکننده: " :- "
 */

export const NOTES_SEPARATOR = ' :- ';

export function splitNotesSegments(notes: unknown): string[] {
    const raw = String(notes ?? '').trim();
    if (!raw) return [];
    return raw
        .split(/\s*:-\s*/)
        .map((s) => s.trim())
        .filter(Boolean);
}

export function joinAnnouncementNotes(...parts: unknown[]): string | undefined {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const part of parts) {
        const segments = splitNotesSegments(part);
        const fallback = String(part ?? '').trim();
        const list = segments.length > 0 ? segments : fallback ? [fallback] : [];
        for (const seg of list) {
            const key = seg.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(seg);
        }
    }
    return out.length > 0 ? out.join(NOTES_SEPARATOR) : undefined;
}

export function partitionNotesForDestinationSplit(
    combinedNotes: unknown,
    opts: {
        leavingCreatorId?: string | null;
        remainingCreatorIds?: Array<string | null | undefined>;
    } = {}
): { hostNotes?: string; splitNotes?: string } {
    const segments = splitNotesSegments(combinedNotes);
    if (segments.length === 0) return {};

    const leaving = opts.leavingCreatorId != null ? String(opts.leavingCreatorId) : '';
    const remainingCreators = new Set(
        (opts.remainingCreatorIds || [])
            .map((id) => (id != null ? String(id) : ''))
            .filter(Boolean)
    );
    const leavingStillOnHost = Boolean(leaving && remainingCreators.has(leaving));

    if (segments.length === 1) {
        const only = segments[0];
        if (leaving && !leavingStillOnHost) {
            return { hostNotes: undefined, splitNotes: only };
        }
        return { hostNotes: only, splitNotes: only };
    }

    if (leaving && !leavingStillOnHost) {
        return {
            splitNotes: segments[segments.length - 1],
            hostNotes: joinAnnouncementNotes(...segments.slice(0, -1)),
        };
    }

    const all = joinAnnouncementNotes(...segments);
    return { hostNotes: all, splitNotes: all };
}
