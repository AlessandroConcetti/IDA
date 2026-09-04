import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const openApiPath = fileURLToPath(new URL("../../../docs/openapi/phase1-local.yaml", import.meta.url));
const appSourcePath = fileURLToPath(new URL("./app.ts", import.meta.url));

const httpMethods = new Set(["get", "post", "patch", "put", "delete"]);

function normalizeFastifyPath(path: string): string {
  return path.replace(/:([A-Za-z][A-Za-z0-9_]*)/gu, "{$1}");
}

function readOpenApiOperations(source: string): Map<string, Set<string>> {
  const operations = new Map<string, Set<string>>();
  let currentPath: string | undefined;
  let currentOperation: string | undefined;

  for (const line of source.split(/\r?\n/u)) {
    if (line === "components:") {
      break;
    }

    const pathMatch = /^ {2}(\/[^:]+):$/u.exec(line);

    if (pathMatch) {
      currentPath = pathMatch[1];
      currentOperation = undefined;
      continue;
    }

    const methodMatch = /^ {4}([a-z]+):$/u.exec(line);

    if (currentPath && methodMatch && httpMethods.has(methodMatch[1] ?? "")) {
      currentOperation = `${methodMatch[1]?.toUpperCase()} ${currentPath}`;
      operations.set(currentOperation, new Set());
      continue;
    }

    const statusMatch = /^ {8}'([1-5][0-9]{2})':$/u.exec(line);

    if (currentOperation && statusMatch) {
      operations.get(currentOperation)?.add(statusMatch[1] ?? "");
    }
  }

  return operations;
}

function readFastifyOperations(source: string): Set<string> {
  const operations = new Set<string>();
  const routePattern = /app\.(get|post|patch|put|delete)\("(\/[^"]+)"/gu;

  for (const match of source.matchAll(routePattern)) {
    operations.add(`${match[1]?.toUpperCase()} ${normalizeFastifyPath(match[2] ?? "")}`);
  }

  return operations;
}

describe("Contrat OpenAPI de la frontière Identity", () => {
  it("documente toutes les routes réelles et leur refus 401 sous /v1", async () => {
    const [openApiSource, appSource] = await Promise.all([
      readFile(openApiPath, "utf8"),
      readFile(appSourcePath, "utf8"),
    ]);
    const documented = readOpenApiOperations(openApiSource);
    const implemented = readFastifyOperations(appSource);

    expect(new Set(documented.keys())).toEqual(implemented);

    for (const [operation, statuses] of documented) {
      if (operation.includes(" /v1/")) {
        expect(statuses, `${operation} doit documenter AUTHENTICATION_REQUIRED`).toContain("401");
      }
    }
  });
});
