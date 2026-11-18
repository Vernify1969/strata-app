import fs from "node:fs";
import path from "node:path";

export function storageSettings(config = {}) {
  const source = config.s3 || {};
  return {
    bucket: source.bucket || process.env.S3_BUCKET || "",
    endpoint: source.endpoint || process.env.S3_ENDPOINT || "",
    region: source.region || process.env.S3_REGION || "auto",
    accessKeyId: source.accessKeyId || process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: source.secretAccessKey || process.env.S3_SECRET_ACCESS_KEY || ""
  };
}

export function storageConfigured(config) {
  const settings = storageSettings(config);
  return !!(settings.bucket && settings.accessKeyId && settings.secretAccessKey);
}

function localRoot(config, kind) {
  if (kind === "photo") return path.join(path.dirname(config.databasePath || path.join(config.root, "var", "strata.db")), "photos");
  return config.documentsPath || path.join(config.root, "var", "documents");
}

export async function saveObject(config, kind, name, bytes, contentType = "application/octet-stream") {
  if (config.storageClient) {
    await config.storageClient.put(kind + "/" + name, bytes, contentType);
    return { where: "s3", key: kind + "/" + name };
  }
  if (!storageConfigured(config)) {
    const file = path.join(localRoot(config, kind), name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
    return { where: "local", file };
  }
  const settings = storageSettings(config);
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: settings.region,
    endpoint: settings.endpoint || undefined,
    credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
    forcePathStyle: true
  });
  await client.send(new PutObjectCommand({
    Bucket: settings.bucket,
    Key: kind + "/" + name,
    Body: bytes,
    ContentType: contentType
  }));
  return { where: "s3", key: kind + "/" + name };
}

export async function readObject(config, kind, name) {
  if (config.storageClient) return config.storageClient.get(kind + "/" + name);
  if (!storageConfigured(config)) {
    const file = path.join(localRoot(config, kind), name);
    if (!fs.existsSync(file)) return null;
    return fs.readFileSync(file);
  }
  const settings = storageSettings(config);
  const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: settings.region,
    endpoint: settings.endpoint || undefined,
    credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
    forcePathStyle: true
  });
  const result = await client.send(new GetObjectCommand({ Bucket: settings.bucket, Key: kind + "/" + name }));
  return Buffer.from(await result.Body.transformToByteArray());
}
