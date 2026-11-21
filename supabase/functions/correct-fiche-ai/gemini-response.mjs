function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function joinTextParts(parts) {
    return parts.flatMap((part) =>
        isRecord(part) && part.type === "text" && typeof part.text === "string" && part.text.trim()
            ? [part.text.trim()]
            : []
    ).join("\n").trim();
}

/**
 * Extracts the final textual answer from Gemini Interactions API responses.
 * Current responses use steps[].content[]; output_text and legacy shapes
 * remain supported to make deployments resilient across API revisions.
 */
export function extractOutputText(value) {
    if (!isRecord(value)) throw new Error("Réponse Gemini absente.");

    if (typeof value.output_text === "string" && value.output_text.trim()) {
        return value.output_text.trim();
    }

    if (Array.isArray(value.steps)) {
        const text = value.steps.flatMap((step) => {
            if (!isRecord(step) || step.type !== "model_output" || !Array.isArray(step.content)) return [];
            return [joinTextParts(step.content)];
        }).filter(Boolean).join("\n").trim();
        if (text) return text;
    }

    // Compatibility with the earlier Interactions response shape.
    if (Array.isArray(value.output)) {
        const text = value.output.flatMap((step) => {
            if (!isRecord(step) || step.type !== "model_output" || !Array.isArray(step.content)) return [];
            return [joinTextParts(step.content)];
        }).filter(Boolean).join("\n").trim();
        if (text) return text;
    }

    // Legacy Interactions API returned a flat outputs[] list of text blocks.
    if (Array.isArray(value.outputs)) {
        const text = value.outputs.flatMap((item) => {
            if (!isRecord(item)) return [];
            if (item.type === "text" && typeof item.text === "string" && item.text.trim()) {
                return [item.text.trim()];
            }
            return Array.isArray(item.content) ? [joinTextParts(item.content)] : [];
        }).filter(Boolean).join("\n").trim();
        if (text) return text;
    }

    throw new Error("Texte de correction absent de la réponse Gemini.");
}

export function extractGenerateContentText(value) {
    if (!isRecord(value) || !Array.isArray(value.candidates)) {
        throw new Error("Réponse Gemini absente.");
    }
    const candidate = value.candidates.find((item) => isRecord(item));
    if (!candidate || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) {
        throw new Error("Texte de correction absent de la réponse Gemini.");
    }
    const text = candidate.content.parts.flatMap((part) =>
        isRecord(part) && typeof part.text === "string" && part.text.trim() ? [part.text.trim()] : []
    ).join("\n").trim();
    if (!text) throw new Error("Texte de correction absent de la réponse Gemini.");
    return text;
}
