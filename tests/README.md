# Tako CLI Test System

This document describes the Tako CLI test architecture, test types, execution methods, and best practices.

## Table of Contents

- [Test Architecture](#test-architecture)
- [Test Categories](#test-categories)
- [Running Tests](#running-tests)
- [Writing New Tests](#writing-new-tests)
- [Best Practices](#best-practices)

---

## Test Architecture

### Framework

Using **Bun Test** as the test framework:
- Zero configuration, works out of the box
- Native TypeScript support
- Jest-compatible API
- Extremely fast execution

### Directory Structure

```
tests/
├── _helpers/           # Test utilities
│   ├── assertions.ts   # Custom assertions
│   ├── mocks.ts        # Mock data
│   ├── fixtures.ts     # Test fixtures
│   └── paths.ts        # Path utilities
│
├── unit.*.test.ts      # Unit tests
├── integration.*.test.ts  # Integration tests
├── e2e.*.test.ts       # End-to-end tests
├── platform.*.test.ts  # Platform tests
└── pre-release.test.ts # Pre-release tests
```

### Naming Conventions

| Prefix | Test Type | Characteristics |
|--------|-----------|-----------------|
| `unit.*` | Unit Tests | Pure functions, no external dependencies |
| `integration.*` | Integration Tests | Module interaction, file system |
| `e2e.*` | End-to-End Tests | Complete flow verification |
| `platform.*` | Platform Tests | Cross-platform compatibility |
| `pre-release.*` | Release Tests | Comprehensive verification suite |

---

## Test Categories

### 1. Unit Tests

**Purpose:** Test independent functions and pure logic

**Characteristics:**
- Fast execution (milliseconds)
- No file system dependencies
- No network requests
- All dependencies can be mocked

**Example:**
```typescript
// tests/unit.entry-resolution.test.ts
describe("Entry Resolution", () => {
  it("should parse object format bin field", () => {
    const result = parseBinField({ cmd: "cli.js" }, "cmd");
    expect(result).toBe("cli.js");
  });
});
```

---

### 2. Integration Tests

**Purpose:** Test module interactions and file system operations

**Characteristics:**
- Medium speed (seconds)
- May read/write files
- Test real environment
- May require installed packages

**Example:**
```typescript
// tests/integration.claude-code.test.ts
describe("Claude Code", () => {
  it("should read installed package.json", async () => {
    const pkg = await readInstalledPackage("claude-code");
    expect(pkg.name).toBe("@anthropic-ai/claude-code");
  });
});
```

---

### 3. Platform Tests

**Purpose:** Verify cross-platform compatibility

**Characteristics:**
- Fast execution
- Test platform-specific logic
- Windows/Unix differences

**Example:**
```typescript
// tests/platform.windows.test.ts
describe("Windows Compatibility", () => {
  it("should use .exe extension on Windows", () => {
    const bunBin = getBunBin();
    if (isWindows()) {
      expect(bunBin).toEndWith(".exe");
    }
  });
});
```

---

### 4. Pre-Release Tests

**Purpose:** Comprehensive verification before release

**Characteristics:**
- Includes all critical tests
- Verifies build artifacts
- Verifies code integrity
- Must pass before release

---

## Running Tests

### Quick Start

```bash
# Run all tests
bun test

# Run specific test types
bun test:unit          # Unit tests
bun test:integration   # Integration tests
bun test:platform      # Platform tests

# Pre-release test (required before release)
bun test:pre-release

# Watch mode (during development)
bun test:watch

# Generate coverage report
bun test:coverage
```

### Test Filtering

```bash
# Run specific file
bun test tests/unit.entry-resolution.test.ts

# Run matching pattern
bun test tests/unit.*.test.ts

# Run specific test suite
bun test --grep "Entry Resolution"
```

---

## Writing New Tests

### 1. Choose Test Type

Based on test objective, choose appropriate prefix:
- Test pure functions -> `unit.*`
- Test file operations -> `integration.*`
- Test complete flow -> `e2e.*`
- Test platform differences -> `platform.*`

### 2. Create Test File

```bash
# Unit test example
touch tests/unit.my-feature.test.ts
```

### 3. Write Tests

```typescript
import { describe, it, expect } from "bun:test";
import { myFunction } from "../src/my-module";

describe("My Feature", () => {
  it("should do something", () => {
    const result = myFunction("input");
    expect(result).toBe("expected");
  });
});
```

### 4. Use Test Helpers

```typescript
import { getTakoDir } from "./_helpers/paths";
import { expectFileExists } from "./_helpers/assertions";
import { mockPackageJsons } from "./_helpers/mocks";

describe("My Feature", () => {
  it("should use helpers", async () => {
    const takoDir = getTakoDir();
    await expectFileExists(join(takoDir, "config.json"));
  });
});
```

### 5. Run and Verify

```bash
bun test tests/unit.my-feature.test.ts
```

---

## Best Practices

### 1. Test Naming

**DO:**
```typescript
describe("Entry Resolution - bin field parsing", () => {
  it("should parse object format bin field", () => {
    // ...
  });
});
```

**DON'T:**
```typescript
describe("Test", () => {
  it("works", () => {
    // ...
  });
});
```

### 2. Clear Assertions

**DO:**
```typescript
expect(result).toBe("cli.js");
expect(config).toHaveProperty("apiKey");
expect(array).toHaveLength(3);
```

**DON'T:**
```typescript
expect(result).toBeTruthy(); // Too vague
expect(config.apiKey !== undefined).toBe(true); // Complex
```

### 3. Test Isolation

**DO:**
```typescript
describe("Feature", () => {
  beforeAll(() => {
    // Setup
  });

  afterAll(() => {
    // Cleanup
  });

  it("test 1", () => { /* Independent */ });
  it("test 2", () => { /* Independent */ });
});
```

**DON'T:**
```typescript
// Shared state between tests
let sharedState;
it("test 1", () => { sharedState = "value"; });
it("test 2", () => { expect(sharedState).toBe("value"); }); // Depends on test 1
```

### 4. Graceful Skip

**DO:**
```typescript
it("should test installed package", async () => {
  const file = Bun.file(packagePath);
  if (!(await file.exists())) {
    console.warn("  [SKIP] Package not installed");
    return; // Gracefully skip
  }

  // Test logic
});
```

---

## Test Coverage

Generate coverage report:

```bash
bun test --coverage
```

Coverage targets:
- Core logic (launcher, installer, updater): > 80%
- Configuration and utility functions: > 70%
- UI and interaction logic: > 50%

---

## Troubleshooting

### Test Failures

1. Check if files exist
2. Check permissions
3. View detailed error messages

### Test Timeout

```typescript
it("slow test", async () => {
  // Increase timeout
}, 30000); // 30 seconds
```

### Mock Not Working

Ensure correct import:
```typescript
import { mock } from "bun:test"; // Correct
```

---

## Getting Help

- View example test files
- Read Bun Test documentation: https://bun.sh/docs/cli/test
- Check utilities in _helpers/

---

**Last Updated:** 2026-01-08
