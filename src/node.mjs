import { readFile } from "node:fs/promises";
import { normalizeProfile } from "./capabilities.mjs";
export async function loadProfile(path) {
  return normalizeProfile(JSON.parse(await readFile(path, "utf8")));
}
