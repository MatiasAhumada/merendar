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

function collectAllFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolutePath = join(directory, entry);

    if (statSync(absolutePath).isDirectory()) {
      return collectAllFiles(absolutePath);
    }

    return [absolutePath];
  });
}

function collectEmptyDirectories(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  const childDirectories = entries.filter((entry) => entry.isDirectory()).map((entry) => join(directory, entry.name));
  const nestedEmptyDirectories = childDirectories.flatMap(collectEmptyDirectories);

  if (entries.length === 0) {
    return [directory, ...nestedEmptyDirectories];
  }

  return nestedEmptyDirectories;
}

const tsconfig = ts.readConfigFile(join(projectRoot, "tsconfig.json"), ts.sys.readFile);
const parsedTsconfig = tsconfig.config ? ts.parseJsonConfigFileContent(tsconfig.config, ts.sys, projectRoot) : undefined;

if (!tsconfig.error && tsconfig.config.compilerOptions.allowJs) {
  violations.push("tsconfig.json debe mantener allowJs desactivado para el código de aplicación.");
}

for (const filePath of collectAllFiles(join(sourceRoot, "server", "services"))) {
  if (!filePath.endsWith(".ts")) {
    violations.push(`Servicio de servidor ajeno a TypeScript: ${relative(projectRoot, filePath)}.`);
  }
}

for (const filePath of collectAllFiles(sourceRoot)) {
  if (filePath.endsWith(".js") || filePath.endsWith(".jsx")) {
    violations.push(`Código de aplicación JavaScript fuera del contrato TypeScript: ${relative(projectRoot, filePath)}.`);
  }
}

for (const directory of collectEmptyDirectories(sourceRoot)) {
  violations.push(`Directorio vacío en código de aplicación: ${relative(projectRoot, directory)}.`);
}

for (const filePath of collectFiles(sourceRoot)) {
  const relativePath = relative(projectRoot, filePath).split("\\").join("/");
  const sourceFile = ts.createSourceFile(filePath, readFileSync(filePath, "utf8"), ts.ScriptTarget.Latest, true, filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const isApiHandler = relativePath.startsWith("src/app/api/");
  const isClientComponent = sourceFile.statements.some((statement) =>
    ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression) && statement.expression.text === "use client"
  );
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, sourceFile.text);

  while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken) {
    const token = scanner.getToken();

    if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia) {
      violations.push(`${relativePath} contiene un comentario; las reglas del proyecto requieren código autoexplicativo.`);
    }
  }

  if (isApiHandler && sourceFile.statements.some((statement) => {
    return ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === "@/lib/prisma";
  })) {
    violations.push(`${relativePath} no debe importar Prisma directamente; delegá persistencia al repositorio.`);
  }

  if (isApiHandler && sourceFile.statements.some((statement) =>
    ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text.startsWith("@/server/repository/")
  )) {
    violations.push(`${relativePath} no debe importar repositorios directamente; delegá la operación a un servicio.`);
  }

  if (isClientComponent && sourceFile.statements.some((statement) => {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      return false;
    }

    const moduleName = statement.moduleSpecifier.text;

    if (moduleName === "@/lib/prisma" || moduleName.startsWith("@/server/")) {
      return !statement.importClause?.isTypeOnly && !(statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings) && statement.importClause.namedBindings.elements.every((element) => element.isTypeOnly));
    }

    return false;
  })) {
    violations.push(`${relativePath} importa lógica de servidor en un Client Component.`);
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
    if (
      (ts.isAsExpression(node) && !ts.isConstTypeReference(node.type)) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isNonNullExpression(node)
    ) {
      violations.push(`${relativePath} usa una aserción de tipo; resolvé el tipo en su origen.`);
    }

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

    if (ts.isConditionalExpression(node)) {
      let parent: ts.Node | undefined = node.parent;
      let isInsideJsxExpression = false;

      while (parent) {
        if (ts.isJsxExpression(parent)) {
          isInsideJsxExpression = true;
        }

        if (ts.isReturnStatement(parent)) {
          break;
        }

        if (ts.isArrowFunction(parent)) {
          break;
        }

        if (ts.isStatement(parent)) {
          break;
        }

        parent = parent.parent;
      }

      const isDirectReturn = Boolean(
        parent && (
          (ts.isReturnStatement(parent) && (parent.expression === node || isInsideJsxExpression)) ||
          (ts.isArrowFunction(parent) && (parent.body === node || isInsideJsxExpression))
        )
      );

      if (parent && !isDirectReturn) {
        violations.push(`${relativePath} usa un ternario fuera de return.`);
      }

      if ([node.condition, node.whenTrue, node.whenFalse].some((expression) => ts.isConditionalExpression(expression))) {
        violations.push(`${relativePath} usa ternarios anidados.`);
      }
    }

    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      let statementExpression: ts.Node = node;

      while (ts.isParenthesizedExpression(statementExpression)) {
        statementExpression = statementExpression.expression;
      }

      if (ts.isExpressionStatement(statementExpression.parent) && statementExpression.parent.expression === statementExpression) {
        let containsCall = false;
        const inspectRightOperand = (rightNode: ts.Node) => {
          if (ts.isCallExpression(rightNode)) {
            containsCall = true;
          }
          ts.forEachChild(rightNode, inspectRightOperand);
        };
        inspectRightOperand(node.right);

        if (containsCall) {
          violations.push(`${relativePath} usa && para ejecutar una acción condicional; usá if.`);
        }
      }
    }

    ts.forEachChild(node, inspectTypeScriptConventions);
  };
  inspectTypeScriptConventions(sourceFile);
}

