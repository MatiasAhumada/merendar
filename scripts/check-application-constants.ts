import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

type Finding = {
  file: string;
  line: number;
  value: string;
};

const sourceRoots = ["src", "public", "scripts"];
const findings: Finding[] = [];

function isSourceFile(filePath: string) {
  return /\.(?:ts|tsx|js)$/.test(filePath) && !filePath.includes("/constants/") && !filePath.includes("/tests/");
}

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectSourceFiles(entryPath);
    }

    if (isSourceFile(entryPath)) {
      return [entryPath];
    }

    return [];
  });
}

function isVisibleAttribute(attributeName: string) {
  return ["alt", "aria-label", "label", "placeholder", "title"].includes(attributeName);
}

function isErrorMessageLiteral(node: ts.StringLiteralLike) {
  const parent = node.parent;
  if (ts.isNewExpression(parent) && ["Error", "ApiError"].includes(parent.expression.getText())) {
    return true;
  }

  return ts.isPropertyAssignment(parent)
    && parent.name.getText() === "message"
    && parent.initializer === node;
}

function isLongDisplayCopy(value: string) {
  return value.length >= 28 && /\s/.test(value) && /[A-ZÀ-Ý¿¡]/.test(value);
}

function isShortDisplayCopy(value: string) {
  return /^[A-ZÁÉÍÓÚÜÑ]/.test(value) && !/^[A-Z0-9_]+$/.test(value);
}

function isVisibleJsxExpression(node: ts.Node) {
  let current = node.parent;

  while (current && !ts.isJsxExpression(current)) {
    current = current.parent;
  }

  if (!current) {
    return false;
  }

  const expressionParent = current.parent;
  if (ts.isJsxAttribute(expressionParent)) {
    return isVisibleAttribute(expressionParent.name.getText());
  }

  return ts.isJsxElement(expressionParent) || ts.isJsxFragment(expressionParent);
}

function isMessageSetterCall(node: ts.Node) {
  const parent = node.parent;
  return ts.isCallExpression(parent)
    && /set(?:Error|Notice|Message|QueueMessage|FormMessage|ReviewMessage|ActionMessage)/.test(parent.expression.getText());
}

function hasApplicationWords(value: string) {
  return /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(value);
}

function isRenderedValue(node: ts.Node) {
  let current = node.parent;

  while (current && !ts.isJsxExpression(current)) {
    if (ts.isArrowFunction(current) || ts.isFunctionLike(current) || ts.isCallExpression(current) || ts.isElementAccessExpression(current)) {
      return false;
    }

    if (ts.isBinaryExpression(current) && ![ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(current.operatorToken.kind)) {
      return false;
    }

    current = current.parent;
  }

  return Boolean(current) && isVisibleJsxExpression(node);
}

function templateCopy(node: ts.TemplateExpression) {
  return node.head.text + node.templateSpans.map((span) => span.literal.text).join("");
}

function visitSourceFile(filePath: string) {
  const source = readFileSync(filePath, "utf8");
  const scriptKind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : filePath.endsWith(".js") ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind);

  function addFinding(node: ts.Node, value: string) {
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    findings.push({ file: relative(process.cwd(), filePath), line: position.line + 1, value });
  }

  function visit(node: ts.Node, insideJsxExpression: boolean) {
    if (ts.isJsxExpression(node)) {
      insideJsxExpression = true;
    }

    if (ts.isJsxText(node) && node.getText(sourceFile).trim()) {
      addFinding(node, node.getText(sourceFile).trim());
    }

    if (ts.isJsxAttribute(node) && isVisibleAttribute(node.name.getText(sourceFile)) && node.initializer && ts.isStringLiteral(node.initializer)) {
      addFinding(node.initializer, node.initializer.text);
    }

    if (ts.isStringLiteralLike(node)) {
      if (isErrorMessageLiteral(node) || (isMessageSetterCall(node) && node.text)) {
        addFinding(node, node.text);
      } else if (insideJsxExpression && isRenderedValue(node) && hasApplicationWords(node.text) && (isLongDisplayCopy(node.text) || isShortDisplayCopy(node.text))) {
        addFinding(node, node.text);
      } else if (isLongDisplayCopy(node.text)) {
        const parent = node.parent;
        if (ts.isPropertyAssignment(parent) && ["title", "description", "placeholder", "label"].includes(parent.name.getText(sourceFile))) {
          addFinding(node, node.text);
        }
      }
    }

    if (ts.isTemplateExpression(node) && (isMessageSetterCall(node) || (isRenderedValue(node) && hasApplicationWords(templateCopy(node))))) {
      addFinding(node, node.getText(sourceFile));
    }

    if (ts.isVariableDeclaration(node) && node.initializer && ts.isArrayLiteralExpression(node.initializer)) {
      const variableName = node.name.getText(sourceFile);
      const candidateCatalog = /(catalog|options|labels|routes|capabilities|mime|headers|states|roles|permissions|neighborhoods|relationships|documents|statuses|types|events|keys|columns|modules|periods|families|formats|names|categories)/i.test(variableName);
      const literalValues = node.initializer.elements.filter(ts.isStringLiteralLike);
      const containsDisplayLabels = literalValues.some((element) => /\s/.test(element.text) || isShortDisplayCopy(element.text));
      if (candidateCatalog && literalValues.length > 1 && containsDisplayLabels) {
        addFinding(node.initializer, `${variableName}: ${literalValues.map((element) => element.text).join(" | ")}`);
      }
    }

    ts.forEachChild(node, (child) => visit(child, insideJsxExpression));
  }

  visit(sourceFile, false);
}

for (const sourceRoot of sourceRoots) {
  for (const sourceFile of collectSourceFiles(sourceRoot)) {
    visitSourceFile(sourceFile);
  }
}

if (findings.length) {
  for (const finding of findings) {
    process.stderr.write(`${finding.file}:${finding.line}: valor de aplicación fuera de src/constants: ${finding.value}\n`);
  }

  process.exitCode = 1;
} else {
  process.stdout.write("Comprobación de constantes de aplicación: limpia.\n");
}
