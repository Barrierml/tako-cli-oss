# Guide: Running Tests for Tako CLI

This guide covers all the ways to run tests in the Tako CLI project.

## Quick Reference

```bash
# Run all tests
bun test

# Run by type
bun test:unit          # Unit tests only
bun test:integration   # Integration tests only
bun test:platform      # Platform tests only
bun test:pre-release   # Pre-release validation

# Development
bun test:watch         # Watch mode
bun test:coverage      # Coverage report
```

---

## Running All Tests

```bash
# Run every test in the tests/ directory
bun test

# Expected output:
# bun test v1.x.x
#
# tests/unit.entry-resolution.test.ts:
# Entry Resolution - bin field parsing
#   ✓ should parse object format bin field
#   ✓ should parse string format bin field
#   ...
#
# Ran X tests across Y files. Z passed, 0 failed.
```

---

## Running Tests by Type

### Unit Tests

Fast, isolated tests for pure functions.

```bash
bun test:unit
# or
bun test tests/unit.*.test.ts
```

### Integration Tests

Tests that interact with the file system or installed packages.

```bash
bun test:integration
# or
bun test tests/integration.*.test.ts
```

### Platform Tests

Tests for cross-platform compatibility.

```bash
bun test:platform
# or
bun test tests/platform.*.test.ts
```

### Pre-Release Tests

Comprehensive validation suite run before each release.

```bash
bun test:pre-release
# or
bun test tests/pre-release.test.ts
```

---

## Running Specific Tests

### Single File

```bash
bun test tests/unit.entry-resolution.test.ts
```

### Pattern Matching

```bash
# All unit tests
bun test tests/unit.*.test.ts

# All tests containing "resolution"
bun test --grep "resolution"

# All tests in "Entry Resolution" describe block
bun test --grep "Entry Resolution"
```

### Specific Test Case

```bash
# Run only tests matching the pattern
bun test --grep "should parse object format"
```

---

## Development Mode

### Watch Mode

Automatically re-run tests when files change:

```bash
bun test:watch
# or
bun test --watch
```

### Watch Specific Files

```bash
bun test --watch tests/unit.*.test.ts
```

---

## Test Coverage

### Generate Coverage Report

```bash
bun test:coverage
# or
bun test --coverage
```

### Coverage Output

```
-------------------|---------|----------|---------|---------|
File               | % Stmts | % Branch | % Funcs | % Lines |
-------------------|---------|----------|---------|---------|
All files          |   85.2  |    78.3  |   90.1  |   85.2  |
 src/config.ts     |   92.0  |    85.0  |  100.0  |   92.0  |
 src/installer.ts  |   78.5  |    72.0  |   85.0  |   78.5  |
 ...               |   ...   |    ...   |   ...   |   ...   |
-------------------|---------|----------|---------|---------|
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun test
```

### Multi-Platform Testing

```yaml
jobs:
  test:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun test
```

---

## Troubleshooting

### Tests Fail to Start

```bash
# Check Bun is installed
bun --version

# Reinstall dependencies
bun install
```

### Specific Test Fails

```bash
# Run with verbose output
bun test tests/failing.test.ts --reporter=verbose

# Check test in isolation
bun test --grep "specific test name"
```

### Timeout Issues

For slow tests, increase timeout:

```typescript
it("slow operation", async () => {
  // test code
}, 30000); // 30 second timeout
```

Or run with extended timeout:

```bash
bun test --timeout 30000
```

### Permission Errors

```bash
# Check file permissions
ls -la tests/

# On Unix, ensure test files are readable
chmod +r tests/*.test.ts
```

---

## Best Practices for Running Tests

### Before Committing

```bash
# Run all tests
bun test

# If adding new feature, run related tests
bun test:unit
bun test:integration
```

### Before Releasing

```bash
# Must run pre-release tests
bun test:pre-release

# Optionally, run with coverage
bun test:coverage
```

### During Development

```bash
# Use watch mode for rapid feedback
bun test:watch tests/unit.*.test.ts
```

---

## Command Reference

| Command | Description |
|---------|-------------|
| `bun test` | Run all tests |
| `bun test:unit` | Run unit tests |
| `bun test:integration` | Run integration tests |
| `bun test:platform` | Run platform tests |
| `bun test:pre-release` | Run pre-release tests |
| `bun test:watch` | Watch mode |
| `bun test:coverage` | Generate coverage |
| `bun test --grep "X"` | Run tests matching X |
| `bun test FILE` | Run specific file |

---

**Last Updated:** 2026-01-08
