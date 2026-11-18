import os from "node:os";
import path from "node:path";

// Loaded only from readDocumentBytes, after the server is already listening.
// Tesseract, the HEIC converter, and Word reading stay out of startup.

export async function closeReader() {}

export async function readDocumentBytes(buffer, mime) {
  let text = "";
  try {
    if (mime === "application/pdf") {
      text = extractPdfText(buffer);
      if (!/licen|insur|policy|expir|20\d{2}/i.test(text)) text = await ocrMany(extractPdfImages(buffer));
    } else if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const mammoth = await import("mammoth");
      text = (await mammoth.extractRawText({ buffer })).value || "";
    } else if (mime.startsWith("image/")) {
      text = await ocrMany([await imageForOcr(buffer, mime)]);
    }
  } catch {
    text = "";
  }
  return suggestionsFrom(text, mime);
}

function suggestionsFrom(text, mime) {
  const dates = findDates(text);
  const number = (text.match(/(?:licen[cs]e|policy)[:\s#-]*([A-Z0-9-]{4,})/i) || [])[1] || "";
  let suggestedKind = "";
  if (/insurance|policy/i.test(text)) suggestedKind = "insurance";
  else if (/licen[cs]e/i.test(text)) suggestedKind = "licence";
  const readable = text.replace(/\s/g, "").length > 0;
  let note = "These details were read from the file. Confirm or correct them.";
  if (!readable && mime === "application/msword") note = "Older Word .doc files are stored, but the words are not read. Save it as .docx, or type the expiry and the number.";
  else if (!readable) note = "The file was saved, but the words could not be read. Type the expiry and the number yourself.";
  return { textFound: readable, suggestedExpiry: dates.at(-1) || "", suggestedNumber: number, suggestedKind, note };
}

async function imageForOcr(buffer, mime) {
  if (mime !== "image/heic" && mime !== "image/heif") return buffer;
  const convert = (await import("heic-convert")).default;
  return Buffer.from(await convert({ buffer, format: "JPEG", quality: 0.85 }));
}

async function ocrMany(images) {
  const list = images.filter((image) => image?.length).slice(0, 2);
  if (!list.length) return "";
  let worker;
  const pieces = [];
  try {
    const { createWorker } = await import("tesseract.js");
    worker = await createWorker("eng", 1, { cachePath: path.join(os.tmpdir(), "taskspeck-ocr") });
    for (const image of list) {
      const result = await worker.recognize(image);
      if (result.data?.text) pieces.push(result.data.text);
    }
  } catch {
    return pieces.join("\n");
  } finally {
    if (worker) {
      try { await worker.terminate(); } catch { /* the read already finished or failed */ }
    }
  }
  return pieces.join("\n");
}

function extractPdfImages(buffer) {
  const images = [];
  let index = 0;
  while (index < buffer.length - 8 && images.length < 2) {
    if (buffer[index] === 0xff && buffer[index + 1] === 0xd8) {
      let end = index + 2;
      while (end < buffer.length - 1 && !(buffer[end] === 0xff && buffer[end + 1] === 0xd9)) end += 1;
      end += 2;
      if (end - index > 100) images.push(buffer.subarray(index, end));
      index = end;
      continue;
    }
    if (buffer.slice(index, index + 8).toString("hex") === "89504e470d0a1a0a") {
      const at = buffer.indexOf(Buffer.from("IEND"), index);
      const end = at === -1 ? Math.min(buffer.length, index + 2_000_000) : at + 8;
      images.push(buffer.subarray(index, end));
      index = end;
      continue;
    }
    index += 1;
  }
  return images;
}

function findDates(text) {
  const found = [];
  const push = (year, month, day) => {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (calendarDate(iso)) found.push(iso);
  };
  for (const match of text.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) push(match[1], match[2], match[3]);
  for (const match of text.matchAll(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2})\b/g)) push(match[3], match[2], match[1]);
  const months = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
  for (const match of text.matchAll(/\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/gi)) {
    push(match[3], months[match[2].toLowerCase()], match[1]);
  }
  return found;
}

function extractPdfText(buffer) {
  const raw = buffer.toString("latin1");
  const parts = [];
  const re = /\((?:\\\)|\\.|[^)]){2,200}\)/g;
  let match;
  while ((match = re.exec(raw))) parts.push(match[0].slice(1, -1).replace(/\\n/g, " ").replace(/\\(.)/g, "$1"));
  return parts.join(" ");
}

function calendarDate(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return text;
}
