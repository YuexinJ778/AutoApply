# Chrome Extension Development Notes

See the [project README](../README.md) for current features, installation, and usage. The notes below describe earlier development stages and verification work.

## Scope
This extension is the Stage 3 browser intake layer. It extracts a normalized `PageSnapshot` from the current page and prepares data for Stage 4 parser work.

## Local Load
1. Open `chrome://extensions/`.
2. Turn on `Developer mode`.
3. Click `Load unpacked`.
4. Select the folder: `Chrome extension/`.

## Reload After Changes
1. Go to `chrome://extensions/`.
2. Find this extension.
3. Click `Reload`.

## Success Path Test
1. Open a normal web page, for example `https://example.com`.
2. Open extension popup.
3. Click `Extract Current Page`.
4. Expected UI:
- Status badge changes: `Loading` -> `Success`.
- Snapshot summary shows `title`, `url`, `hostname`, `pathname`, `htmlLang`, `site type`, `extractedAt`.
- Metadata section shows available values for `canonical`, `og:title`, `og:description` (or `-` when unavailable).
- Content section shows `text length` and preview.

## Storage Test (`chrome.storage.local`)
1. Complete one successful extraction.
2. Close popup.
3. Re-open popup.
4. Expected: previously extracted snapshot appears immediately (loaded from `LAST_PAGE_SNAPSHOT`).

## Error Path Test
1. Open a restricted page (for example `chrome://extensions`).
2. Open popup and click `Extract Current Page`.
3. Expected:
- Status badge becomes `Error`.
- Error panel displays message and code (if provided).

## Console / Debug Locations
- Popup console: open popup, right click, `Inspect`.
- Background console: `chrome://extensions/` -> extension card -> `Service worker` -> `Inspect`.
- Page console: regular DevTools on the target tab.

## Stage 3 Final Acceptance Checklist (Block 14 - 17)
- Extension can be loaded and reloaded in Chrome.
- Popup can trigger extraction on normal pages.
- Snapshot includes normalized core fields and cleaned `pageText`.
- Snapshot may include optional metadata:
  - `metadata.canonicalUrl`
  - `metadata.ogTitle`
  - `metadata.ogDescription`
- Snapshot includes coarse site hint:
  - `hints.probableSiteType` in `greenhouse | lever | workday | generic | unknown`
- Latest snapshot is saved to and restored from `chrome.storage.local`.
- Popup provides clear `idle/loading/success/error` feedback.
- Major failure paths are surfaced to users and visible in logs.

## Not In Stage 3
- No Stage 4 parser rules.
- No resume generation / PDF pipeline.
- No autofill / upload / submit / tracking.
- No cloud sync / OCR / screenshot pipeline.

## AI Instructions Feature Verification
- Date/Time: 2026-04-13 19:22:06 EDT
- Verification Goal:
  - Verify whether `AI Instructions / Custom Prompt Prefix` is actually implemented (UI entry, editor UI, storage, prompt integration, JSON-contract guardrails).

- Verification Method:
  - Static code inspection only (current environment did not run popup/browser interaction).
  - Checked files:
    - `popup/popup.html`
    - `popup/popup.js`
    - `popup/popup.css`
    - `storage/localStore.js`
    - `lib/constants.js`
    - `lib/api.js`
    - `lib/tailoring/buildTailoredResumePrompt.js`
  - Searched for feature identifiers and behavior hooks:
    - `AI Instructions`, `Additional Instructions`, `aiCustomInstructions`, `custom instructions`, Save/Reset handlers, storage key read/write, prompt wrapper insertion.

- Verification Items Result:
  - UI
    - AI Instructions entry exists: **No**
    - Editor view opens on click: **No**
    - Required controls (title/description/textarea/Save/Reset): **No**
  - Storage
    - Save writes local storage key: **No**
    - Reopen auto-prefill: **No**
    - Reset clears input + storage: **No**
  - Prompt Integration
    - Custom instructions injected into final prompt: **No**
    - Safe wrapper structure (system role -> user additional instructions -> fixed JSON contract -> content): **No**
    - Fixed JSON contract still present in system prompt: **Yes**
      - Existing contract evidence is in `lib/tailoring/buildTailoredResumePrompt.js` (`Hard output rules`, `OUTPUT_SCHEMA`, `Return only the JSON object.`)
  - Scope Control
    - No full prompt editor opened: **Yes**
    - Existing AI JSON generation flow appears unmodified by this feature: **Yes**

- Overall Pass/Fail:
  - **Not Passed**

- Gaps (why not passed):
  - Missing AI Instructions UI entry and editor UI.
  - Missing local storage key and Save/Reset/prefill logic for custom instructions.
  - Missing prompt-builder integration for custom instructions.
  - Missing explicit length limit and empty-value handling for custom instructions (feature not present).

- Notes:
  - This verification did not include keyword autofill, Job Status, schema editor, or preset systems.
  - If implemented later, re-verify with runtime flow: open popup -> edit/save -> reopen/prefill -> reset -> run generate -> inspect final prompt composition.

