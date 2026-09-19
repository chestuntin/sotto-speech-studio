export async function transcribe(
  file: File,
  signal: AbortSignal,
  onText: (text: string) => void,
): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/transcribe", {
    method: "POST",
    body: form,
    signal,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Transcription failed. Please try again.");
  }
  if (response.headers.get("content-type")?.includes("application/json")) {
    const body = await response.json();
    if (typeof body.text !== "string")
      throw new Error(
        "The API returned an incomplete transcript. Please retry.",
      );
    onText(body.text);
    return body.text;
  }
  const reader = response.body?.getReader();
  if (!reader)
    throw new Error("Your browser could not read the transcript stream.");
  const decoder = new TextDecoder();
  let buffer = "",
    text = "",
    completed = false;
  const processEvent = (block: string) => {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") return;
    const event = JSON.parse(data);
    if (event.type === "error" || event.error)
      throw new Error(
        "The transcription stream failed. Your audio is ready to retry.",
      );
    if (
      event.type === "transcript.text.delta" &&
      typeof event.delta === "string"
    ) {
      text += event.delta;
      onText(text);
    }
    if (
      event.type === "transcript.text.done" &&
      typeof event.text === "string"
    ) {
      text = event.text;
      completed = true;
      onText(text);
    }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      buffer = buffer.replace(/\r\n/g, "\n");
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        processEvent(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
      }
      if (done) {
        if (buffer.trim()) processEvent(buffer);
        break;
      }
    }
    if (!completed)
      throw new Error(
        "The connection ended before the transcript was complete. Please retry.",
      );
    return text;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
