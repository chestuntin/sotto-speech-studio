export type Session = {
  id: string;
  title: string;
  text: string;
  created: number;
  duration: number;
  model: string;
  demo?: boolean;
};
export function loadSessions(): Session[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem("sotto-sessions") || "[]",
    );
    if (!Array.isArray(value)) return [];
    return value
      .filter((s): s is Session =>
        Boolean(
          s &&
          typeof s.id === "string" &&
          typeof s.title === "string" &&
          typeof s.text === "string" &&
          typeof s.created === "number" &&
          typeof s.duration === "number" &&
          typeof s.model === "string",
        ),
      )
      .slice(0, 30);
  } catch {
    return [];
  }
}
export const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
export function download(content: Blob, filename: string) {
  const url = URL.createObjectURL(content);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
