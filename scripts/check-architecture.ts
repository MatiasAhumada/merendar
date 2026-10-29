import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = join(projectRoot, "src");
const violations: string[] = [];

function collectFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolutePath = join(directory, entry);
    const entryStats = statSync(absolutePath);

    if (entryStats.isDirectory()) {
      return collectFiles(absolutePath);
    }

    return absolutePath.endsWith(".ts") || absolutePath.endsWith(".tsx") ? [absolutePath] : [];
  });
}

const tsconfig = ts.readConfigFile(join(projectRoot, "tsconfig.json"), ts.sys.readFile);

if (!tsconfig.error && tsconfig.config.compilerOptions.allowJs) {
  violations.push("tsconfig.json debe mantener allowJs desactivado para el código de aplicación.");
}

for (const entry of readdirSync(join(sourceRoot, "server", "services"), { withFileTypes: true })) {
  if (entry.isFile() && !entry.name.endsWith(".ts")) {
    violations.push(`Servicio de servidor ajeno a TypeScript: ${join("src/server/services", entry.name)}.`);
  }
}

for (const filePath of collectFiles(sourceRoot)) {
  const relativePath = relative(projectRoot, filePath).split("\\").join("/");
  const sourceFile = ts.createSourceFile(filePath, readFileSync(filePath, "utf8"), ts.ScriptTarget.Latest, true, filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const isApiHandler = relativePath.startsWith("src/app/api/");

  if (isApiHandler && sourceFile.statements.some((statement) => {
    return ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === "@/lib/prisma";
  })) {
    violations.push(`${relativePath} no debe importar Prisma directamente; delegá persistencia al repositorio.`);
  }

  if (isApiHandler && sourceFile.statements.some((statement) => {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      return false;
    }

    if (statement.moduleSpecifier.text !== "@prisma/client" || statement.importClause?.isTypeOnly) {
      return false;
    }

    const importedNames = statement.importClause?.namedBindings;

    if (importedNames && ts.isNamedImports(importedNames)) {
      return importedNames.elements.some((element) => !["AccessCapability", "UserRole"].includes(element.name.text));
    }

    return true;
  })) {
    violations.push(`${relativePath} no debe importar implementaciones de Prisma; delegá persistencia al repositorio.`);
  }

  if (isApiHandler) {
    const inspectPrismaCalls = (node: ts.Node) => {
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "prisma") {
        violations.push(`${relativePath} contiene una consulta Prisma en el handler.`);
      }
      ts.forEachChild(node, inspectPrismaCalls);
    };
    inspectPrismaCalls(sourceFile);
  }

  if (relativePath.startsWith("src/components/") && !relativePath.startsWith("src/components/ui/")) {
    const inspectElements = (node: ts.Node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const elementName = node.tagName.getText(sourceFile);
        if (["button", "input", "textarea", "select", "dialog", "table"].includes(elementName)) {
          violations.push(`${relativePath} usa <${elementName}> en lugar de la primitive shadcn del proyecto.`);
        }
      }
      ts.forEachChild(node, inspectElements);
    };
    inspectElements(sourceFile);
  }

  const inspectTypeScriptConventions = (node: ts.Node) => {
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      violations.push(`${relativePath} declara any; usá un tipo específico.`);
    }

    if (
      ts.isBinaryExpression(node) &&
      [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(node.operatorToken.kind) &&
      [node.left.getText(sourceFile), node.right.getText(sourceFile)].some((operand) => ["null", "undefined", "true", "false"].includes(operand))
    ) {
      violations.push(`${relativePath} compara explícitamente con null, undefined o booleanos.`);
    }

    if (node.kind === ts.SyntaxKind.TypeOfExpression) {
      let ancestor: ts.Node | undefined = node.parent;
      let insideZodPreprocess = false;

      while (ancestor) {
        if (ts.isCallExpression(ancestor) && ts.isPropertyAccessExpression(ancestor.expression) && ancestor.expression.name.text === "preprocess") {
          insideZodPreprocess = true;
          break;
        }

        ancestor = ancestor.parent;
      }

      if (!insideZodPreprocess) {
        violations.push(`${relativePath} usa typeof fuera de zod.preprocess().`);
      }
    }

    ts.forEachChild(node, inspectTypeScriptConventions);
  };
  inspectTypeScriptConventions(sourceFile);
}

if (violations.length) {
  process.stderr.write(`${violations.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Architecture checks passed.\n");
}
