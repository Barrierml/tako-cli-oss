#!/usr/bin/env bun
/**
 * 用量统计 API 测试
 */

const PROXY_BASE_URL = "https://tako.shiroha.tech";
const API_KEY = process.argv[2] || "";

if (!API_KEY) {
  console.error("用法: bun scripts/test-stats.ts <api_key>");
  console.error("示例: bun scripts/test-stats.ts cr_xxx");
  process.exit(1);
}

async function test() {
  console.log("=== Tako 用量统计 API 测试 ===\n");

  // 1. 获取 API ID
  console.log("[1/3] 获取 API ID...");
  const keyIdResponse = await fetch(`${PROXY_BASE_URL}/apiStats/api/get-key-id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: API_KEY }),
  });
  const keyIdData = await keyIdResponse.json();
  console.log("响应:", JSON.stringify(keyIdData, null, 2));

  if (!keyIdData.success || !keyIdData.data?.id) {
    console.error("❌ 获取 API ID 失败:", keyIdData.error || keyIdData.message);
    process.exit(1);
  }

  const apiId = keyIdData.data.id;
  console.log(`✓ API ID: ${apiId}\n`);

  // 2. 获取用户统计
  console.log("[2/3] 获取用户统计...");
  const statsResponse = await fetch(`${PROXY_BASE_URL}/apiStats/api/user-stats`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiId }),
  });
  const statsData = await statsResponse.json();
  console.log("响应:", JSON.stringify(statsData, null, 2));

  if (!statsData.success) {
    console.error("❌ 获取用户统计失败:", statsData.error || statsData.message);
  } else {
    console.log("✓ 用户统计获取成功");
    console.log(`  - 总请求数: ${statsData.data?.usage?.total?.requests || 0}`);
    console.log(`  - 总费用: ${statsData.data?.usage?.total?.formattedCost || "$0.00"}`);
    console.log(`  - 今日费用: $${(statsData.data?.limits?.currentDailyCost || 0).toFixed(2)}`);
  }
  console.log();

  // 3. 获取模型统计
  console.log("[3/3] 获取模型统计...");
  const modelResponse = await fetch(`${PROXY_BASE_URL}/apiStats/api/user-model-stats`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiId, period: "daily" }),
  });
  const modelData = await modelResponse.json();
  console.log("响应:", JSON.stringify(modelData, null, 2));

  if (!modelData.success) {
    console.error("❌ 获取模型统计失败:", modelData.error || modelData.message);
  } else {
    console.log("✓ 模型统计获取成功");
    if (modelData.data?.length > 0) {
      modelData.data.forEach((item: any) => {
        console.log(`  - ${item.model}: ${item.requests} 请求, ${item.formatted?.total || "$0.00"}`);
      });
    } else {
      console.log("  (无模型使用记录)");
    }
  }

  console.log("\n=== 测试完成 ===");
}

test().catch(console.error);
