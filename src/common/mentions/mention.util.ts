/**
 * Legacy: @ then one non-whitespace chunk (supports @user@domain.com).
 */
export function extractMentionHandles(text: string): string[] {
    if (!text || !text.includes('@')) return [];
    const re = /@([^\s]+)/g;
    const out = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        const raw = m[1]?.trim();
        if (raw) out.add(raw);
    }
    return [...out];
}

/**
 * Extracts mention handles using known full names (longest match first) plus email-shaped @user@domain tokens.
 * Required for multi-word names like "@Jane Doe".
 */
export function extractMentionHandlesWithCatalog(
    text: string,
    fullNames: string[],
): string[] {
    if (!text || !text.includes('@')) return [];
    const sortedNames = [...new Set(fullNames.map((n) => n.trim()).filter(Boolean))].sort(
        (a, b) => b.length - a.length,
    );
    const handles = new Set<string>();
    let i = 0;
    while (i < text.length) {
        if (text[i] !== '@') {
            i++;
            continue;
        }
        const rest = text.slice(i + 1);
        const emailMatch = rest.match(/^([^\s@]+@[^\s@]+\.[^\s@]+)/);
        if (emailMatch) {
            handles.add(emailMatch[1].trim());
            i += 1 + emailMatch[0].length;
            continue;
        }
        let matched = false;
        for (const name of sortedNames) {
            if (name.length === 0) continue;
            const chunk = rest.slice(0, name.length);
            if (chunk.length < name.length) continue;
            if (chunk.toLowerCase() !== name.toLowerCase()) continue;
            const boundary = rest[name.length];
            const boundaryOk =
                boundary === undefined ||
                /\s/.test(boundary) ||
                /[.,;:!?]/.test(boundary) ||
                boundary === '@';
            if (boundaryOk) {
                handles.add(name);
                i += 1 + name.length;
                matched = true;
                break;
            }
        }
        if (!matched) i++;
    }
    return [...handles];
}

export function joinTextsForMentions(parts: (string | null | undefined)[]): string {
    return parts.filter((p): p is string => Boolean(p && p.trim())).join('\n');
}