const sourceFiles = collectFiles(sourceRoot);
const sourceFileSet = new Set(sourceFiles.map((filePath) => join(projectRoot, relative(projectRoot, filePath))));
const runtimeDependencies = new Map<string, string[]>();

if (parsedTsconfig) {
  for (const filePath of sourceFiles) {
    const sourceFile = ts.createSourceFile(filePath, readFileSync(filePath, "utf8"), ts.ScriptTarget.Latest, true, filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const dependencies: string[] = [];

    const collectDependencies = (node: ts.Node) => {
      let moduleSpecifier: string | undefined;

      if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly && !(node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings) && node.importClause.namedBindings.elements.every((element) => element.isTypeOnly)) && ts.isStringLiteral(node.moduleSpecifier)) {
        moduleSpecifier = node.moduleSpecifier.text;
      }

      if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        moduleSpecifier = node.moduleSpecifier.text;
      }

      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        moduleSpecifier = node.arguments[0].text;
      }

      if (moduleSpecifier) {
        const resolvedFile = ts.resolveModuleName(moduleSpecifier, filePath, parsedTsconfig.options, ts.sys).resolvedModule?.resolvedFileName;

        if (resolvedFile && sourceFileSet.has(join(projectRoot, relative(projectRoot, resolvedFile)))) {
          dependencies.push(resolvedFile);
        }
      }

      ts.forEachChild(node, collectDependencies);
    };

    collectDependencies(sourceFile);
    runtimeDependencies.set(filePath, dependencies);
  }

  const visited = new Set<string>();
  const active = new Set<string>();
  const dependencyPath: string[] = [];
  const reportedCycles = new Set<string>();

  const inspectCycles = (filePath: string) => {
    if (active.has(filePath)) {
      const cycleStart = dependencyPath.indexOf(filePath);
      const cycle = [...dependencyPath.slice(cycleStart), filePath].map((path) => relative(projectRoot, path)).join(" -> ");

      if (!reportedCycles.has(cycle)) {
        reportedCycles.add(cycle);
        violations.push(`Ciclo de imports de runtime: ${cycle}.`);
      }

      return;
    }

    if (visited.has(filePath)) {
      return;
    }

    active.add(filePath);
    dependencyPath.push(filePath);

    for (const dependency of runtimeDependencies.get(filePath) ?? []) {
      inspectCycles(dependency);
    }

    dependencyPath.pop();
    active.delete(filePath);
    visited.add(filePath);
  };

  for (const filePath of sourceFiles) {
    inspectCycles(filePath);
  }
}

if (violations.length) {
  process.stderr.write(`${violations.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Architecture checks passed.\n");
}
