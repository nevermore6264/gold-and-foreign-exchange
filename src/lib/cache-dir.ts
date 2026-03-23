/**
 * Vercel Serverless: filesystem ghi chỉ ở /tmp (cwd thường read-only).
 * Local: dùng ./cache trong project.
 */
import { tmpdir } from "os";
import path from "path";

export function getAppCacheRoot(): string {
  if (process.env.VERCEL === "1") {
    return path.join(tmpdir(), "gia-vang-cache");
  }
  return path.join(process.cwd(), "cache");
}
