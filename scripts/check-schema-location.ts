import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const sourceRoots = ["src", "tests"];
const schemaDirectories = [path.join("src", "schemas"), path.join("tests", "schemas")];
const schemaDefinitionPattern = /\bz\.(object|enum|nativeEnum|record|array|string|number|boolean|literal|uuid|iso|json|null|instanceof|discriminatedUnion|union|unknown|preprocess|coerce)\s*\(/;

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectFiles(entryPath);
    }

    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      return [entryPath];
    }

    return [];
  }));

  return nestedFiles.flat();
}

function isInSchemaDirectory(filePath: string) {
  return schemaDirectories.some((directory) => filePath.startsWith(`${directory}${path.sep}`));
}

async function main() {
  const sourceFiles = (await Promise.all(sourceRoots.map(collectFiles))).flat();
  const violations: string[] = [];

  for (const sourceFile of sourceFiles) {
    if (isInSchemaDirectory(sourceFile)) {
      continue;
    }

    const source = await readFile(sourceFile, "utf8");
    const lines = source.split("\n");

    lines.forEach((line, index) => {
      if (schemaDefinitionPattern.test(line)) {
        violations.push(`${sourceFile}:${index + 1}: schema definition outside a schema module`);
      }
    });
  }

  if (violations.length > 0) {
    process.stderr.write(`${violations.join("\n")}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write("All Zod definitions are located in src/schemas or tests/schemas.\n");
}

main();
