import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

export interface ExtractedFileContent {
  text: string;
  base64?: string;
  mimeType?: string;
}

export async function extractTextFromFile(file: File): Promise<ExtractedFileContent> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return extractFromPDF(file);
  }
  return { text: await file.text() };
}

async function extractFromPDF(file: File): Promise<ExtractedFileContent> {
  const arrayBuffer = await file.arrayBuffer();
  
  // Copy the buffer before PDF.js consumes it (it detaches the original)
  const bufferCopy = arrayBuffer.slice(0);

  // Try native text extraction first
  let text = "";
  try {
    const pdf = await pdfjsLib.getDocument({ data: bufferCopy }).promise;
    const textParts: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((item: any) => item.str).join(" ");
      textParts.push(pageText);
    }
    text = textParts.join("\n\n");
  } catch (e) {
    console.warn("PDF text extraction failed:", e);
  }

  // Quality check - if text is poor, include base64 for vision API fallback
  const letterCount = (text.match(/[a-zA-Z]/g) || []).length;
  const isPoor = text.trim().length < 200 || letterCount < 100;

  // Always convert to base64 using the original (non-detached) buffer
  const uint8 = new Uint8Array(arrayBuffer);
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < uint8.length; i += chunkSize) {
    binary += String.fromCharCode(...uint8.slice(i, i + chunkSize));
  }
  const base64 = btoa(binary);

  return {
    text: isPoor ? "" : text,
    base64: isPoor ? base64 : undefined,
    mimeType: isPoor ? "application/pdf" : undefined,
  };
}
