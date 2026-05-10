---
name: models-testplan
description: models 模块测试计划
type: testplan
---

# Models 模块测试计划

## 已有覆盖

无（新模块）。

## 测试场景

### TP-MODELS-01：normalize 处理 [1m] 后缀

- 输入：`"claude-sonnet-4-5[1m]"`
- 期望：`{ lookupId: "claude-sonnet-4-5", is1m: true }`

### TP-MODELS-02：normalize 处理 :1m 后缀

- 输入：`"claude-sonnet-4-5:1m"`
- 期望：`{ lookupId: "claude-sonnet-4-5", is1m: true }`

### TP-MODELS-03：normalize 处理 provider 前缀

- 输入：`"anthropic/claude-sonnet-4-5"`
- 期望：`{ lookupId: "claude-sonnet-4-5", is1m: false }`

### TP-MODELS-04：normalize 同时处理前缀和后缀

- 输入：`"anthropic/claude-sonnet-4-5[1m]"`
- 期望：`{ lookupId: "claude-sonnet-4-5", is1m: true }`

### TP-MODELS-05：getModelEntry 命中

- catalog 有 `claude-haiku-4-5: {context: 200000}`
- 输入 `"claude-haiku-4-5"` → 返回 `contextWindow: 200000`

### TP-MODELS-06：getModelEntry 1M 覆盖

- catalog 有 `claude-sonnet-4-5: {context: 200000}`
- 输入 `"claude-sonnet-4-5[1m]"` → 返回 `contextWindow: 1000000`（命中后被规则覆盖）

### TP-MODELS-07：getModelEntry 未命中

- 输入未知 model id
- 期望：返回 `undefined`

### TP-MODELS-08：source 解析 models.dev 响应

- 输入 mock 的 models.dev JSON（含 anthropic + openai 两 provider）
- 期望：返回扁平 `ModelEntry[]`，每个 entry 的 `provider` 字段对应外层 provider key

### TP-MODELS-09：refreshCatalog 写磁盘

- mock fetch 返回小型 catalog
- 调用 `refreshCatalog()`
- 期望：`~/.tako/models-cache.json` 被写入，内容含 `fetchedAt` 和 `entries`

### TP-MODELS-10：loadCatalog 用磁盘缓存

- 写入一个 fresh 缓存文件
- 调用 `loadCatalog()`
- 期望：内存目录被填充，无网络请求

### TP-MODELS-11：loadCatalog 磁盘过期回落 bundled

- 写入 25h 前的缓存文件
- 调用 `loadCatalog()`
- 期望：磁盘被忽略，内存目录用 bundled 数据

### TP-MODELS-12：网络失败不抛错

- mock fetch 抛异常
- 调用 `refreshCatalog()`
- 期望：promise 正常 resolve，内存目录保持原状

## 运行方式

```bash
cd packages/cli
bun test tests/unit.models.test.ts
```

bun:test 单测，所有 fetch 和 fs 通过依赖注入或全局替换 mock。