## AI Instructions Feature
- 日期时间: 2026-04-13 19:27:35 EDT
- 本次目标:
  - 增加 `AI Instructions / Custom Prompt Prefix`，允许用户输入附加偏好说明，并在不破坏固定 JSON 输出契约的前提下接入 AI prompt。

- 修改的文件:
  - `popup/popup.html`
  - `popup/popup.css`
  - `popup/popup.js`
  - `lib/api.js`
  - `lib/tailoring/buildTailoredResumePrompt.js`
  - `lib/constants.js`
  - `storage/localStore.js`
  - `lib/constants.ts`
  - `storage/localStore.ts`
  - `lib/types.ts`

- 新增 UI 功能说明:
  - 在 `Model Settings` 下方新增 `AI Instructions` accordion 入口。
  - 展开后包含:
    - 标题: `AI Instructions`
    - 说明文字: 明确说明该项为附加偏好，不会改变最终 JSON 格式要求
    - 多行输入框: `Additional Instructions`
    - `Save` 按钮
    - `Reset` 按钮
    - 状态提示行（保存/重置成功或失败）

- storage 保存方式:
  - 使用现有 `extensionSettings` 机制存储字段 `aiCustomInstructions`。
  - `Save`: `storage.setSettings({ aiCustomInstructions: <text> })`
  - `Reset`: `storage.setSettings({ aiCustomInstructions: "" })`
  - 初始化回填: popup 打开后通过 `storage.getSettings()` 自动回填。
  - 长度限制: 800 字符（超出截断；textarea 也设置 `maxlength=800`）。

- prompt 拼接方式:
  - 在 prompt builder 中采用安全结构拼接:
    1) System role/task
    2) User additional instructions wrapper
    3) 固定 JSON contract（Hard output rules / OUTPUT_SCHEMA）
    4) Job/Candidate context
  - 插入文本示例块:
    - `User additional instructions:`
    - `{customInstructions 或 "(none)"}`

- JSON contract 保护方式:
  - 在用户说明后再次声明并保留固定输出规则（valid JSON only / strict schema / no markdown / no explanations）。
  - 用户说明被明确限制为“仅在不冲突于 schema 和格式规则时生效”。
  - 未开放系统 prompt 全量编辑。

- 当前完成结果:
  - 已可在 popup 中编辑、保存、重置 AI Instructions。
  - 已支持关闭后重新打开自动回填。
  - 已接入生成流程 prompt（`generateResume` 构建 prompt 时注入）。
  - 固定 JSON 输出契约仍保留且位于用户说明之后再次强调。

- 本次没有做什么:
  - 未修改 JSON schema。
  - 未开放完整 prompt 模板编辑器。
  - 未增加多套 prompt preset。
  - 未改 parser 结构契约。
  - 未改远端数据库或账号同步相关能力。

## AI Instructions Feature Verification
- 日期时间: 2026-04-13 19:29:33 EDT
- 验证目标:
  - 验证 AI Instructions / Custom Prompt Prefix 是否完成（仅 UI、存储、prompt 接入与保护机制）。

- 验证方法:
  - 代码静态核查（当前环境未执行浏览器内手动点击）。
  - 核查文件:
    - `popup/popup.html`
    - `popup/popup.js`
    - `popup/popup.css`
    - `lib/api.js`
    - `lib/tailoring/buildTailoredResumePrompt.js`
    - `storage/localStore.js`
    - `lib/constants.js`
  - 检索项:
    - `AI Instructions` 入口/控件
    - `aiCustomInstructions` 存储读写与回填
    - prompt 拼接是否插入 custom instructions 且保留 JSON contract
    - 长度限制与空值兼容

- 每条验证项结果:
  - UI
    - AI Instructions 入口是否存在: 通过
    - 编辑界面是否存在: 通过
    - 必要控件（标题/说明/textarea/Save/Reset）是否齐全: 通过
  - Storage
    - Save 是否有效（写入本地存储）: 通过
    - 回填是否有效（初始化读取）: 通过
    - Reset 是否有效（输入与存储清空）: 通过
  - Prompt Integration
    - custom instructions 是否接入最终 prompt: 通过
    - 是否有 wrapper / 安全拼接结构: 通过
    - JSON contract 是否仍被保留: 通过
  - 范围控制
    - 是否没有开放完整 prompt 编辑: 通过
    - 是否没有破坏现有 AI JSON 生成流程: 通过（代码路径保持兼容）
  - 其他约束
    - 长度限制与空值兼容: 通过（800 字符限制 + 空值回退 `(none)`）

- 是否通过:
  - 通过（代码级验证通过）

- 若未通过，缺口是什么:
  - 本次无阻断未通过项。

- 备注:
  - 本结论基于源码与状态流验证；未在当前 CLI 环境执行浏览器交互式端到端回归。
