import { expect } from "bun:test";

/** Assert file exists */
export async function expectFileExists(path: string) {
  const file = Bun.file(path);
  expect(await file.exists()).toBe(true);
}

/** Assert directory is under Tako directory */
export function expectInTakoDir(path: string, takoDir: string) {
  expect(path.startsWith(takoDir)).toBe(true);
}

/** Assert package.json is valid */
export async function expectValidPackageJson(path: string) {
  const file = Bun.file(path);
  expect(await file.exists()).toBe(true);
  const pkg = await file.json();
  expect(pkg.name).toBeDefined();
  expect(pkg.version).toBeDefined();
}

/** Assert file starts with shebang (Unix executable) */
export async function expectHasShebang(path: string) {
  const file = Bun.file(path);
  const content = await file.text();
  expect(content.startsWith("#!/usr/bin/env bun")).toBe(true);
}

/** Assert array does not contain a specific element */
export function expectNotContains<T>(arr: T[], element: T) {
  expect(arr.includes(element)).toBe(false);
}
