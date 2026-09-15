import { parse, type Expression } from "acorn";

const jsonNumber = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

/** Parse pasted code as data only. Expressions become strings; nothing is executed. */
export function convertToJson(input: string): string {
  const source = `(\n${input.trim().replace(/[;,]\s*$/, "")}\n)`;
  let root: Expression;
  try {
    const program = parse(source, { ecmaVersion: "latest" });
    const statement = program.body[0];
    if (program.body.length !== 1 || statement?.type !== "ExpressionStatement")
      throw new Error("Paste an object or array, not a full script.");
    root = statement.expression;
  } catch (error) {
    if (error instanceof SyntaxError) {
      const location = (
        error as SyntaxError & { loc?: { line: number; column: number } }
      ).loc;
      throw new Error(
        `Could not parse the object${location ? ` at line ${Math.max(1, location.line - 1)}, column ${location.column + 1}` : ""}. Check for missing values, commas, or brackets.`,
      );
    }
    throw error;
  }
  if (root.type !== "ObjectExpression" && root.type !== "ArrayExpression")
    throw new Error("Paste an object or array to convert.");

  function serialize(node: Expression, depth: number): string {
    if (depth > 100)
      throw new Error("This object is too deeply nested to convert.");
    const raw = source.slice(node.start, node.end);
    const indent = "  ".repeat(depth);
    const childIndent = `${indent}  `;
    if (node.type === "ObjectExpression") {
      const seen = new Set<string>();
      const entries = node.properties.map((property) => {
        if (property.type === "SpreadElement")
          throw new Error(
            "Object spreads cannot be converted without running code. Replace the spread with explicit fields.",
          );
        if (property.computed || property.method || property.kind !== "init")
          throw new Error(
            "Replace computed keys, methods, and getters/setters with ordinary key: value fields first.",
          );
        const key =
          property.key.type === "Identifier"
            ? property.key.name
            : property.key.type === "Literal"
              ? String(property.key.value)
              : null;
        if (key === null)
          throw new Error("This object contains an unsupported property name.");
        if (seen.has(key))
          throw new Error(
            `Duplicate key ${JSON.stringify(key)}. Remove the duplicate before converting.`,
          );
        seen.add(key);
        return `${childIndent}${JSON.stringify(key)}: ${serialize(property.value as Expression, depth + 1)}`;
      });
      return entries.length ? `{\n${entries.join(",\n")}\n${indent}}` : "{}";
    }
    if (node.type === "ArrayExpression") {
      const entries = node.elements.map((element) => {
        if (!element || element.type === "SpreadElement")
          throw new Error(
            "Replace array holes or spreads with explicit values before converting.",
          );
        return childIndent + serialize(element, depth + 1);
      });
      return entries.length ? `[\n${entries.join(",\n")}\n${indent}]` : "[]";
    }
    if (node.type === "Literal") {
      // Preserve decimal spelling, including large integers, without rounding it.
      if (typeof node.value === "number" && jsonNumber.test(raw)) return raw;
      if (
        node.value === null ||
        typeof node.value === "string" ||
        typeof node.value === "boolean" ||
        (typeof node.value === "number" && Number.isFinite(node.value))
      )
        return JSON.stringify(node.value);
    }
    if (
      node.type === "UnaryExpression" &&
      (node.operator === "-" || node.operator === "+") &&
      node.argument.type === "Literal" &&
      typeof node.argument.value === "number"
    ) {
      const numberText = `${node.operator === "-" ? "-" : ""}${source.slice(node.argument.start, node.argument.end)}`;
      if (jsonNumber.test(numberText)) return numberText;
      const number =
        node.operator === "-" ? -node.argument.value : node.argument.value;
      if (Number.isFinite(number)) return JSON.stringify(number);
    }
    if (node.type === "TemplateLiteral" && node.expressions.length === 0)
      return JSON.stringify(
        node.quasis[0].value.cooked ?? node.quasis[0].value.raw,
      );
    // Variables, optional chaining, calls, and other expressions remain plain text.
    return JSON.stringify(raw);
  }

  return serialize(root, 0);
}
