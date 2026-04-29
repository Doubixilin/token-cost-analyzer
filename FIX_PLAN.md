# 修复计划：筛选失效 + 数据不更新 + 待处理优化

## 问题排查结果

### Bug 1: 筛选项点击无反应（根因）

**文件**: `src/routes/Dashboard.tsx` 第 62-65 行

```tsx
useEffect(() => {
    loadData(true);
    return () => { mountedRef.current = false; };  // ← BUG
}, [loadData]);
```

**原因**: React 的 `useEffect` cleanup 在**依赖变化重新执行时也会运行**，不仅限于组件卸载。流程如下：

1. 用户点击"今天"筛选 → `filters` 变化
2. `fetchDashboardData` 重建（依赖 filters）→ `loadData` 重建
3. React 先运行旧 effect 的 cleanup：`mountedRef.current = false`
4. React 运行新 effect：`loadData(true)` 执行
5. `loadData` 内检查 `if (!mountedRef.current) return;` → **直接返回，不加载数据**

结果：首次加载正常，但任何筛选变化都导致数据不刷新。按钮高亮变化了（UI 状态更新了），但后端数据请求被跳过。

### Bug 2: 今日数据不更新（根因）

**文件**: `src/routes/Dashboard.tsx` 第 44-60 行

```tsx
const loadData = useCallback(async (autoSync = false) => {
    // ...
    const isEmpty = await fetchDashboardData();
    if (autoSync && isEmpty) {        // ← 只在数据库为空时自动同步
        await refreshData();
        await fetchDashboardData();
    }
}, [fetchDashboardData, setLoading]);
```

**原因**: `autoSync` 逻辑只在数据库**完全没有数据**时触发自动同步（`isEmpty` 基于 `options[0].length === 0`，即 sources 为空）。如果早上已经加载过数据，之后的新会话/新记录不会被自动拉取。用户必须手动点击侧边栏"刷新数据"。

此外，侧边栏 `handleRefresh` 完成后没有触发 Dashboard 重新获取数据——它只更新了 `availableOptions`，但 Dashboard 的 `useEffect` 依赖的是 `loadData`（依赖 `filters`），如果 filters 没变，Dashboard 不会重新请求。

---

## 修复计划

### Phase 1: 关键 Bug 修复

- [ ] **1.1** 修复 `Dashboard.tsx` mountedRef cleanup 问题
  - 方案：移除 cleanup 中的 `mountedRef.current = false`，改用 AbortController 或直接移除 mountedRef（Tauri invoke 不支持 AbortController，最简方案是移除 ref 检查）
  - 验证：点击"今天"/"最近7天"等按钮后数据应立即变化

- [ ] **1.2** 修复数据不自动更新问题
  - 方案 A：Dashboard 每次路由进入时自动触发 `refreshData()`（用 location.pathname 做依赖）
  - 方案 B：监听 window focus 事件，用户从其他窗口切回时自动同步
  - 方案 C（推荐）：两者结合 + 侧边栏刷新后通过 store 通知 Dashboard 重新获取

- [ ] **1.3** 修复侧边栏刷新后 Dashboard 不更新
  - 方案：在 store 中添加 `lastSyncTime` 作为信号，Dashboard 的 useEffect 依赖它

### Phase 2: 增量同步优化

- [ ] **2.1** 实现基于文件 mtime 的增量解析
  - 在 `sync_state` 表记录每个文件的最后修改时间
  - 只解析 mtime 变化的文件
  - 首次全量扫描，后续增量

### Phase 3: 前端优化

- [ ] **3.1** ECharts 按需导入（bundle size ~1.4MB → ~400KB）
- [ ] **3.2** 热力图中文 locale 修复
- [ ] **3.3** index.html 标题更新

### Phase 4: Rust 代码清理

- [ ] **4.1** 清理 `ClaudeMessage` 未使用字段，消除 dead code 警告

### Phase 5: 测试覆盖

- [ ] **5.1** Rust 单元测试（parsers、db queries）
- [ ] **5.2** 前端关键组件测试
