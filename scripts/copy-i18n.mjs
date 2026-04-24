import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const sourcePath = resolve("src", "i18n.js");
const targetPath = resolve("public", "shared", "i18n.js");

async function copyFile() {
    const contents = await readFile(sourcePath, "utf8");
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, contents, "utf8");
}

copyFile().catch((error) => {
    console.error("Failed to copy i18n.js:", error);
    process.exitCode = 1;
});
