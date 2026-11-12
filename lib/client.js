/**
 * dsh-model-picker — browser half.
 *
 * A hand-written module in the `window.__ModuleLoader__.load({ id, factory })` shape every DSH client half uses (no
 * ESM syntax). It requires `react`, `react-dom` and DSH's shared UI primitives, all in the shell's shared module table.
 *
 * The composer's model seat (`conversation.input.model`, a `single` slot) as a cascading menu. The root card has three
 * rows — 服务商 / 模型 / 推理等级. Hovering (or clicking, or →) a row opens the next card beside it: the providers (each
 * with the model last used with it), a provider's models only (the filter the shipped selector lacks), a model's
 * reasoning levels or its on/off switch. A model with levels is chosen through them; one without is chosen by its
 * click. Every open card stays visible, so the pointer goes back to any level; ← and Escape close the deepest card. A
 * window too narrow for side-by-side cards shows one card at a time with a 返回 row. The trigger is the shipped one:
 * the model name and the effort, the model glyph in the composer's compact mode.
 *
 * Data and selection ride DSH's own per-session model directory (`ctx.modelDirectories`, the service the shipped
 * selector and `/model` share), so a choice in either place is what the other shows next. The seat registers at
 * priority -5: ahead of the shipped selector (the default rank, 0), behind the liveshare viewer's seat (-10, on its own
 * page). Where the directory service or a primitive this seat draws with is missing, nothing registers and DSH's own
 * selector stays.
 */
window.__ModuleLoader__.load({
  id: "dsh-model-picker",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const React = require("react");
    const ReactDOM = require("react-dom");
    const P = require("@deepseek-ai/dsh-client-ui-primitives");
    const h = React.createElement;
    const { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } = React;

    const NS = "model-picker";
    const STYLE_ID = "dsh-model-picker";
    /** Ahead of the shipped seat (0), behind the liveshare viewer's (-10). */
    const SEAT_PRIORITY = -5;
    /** A list longer than this shows its search field (the shipped selector's rule for models). */
    const SEARCH_ABOVE = 4;
    /** The provider each model was last used with, kept in this browser. */
    const LAST_KEY = "dsh-model-picker.last";
    /** 0.2.2's record of a colour per provider; that palette is gone, so the record is removed once. */
    const RETIRED_KEYS = ["dsh-model-picker.colors"];
    /** Below this window width (or on a touch device) the cards show one at a time, with a 返回 row. */
    const CASCADE_MIN_WIDTH = 720;
    /** Between side-by-side cards, and kept from the window's edges. */
    const CARD_GAP = 4;
    const VIEW_MARGIN = 12;
    /** How long the pointer rests on another row before its card replaces the open one (diagonal moves pass). */
    const HOVER_OPEN_MS = 90;
    const HOVER_SWITCH_MS = 160;
    /** Unplaced card: hidden but laid out, so its size is real for the placement pass. */
    const MEASURE_STYLE = { visibility: "hidden", left: 0, top: 0 };
    /** The gap between the trigger and the card above it (DSH's selector). */
    const ANCHOR_GAP = 8;
    /** The rows ↑ ↓ move through: the card's own, and the switches an option contributes. */
    const FOCUSABLE_ROWS = 'button[role="menuitem"]:not([disabled]), button[role="menuitemradio"]:not([disabled]), button[role="switch"]:not([disabled])';

    const DICTS = {
      en: {
        "provider.account": "DeepSeek Account",
        "menu.aria": "Provider, model and reasoning effort",
        "menu.provider": "Provider",
        "menu.model": "Model",
        "menu.effort": "Effort",
        "menu.back": "Back",
        "menu.pickModel": "Select a model",
        "trigger.fallback": "Select model",
        "trigger.loading": "Loading models…",
        "trigger.selectAria": "Select model",
        "trigger.aria": "Select model, current {model} ({provider})",
        "trigger.ariaEffort": "Select model, current {model} ({provider}), reasoning effort {effort}",
        "effort.providerDefault": "Default",
        "effort.defaultNote": "default",
        "effort.title": "{model} · effort",
        "provider.last": "Last used: {model}",
        "provider.count": "{count} models",
        "provider.countOne": "1 model",
        "status.loading": "Refreshing model list…",
        "error.action": "Model operation failed: {message}",
        "error.sessionInUse": "This session is already in use, possibly by another running DSH instance (such as dsh web or the desktop app). Quit other running DSH instances and try again.",
        "action.reload": "Reload",
        "warning.groupLoad": "{name} failed to load: {message}",
        "search.providers": "Search providers…",
        "search.models": "Search models…",
        "search.clear": "Clear search",
        "search.noProviders": "No matching providers.",
        "search.noModels": "No matching models.",
        "empty.catalog": "No models available.",
        "empty.models": "This provider offers no models.",
        "empty.efforts": "This model provides no reasoning effort levels.",
      },
      zh: {
        "provider.account": "DeepSeek 账号",
        "menu.aria": "服务商、模型与推理等级",
        "menu.provider": "服务商",
        "menu.model": "模型",
        "menu.effort": "推理等级",
        "menu.back": "返回",
        "menu.pickModel": "请选择模型",
        "trigger.fallback": "请选择模型",
        "trigger.loading": "正在加载模型…",
        "trigger.selectAria": "请选择模型",
        "trigger.aria": "选择模型，当前 {model}（{provider}）",
        "trigger.ariaEffort": "选择模型，当前 {model}（{provider}），推理等级 {effort}",
        "effort.providerDefault": "Default",
        "effort.defaultNote": "默认",
        "effort.title": "{model} · 推理等级",
        "provider.last": "上次使用：{model}",
        "provider.count": "{count} 个模型",
        "provider.countOne": "1 个模型",
        "status.loading": "正在刷新模型列表…",
        "error.action": "模型操作失败：{message}",
        "error.sessionInUse": "当前会话已被占用，可能是其他正在运行的 DSH 导致的（如其他 dsh web、桌面端），请退出其他正在运行的 DSH 后重试。",
        "action.reload": "重新加载",
        "warning.groupLoad": "{name} 加载失败：{message}",
        "search.providers": "搜索服务商…",
        "search.models": "搜索模型…",
        "search.clear": "清除搜索",
        "search.noProviders": "没有匹配的服务商。",
        "search.noModels": "没有匹配的模型。",
        "empty.catalog": "暂无可用模型",
        "empty.models": "该服务商暂无可用模型。",
        "empty.efforts": "当前模型未提供推理等级。",
      },
    };

    // ------------------------------------------------------------ pure helpers

    /** The shipped order: the DeepSeek account, then DeepSeek, then every other provider in catalog order. */
    function orderProviders(groups) {
      const rank = (group) => (group.id === "deepseek-account" ? 0 : group.id === "deepseek-official" ? 1 : 2);
      return [...(groups ?? [])].map((group, index) => ({ group, index })).sort((a, b) => rank(a.group) - rank(b.group) || a.index - b.index).map((entry) => entry.group);
    }

    /** The localized provider name (the DeepSeek account's is DSH's own wording). */
    const providerName = (t, group) => (group.id === "deepseek-account" ? t("provider.account") : group.name);

    /** Case-insensitive ordered-subsequence filter, prefix first: the primitives' `rankByName` where present. */
    function rank(items, query) {
      if (typeof P.rankByName === "function") return P.rankByName(items, query);
      const q = String(query ?? "").trim().toLowerCase();
      if (!q) return [...items];
      const scored = [];
      items.forEach((item, index) => {
        const name = String(item.name ?? "").toLowerCase();
        let at = 0;
        for (const char of name) if (char === q[at]) at += 1;
        if (at === q.length) scored.push({ item, index, prefix: name.startsWith(q) ? 0 : 1 });
      });
      return scored.sort((a, b) => a.prefix - b.prefix || a.index - b.index).map((entry) => entry.item);
    }

    /** The reasoning rows of a model: the provider default where the adapter sets none, then its levels. */
    function effortChoices(t, reasoning) {
      if (!reasoning) return [];
      return [
        ...(reasoning.defaultEffort === undefined ? [{ key: "provider-default", effort: undefined, label: t("effort.providerDefault") }] : []),
        ...(reasoning.efforts ?? []).map((effort) => ({ key: `effort:${effort.id}`, effort: effort.id, label: effort.name })),
      ];
    }

    /** Whether a model is chosen through its levels: two or more (one level, or none, is no choice). */
    const hasLevels = (t, model) => effortChoices(t, model?.reasoning).length > 1;

    /** The effort caption of a selection: its level's name, the provider default, or the retained one. */
    function effortLabelOf(t, selection, model, retained) {
      if (!model) return undefined;
      const reasoning = model.reasoning;
      if (reasoning === undefined) return retained;
      const effective = selection?.reasoningEffort ?? reasoning.defaultEffort;
      if (effective === undefined) return t("effort.providerDefault");
      return reasoning.efforts?.find((level) => level.id === effective)?.name ?? effective;
    }

    /** What the provider list says under a provider: the model last used with it, else how many it offers. */
    function providerNote(t, group, last) {
      const model = last ? group.models?.find((item) => item.id === last) : undefined;
      if (model) return t("provider.last", { model: model.name });
      const count = group.models?.length ?? 0;
      return count === 1 ? t("provider.countOne") : t("provider.count", { count });
    }

    /** The provider → model memory, read and written through `storage` (localStorage; absent or failing: empty). */
    function lastUsedStore(storage) {
      const read = () => {
        try {
          const value = JSON.parse(storage?.getItem(LAST_KEY) ?? "{}");
          return value && typeof value === "object" && !Array.isArray(value) ? value : {};
        } catch {
          return {};
        }
      };
      return {
        read,
        remember(provider, model) {
          if (typeof provider !== "string" || typeof model !== "string") return;
          const map = read();
          if (map[provider] === model) return;
          map[provider] = model;
          try {
            storage?.setItem(LAST_KEY, JSON.stringify(map));
          } catch {
            /* a full or blocked store keeps no memory: the list shows counts instead */
          }
        },
      };
    }
    const browserStorage = () => {
      try {
        return typeof localStorage === "undefined" ? null : localStorage;
      } catch {
        return null;
      }
    };
    /** Remove what earlier versions stored and this one no longer reads. */
    function clearRetired(storage) {
      for (const key of RETIRED_KEYS) {
        try {
          if (storage?.getItem(key) !== null && storage?.getItem(key) !== undefined) storage.removeItem(key);
        } catch {
          /* a blocked store: nothing to clear */
        }
      }
    }

    /**
     * Where a card opens beside the one before it: on the side `direction` prefers when it fits, else the other,
     * else the roomier one, kept in the window; level with the row that opened it, moved up to fit the window.
     * @returns `{ left, top, direction }` (the side used, which the next card keeps).
     */
    function placeBeside({ previous, openerTop, width, height, direction, viewport }) {
      const right = previous.left + previous.width + CARD_GAP;
      const left = previous.left - CARD_GAP - width;
      const fitsRight = right + width <= viewport.width - VIEW_MARGIN;
      const fitsLeft = left >= VIEW_MARGIN;
      let side = direction === "left" ? (fitsLeft ? "left" : fitsRight ? "right" : null) : (fitsRight ? "right" : fitsLeft ? "left" : null);
      if (side === null) side = viewport.width - (previous.left + previous.width) >= previous.left ? "right" : "left";
      const x = Math.max(VIEW_MARGIN, Math.min(side === "right" ? right : left, viewport.width - VIEW_MARGIN - width));
      const y = Math.max(VIEW_MARGIN, Math.min(openerTop - 4, viewport.height - VIEW_MARGIN - height));
      return { left: Math.round(x), top: Math.round(y), direction: side };
    }

    /**
     * Where the anchored card goes when the browser has no CSS anchor positioning: above the trigger, right edges
     * aligned, inside the window (what the CSS rule `.mp-anchored` does, and DSH's selector before 0.2.2-rc.2).
     */
    function placeAbove({ anchor, width, height, viewport }) {
      const left = Math.max(VIEW_MARGIN, Math.min(anchor.right - width, viewport.width - VIEW_MARGIN - width));
      const top = Math.max(VIEW_MARGIN, Math.min(anchor.top - ANCHOR_GAP - height, viewport.height - VIEW_MARGIN - height));
      return { left: Math.round(left), top: Math.round(top) };
    }

    let anchorSupport;
    /** Whether the browser places by CSS anchors (DSH 0.2.2-rc.2 places its own selector so). */
    function anchorsSupported() {
      if (anchorSupport === undefined) {
        try {
          const css = globalThis.CSS;
          anchorSupport = typeof css?.supports === "function" && css.supports("anchor-name", "--mp-probe") && css.supports("position-anchor", "--mp-probe");
        } catch {
          anchorSupport = false;
        }
      }
      return anchorSupport;
    }

    /**
     * The primitives this seat draws with; without any of them, DSH's own selector stays. The card's placement
     * needs none (DSH 0.2.2-rc.2 removed `useAnchoredPosition`).
     */
    function primitivesReady() {
      return Boolean(P && P.MenuSurface && typeof P.MenuGroup === "function" && P.Input && ReactDOM && typeof ReactDOM.createPortal === "function");
    }

    // ------------------------------------------------------------ stylesheet

    /** The shipped selector's styles (ui-model-selection ModelSelect.module.css, rc.2), plus the cascade's. */
    const CSS = `
.mp-root { position: relative; min-width: 0; }
.mp-trigger { anchor-name: var(--mp-anchor); display: flex; align-items: center; gap: 4px; min-width: 0; max-width: 360px; height: 28px; padding: 0 4px 0 8px; border: none;
  border-radius: var(--dsw-radius-sm); outline: none; background: transparent; color: var(--dsw-alias-label-secondary); font-size: 13px;
  line-height: 20px; font-weight: 400; cursor: pointer; font-family: inherit; }
@media (hover: hover) { .mp-trigger:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); } }
.mp-trigger:focus-visible:not([data-selection-focus]) { box-shadow: 0 0 0 2px var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); }
.mp-trigger:disabled { color: var(--dsw-alias-label-dimmed); cursor: default; }
.mp-trigger-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mp-trigger-effort { flex-shrink: 1000; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-caption); }
.mp-trigger-icon { display: var(--dsh-composer-model-icon-display, none); flex: 0 0 auto; }
.mp-trigger-label, .mp-trigger-effort { display: var(--dsh-composer-model-text-display, block); }
.mp-chevron { flex: 0 0 auto; color: var(--dsw-alias-label-caption); transition: transform 120ms ease; }
.mp-chevron-open { transform: rotate(180deg); }
.mp-menu { box-sizing: border-box; position: fixed; z-index: 1100; display: flex; flex-direction: column; width: max-content;
  min-width: min(240px, calc(100vw - 24px)); max-width: min(360px, calc(100vw - 24px));
  max-height: min(400px, calc(100dvh - 96px)); overflow: hidden; padding: 4px; border: 0;
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1); box-shadow: var(--dsw-elevation-prominent); color: var(--dsw-alias-label-primary);
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2); --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2); }
.mp-menu.mp-side { min-width: 220px; max-width: 320px; max-height: min(400px, calc(100dvh - 24px)); }
/* The anchored card (the root one, or the only one): above the trigger, right edges aligned, inside the window, by
   CSS anchors as DSH 0.2.2-rc.2's selector; the browser keeps it there through zoom, scroll and resize. */
.mp-menu.mp-anchored { position-anchor: var(--mp-anchor); top: max(12px, var(--dsh-frame-overlay-top, 12px)); left: 12px;
  right: anchor(right); bottom: calc(anchor(top) + 8px); align-self: safe end; justify-self: safe end; margin: 0;
  width: fit-content; height: fit-content; }
/* Session options other plugins add under the root rows (DSH's Agent Teams switch). */
.mp-options:empty { display: none; }
.mp-status, .mp-empty { padding: 8px; color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
.mp-error, .mp-warning { display: flex; align-items: flex-start; justify-content: space-between; gap: 6px; margin-bottom: 3px; padding: 6px 7px;
  border-radius: var(--dsw-radius-md); background: var(--dsw-alias-interactive-bg-hover-danger); color: var(--dsw-alias-state-error-primary); font-size: 11px; line-height: 16px; }
.mp-warning { background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-state-warn-label); }
.mp-retry { flex: 0 0 auto; padding: 0; border: none; background: transparent; color: inherit; font: inherit; font-weight: 600; cursor: pointer; }
.mp-search-row { position: relative; flex-shrink: 0; margin: 2px 0 3px; }
.mp-search-row .mp-search { display: flex; height: auto; padding: 5px 7px; border: 0 solid transparent; border-radius: var(--dsw-radius-md); background: transparent; }
.mp-search-row .mp-search-query { padding-right: 34px; }
.mp-search-row .mp-search:focus-within { border-color: transparent; }
.mp-search-row .mp-search input { padding: 0; font-size: 12px; line-height: normal; }
@media (pointer: coarse) { .mp-search-row .mp-search input { font-size: 16px; } }
.mp-search-row .mp-search input::placeholder { color: var(--dsw-alias-label-caption); }
.mp-search-clear { position: absolute; top: 50%; right: 4px; transform: translateY(-50%); display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; padding: 0; border: none; border-radius: 50%; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.mp-search-clear:focus-visible { outline: none; background: var(--dsw-alias-interactive-bg-hover); }
@media (hover: hover) { .mp-search-clear:hover { outline: none; background: var(--dsw-alias-interactive-bg-hover); } }
.mp-groups:not([hidden]) { min-height: 0; overflow-x: hidden; overflow-y: auto; }
/* Provider names in DeepSeek Harness's own blue (its link colour, deepseek-500 light / -400 dark), set apart from the
   model names. Scoped to the menu so it outranks .mp-name and .mp-cell-value, which set their colour later. */
.mp-menu .mp-provider-name, .mp-groups[data-provider] > [data-menu-group] > [data-menu-group-heading] { color: var(--dsw-alias-link); }
.mp-option:disabled .mp-provider-name, .mp-cell:disabled .mp-provider-name { color: var(--dsw-alias-label-dimmed); }
/* The heading of a card (the provider over its models, the model over its levels) in the size of the provider names in
   the providers card (13 px), not the primitive heading's 11 px; medium weight and the secondary label colour keep it a heading. */
.mp-menu [data-menu-group-heading] { padding: 6px 7px 4px; color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 18px; font-weight: 500; }
.mp-option { box-sizing: border-box; display: flex; align-items: center; gap: 6px; width: auto; min-width: 100%; max-width: 100%; min-height: 34px; padding: 5px 7px;
  border: none; border-radius: var(--dsw-radius-md); outline: none; background: transparent; color: inherit; text-align: left; cursor: pointer; font-family: inherit; }
.mp-option:focus-visible, .mp-option-active:not(:disabled), .mp-option[aria-expanded="true"] { background: var(--dsw-alias-interactive-bg-hover); }
@media (hover: hover) { .mp-option:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); } }
.mp-option:disabled { color: var(--dsw-alias-label-dimmed); cursor: default; }
.mp-option-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.mp-name { overflow: hidden; color: inherit; font-size: 13px; line-height: 18px; font-weight: 400; text-overflow: ellipsis; white-space: nowrap; }
.mp-note { overflow: hidden; color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 16px; text-overflow: ellipsis; white-space: nowrap; }
.mp-tail-note { flex: 0 0 auto; color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 16px; }
.mp-badged { display: inline-flex; align-items: center; max-width: 100%; gap: 4px; vertical-align: baseline; white-space: nowrap; }
.mp-badged-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.mp-badge { flex: none; }
.mp-check { display: grid; place-items: center; flex: 0 0 14px; color: var(--dsw-alias-label-primary); }
.mp-check svg { width: 14px; height: 14px; }
.mp-row-chevron { flex: 0 0 auto; width: 12px; height: 12px; color: var(--dsw-alias-menu-icon); }
.mp-cell { box-sizing: border-box; display: flex; align-items: center; gap: 6px; width: auto; min-width: 100%; height: 34px; padding: 0 8px; border: none;
  border-radius: var(--dsw-radius-md); background: transparent; color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 20px; cursor: pointer;
  text-align: left; outline: none; font-family: inherit; }
.mp-cell:focus-visible, .mp-cell[aria-expanded="true"] { background: var(--dsw-alias-interactive-bg-hover); }
@media (hover: hover) { .mp-cell:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); } }
.mp-cell:disabled { color: var(--dsw-alias-label-dimmed); cursor: default; }
.mp-cell-label { flex: 0 0 auto; white-space: nowrap; }
.mp-cell-value { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; color: var(--dsw-alias-label-tertiary); }
.mp-cell-value[data-unset] { color: var(--dsw-alias-label-caption); }
.mp-back { box-sizing: border-box; display: flex; align-items: center; gap: 6px; flex-shrink: 0; width: 100%; min-height: 30px; margin-bottom: 2px; padding: 0 7px; border: none;
  border-radius: var(--dsw-radius-md); background: transparent; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; cursor: pointer;
  text-align: left; outline: none; font-family: inherit; }
.mp-back:focus-visible { background: var(--dsw-alias-interactive-bg-hover); }
@media (hover: hover) { .mp-back:hover { background: var(--dsw-alias-interactive-bg-hover); } }
.mp-back-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-tertiary); }
`;

    function installStyle() {
      if (typeof document === "undefined" || !document.head) return () => {};
      // A reload of the plugin replaces the previous sheet.
      for (const old of document.querySelectorAll(`style[data-plugin-css="${STYLE_ID}"]`)) old.remove();
      const tag = document.createElement("style");
      tag.dataset.pluginCss = STYLE_ID;
      tag.textContent = CSS;
      document.head.appendChild(tag);
      return () => tag.remove();
    }

    // ------------------------------------------------------------ icons (DSH's own where the primitives carry them)

    const lineIcon = (size, ...paths) => (props = {}) => h("svg", { viewBox: "0 0 16 16", width: size, height: size, fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, className: props.className }, ...paths.map((d, index) => h("path", { key: index, d })));
    const icon = (name, fallback) => (typeof P[name] === "function" || (P[name] && typeof P[name] === "object") ? P[name] : fallback);
    const IconData = icon("IconDataOutlineRegular", lineIcon(16, "M3 4.5h10", "M3 8h10", "M3 11.5h6"));
    const IconCheck = icon("IconCheckOutlineRegular", lineIcon(14, "M3.5 8.5l3 3 6-7"));
    const IconChevronDown = icon("IconChevronDownOutlineRegular", lineIcon(12, "M4 6l4 4 4-4"));
    const IconChevronRight = icon("IconChevronRightOutlineRegular", lineIcon(12, "M6 4l4 4-4 4"));
    const IconChevronLeft = icon("IconChevronLeftOutlineRegular", lineIcon(12, "M10 4L6 8l4 4"));
    const IconClose = icon("IconCloseFillRegular", lineIcon(12, "M4.5 4.5l7 7", "M11.5 4.5l-7 7"));
    const IconWarning = icon("IconWarningOutlineRegular", lineIcon(14, "M8 2.5l6 11H2z", "M8 6.5v3.5", "M8 12v.01"));
    const Spinner = () => (typeof P.StateDot === "function" ? h(P.StateDot, { state: "ongoing" }) : h("span", { "aria-hidden": true }, "…"));

    const cls = (...names) => names.filter(Boolean).join(" ");
    const isMobile = () => (typeof P.isMobileDevice === "function" ? P.isMobileDevice() : false);
    const isInput = (node) => (typeof HTMLInputElement !== "undefined" ? node instanceof HTMLInputElement : node?.tagName === "INPUT" || node?.type === "input");
    const activeElement = () => (typeof document === "undefined" ? null : document.activeElement);
    const viewportSize = () => (typeof window === "undefined" ? { width: 1280, height: 800 } : { width: window.innerWidth || 1280, height: window.innerHeight || 800 });

    // ------------------------------------------------------------ the seat

    /**
     * The composer model seat.
     * @param props - owner share (`locked`), the injected face (the session's directory store and verbs, `lastUsed`),
     * the locale seat (`t`) and the label slot's renderer.
     */
    function ProviderModelSelect(props) {
      const { locked, available, directory, load, select, resolveText, lastUsed, t, renderSlot } = props;
      const state = useSyncExternalStore((fn) => directory.subscribe(fn), () => directory.getSnapshot());
      const [open, setOpen] = useState(false);
      const [cascade, setCascade] = useState(true);
      // The cards open beside the root one: { kind: "providers" } | { kind: "models", provider } | { kind: "efforts", provider, model },
      // each with the key of the row that opened it.
      const [path, setPath] = useState([]);
      const [queries, setQueries] = useState({ providers: "", models: "" });
      const [highlight, setHighlight] = useState({});
      const [places, setPlaces] = useState({});
      const [layoutTick, setLayoutTick] = useState(0);
      // Bumped to move the focus without a card opening or closing (into an open card, from the trigger).
      const [focusTick, setFocusTick] = useState(0);
      const [selectionFocus, setSelectionFocus] = useState(false);
      const [memory, setMemory] = useState(() => lastUsed.read());
      const [toast, setToast] = useState(null);
      const lastAction = useRef("load");
      const toastSeq = useRef(0);
      const rootRef = useRef(null);
      const triggerRef = useRef(null);
      const cards = useRef([]);
      const rows = useRef(new Map());
      const searches = useRef([]);
      const hoverTimer = useRef(null);
      const focusIntent = useRef(null);
      const anchorCard = useRef(null);
      const id = useId();
      const columnsCount = path.length + 1;
      // The trigger names the anchor the anchored card is placed by (one per seat).
      const anchorStyle = { "--mp-anchor": `--mp-anchor-${id.replace(/[^A-Za-z0-9_-]/g, "")}` };
      const anchored = anchorsSupported();
      const [fallbackPos, setFallbackPos] = useState(null);

      const groups = useMemo(() => orderProviders(state.groups).map((group) => ({ ...group, provider: { id: group.id, name: providerName(t, group) } })), [state.groups, t]);
      const current = state.current;
      const currentGroup = current ? groups.find((group) => group.id === current.provider) : undefined;
      const currentModel = currentGroup?.models?.find((model) => model.id === current.model);
      const busy = state.pending !== null && state.pending !== undefined;
      const pending = state.pending ?? null;
      const effective = current?.reasoningEffort ?? currentModel?.reasoning?.defaultEffort;
      const effortLabel = effortLabelOf(t, current, currentModel, state.retainedEffort);

      // Every selection in use is remembered for its provider, whichever entry made it (this one or /model).
      useEffect(() => {
        if (!current || !currentModel) return;
        lastUsed.remember(current.provider, current.model);
        setMemory(lastUsed.read());
      }, [current?.provider, current?.model, Boolean(currentModel)]);

      useEffect(() => () => clearTimeout(hoverTimer.current), []);

      const reload = () => {
        lastAction.current = "load";
        load();
      };

      // A pointer press outside the trigger and every card closes the menu.
      useEffect(() => {
        if (!open || typeof document === "undefined") return undefined;
        const closeOutside = (event) => {
          if (rootRef.current?.contains(event.target) === true) return;
          if (cards.current.some((card) => card?.contains(event.target) === true)) return;
          setOpen(false);
          setPath([]);
        };
        document.addEventListener("mousedown", closeOutside);
        return () => document.removeEventListener("mousedown", closeOutside);
      }, [open]);

      // The window resized or scrolled: place the side cards (and, without CSS anchors, the anchored one) again.
      useEffect(() => {
        if (!open || (!cascade && anchored) || typeof window === "undefined" || typeof window.addEventListener !== "function") return undefined;
        const again = () => setLayoutTick((tick) => tick + 1);
        window.addEventListener("resize", again);
        window.addEventListener("scroll", again, true);
        return () => {
          window.removeEventListener("resize", again);
          window.removeEventListener("scroll", again, true);
        };
      }, [open, cascade, anchored]);

      // Without CSS anchors the seat places the anchored card itself, before the side cards are placed beside it.
      useLayoutEffect(() => {
        if (anchored || !open) {
          if (fallbackPos !== null) setFallbackPos(null);
          return;
        }
        const card = anchorCard.current;
        const trigger = triggerRef.current;
        if (!card || typeof trigger?.getBoundingClientRect !== "function") return;
        const next = placeAbove({ anchor: trigger.getBoundingClientRect(), width: card.offsetWidth, height: card.offsetHeight, viewport: viewportSize() });
        if (fallbackPos === null || fallbackPos.left !== next.left || fallbackPos.top !== next.top) setFallbackPos(next);
      });

      // Side by side: each card beside the one before it, level with the row that opened it.
      useLayoutEffect(() => {
        if (!open || !cascade) return;
        const viewport = viewportSize();
        const next = {};
        let previous = null;
        let direction = "right";
        for (let column = 0; column < columnsCount; column += 1) {
          const card = cards.current[column];
          if (!card || typeof card.getBoundingClientRect !== "function") break;
          const rect = card.getBoundingClientRect();
          if (column === 0) {
            previous = { left: rect.left, top: rect.top, width: rect.width, dom: rect };
            continue;
          }
          const opener = rows.current.get(`${column - 1}:${path[column - 1]?.opener}`);
          const openerRect = opener?.getBoundingClientRect?.();
          const offset = openerRect ? openerRect.top - previous.dom.top : 0;
          const place = placeBeside({ previous, openerTop: previous.top + offset, width: card.offsetWidth || rect.width, height: card.offsetHeight || rect.height, direction, viewport });
          next[column] = { left: place.left, top: place.top };
          direction = place.direction;
          previous = { left: place.left, top: place.top, width: card.offsetWidth || rect.width, dom: rect };
        }
        if (JSON.stringify(next) !== JSON.stringify(places)) setPlaces(next);
      });

      // After a card opens or closes by key or click: focus into it (its search, its checked row, its first row), or
      // back on the row that had opened the closed one.
      useEffect(() => {
        const intent = focusIntent.current;
        focusIntent.current = null;
        if (!open || intent === null) return;
        if (intent.target === "enter") {
          const search = searches.current[intent.column];
          if (search && !isMobile()) {
            search.focus();
            return;
          }
          const card = cards.current[intent.column];
          const checked = card?.querySelector?.('[role="menuitemradio"][aria-checked="true"]:not([disabled])');
          const first = [...rows.current.entries()].find(([key, node]) => key.startsWith(`${intent.column}:`) && node && !node.disabled)?.[1];
          (checked ?? first ?? triggerRef.current)?.focus?.();
          return;
        }
        const row = rows.current.get(`${intent.column}:${intent.key}`);
        (row && !row.disabled ? row : triggerRef.current)?.focus?.();
      }, [open, path, cascade, focusTick]);

      useEffect(() => {
        if (!open || typeof P.observeStickyMenuGroups !== "function") return undefined;
        const stops = cards.current.map((card) => card?.querySelector?.(".mp-groups")).filter(Boolean).map((viewport) => P.observeStickyMenuGroups(viewport));
        return () => stops.forEach((stop) => stop?.());
      }, [open, path, cascade, state.groups]);

      if (!available) return null;

      // ---------------------------------------------------------- actions

      const show = () => {
        setSelectionFocus(false);
        triggerRef.current?.focus();
        const viewport = viewportSize();
        setCascade(viewport.width >= CASCADE_MIN_WIDTH && !isMobile());
        setQueries({ providers: "", models: "" });
        setHighlight({});
        setPlaces({});
        // Nothing selected yet: the providers open at once.
        if (currentModel) setPath([]);
        else {
          focusIntent.current = { column: 1, target: "enter" };
          setPath([{ kind: "providers", opener: "provider" }]);
        }
        setOpen(true);
        reload();
      };
      const close = (restoreFocus = false) => {
        clearTimeout(hoverTimer.current);
        setOpen(false);
        setPath([]);
        if (restoreFocus) queueMicrotask(() => triggerRef.current?.focus());
      };
      const closeAfterSelection = () => {
        setSelectionFocus(true);
        close(true);
      };
      /** Open the card a row of column `column` leads to (replacing any deeper one). */
      const openChild = (column, entry, opener, via) => {
        clearTimeout(hoverTimer.current);
        setPath((before) => [...before.slice(0, column), { ...entry, opener }]);
        if (entry.kind === "providers" || entry.kind === "models") setQueries((before) => ({ ...before, [entry.kind]: "" }));
        setHighlight((before) => ({ ...before, [column + 1]: null }));
        if (via !== "hover") focusIntent.current = { column: column + 1, target: "enter" };
      };
      /** Close card `column` (and any deeper): back to the row that opened it. */
      const back = (column) => {
        if (column < 1) return;
        clearTimeout(hoverTimer.current);
        focusIntent.current = { column: column - 1, target: "opener", key: path[column - 1]?.opener };
        setPath((before) => before.slice(0, column - 1));
      };

      const settle = (result) => {
        if (result === undefined) return;
        if (result.ok) {
          if (rootRef.current !== null) closeAfterSelection();
          return;
        }
        const { error } = result;
        toastSeq.current += 1;
        setToast({ seq: toastSeq.current, text: error?.code === "session/writer-held" ? t("error.sessionInUse") : t("error.action", { message: `${error?.code ?? ""}: ${error?.message ?? ""}` }) });
      };
      const submit = (selection) => {
        lastAction.current = "select";
        setSelectionFocus(true);
        triggerRef.current?.focus();
        void Promise.resolve(select(selection)).then(settle);
      };
      const isCurrent = (provider, model) => current?.provider === provider && current?.model === model;
      const chooseModel = (provider, model) => {
        if (isCurrent(provider, model.id)) {
          closeAfterSelection();
          return;
        }
        submit({ provider, model: model.id });
      };
      const chooseEffort = (provider, model, effort) => {
        if (isCurrent(provider, model.id) && effective === effort) {
          closeAfterSelection();
          return;
        }
        submit({ provider, model: model.id, ...(effort === undefined ? {} : { reasoningEffort: effort }) });
      };

      // ---------------------------------------------------------- columns

      /** One card's content: its rows (each a leaf with `choose` or a parent with `child`), search, notes, heading. */
      const columnOf = (column) => {
        if (column === 0) {
          const effortsOf = currentModel ? effortChoices(t, currentModel.reasoning) : [];
          const modelGroup = currentGroup ?? groups[0];
          return {
            kind: "root",
            title: t("menu.aria"),
            rows: [
              { key: "provider", cell: true, label: t("menu.provider"), value: currentGroup?.provider.name ?? "—", valueClass: currentGroup ? "mp-provider-name" : undefined, child: { kind: "providers" } },
              { key: "model", cell: true, label: t("menu.model"), value: currentModel ? modelLabel(currentGroup.provider, currentModel, "menu", true) : t("menu.pickModel"), unset: !currentModel, disabled: !modelGroup, child: modelGroup ? { kind: "models", provider: modelGroup.id } : null },
              ...(effortsOf.length > 1 ? [{ key: "effort", cell: true, label: t("menu.effort"), value: effortLabel, child: { kind: "efforts", provider: current.provider, model: current.model } }] : []),
            ],
          };
        }
        const entry = path[column - 1];
        if (entry.kind === "providers") {
          const all = groups.map((group) => ({ ...group, name: group.provider.name }));
          const searchable = all.length > SEARCH_ABOVE;
          const shown = rank(all, searchable ? queries.providers.trim() : "");
          return {
            kind: "providers",
            title: t("menu.provider"),
            search: searchable ? { key: "providers", placeholder: t("search.providers") } : null,
            failures: state.failures ?? [],
            empty: shown.length === 0 ? t(all.length === 0 ? "empty.catalog" : "search.noProviders") : null,
            rows: shown.map((group) => ({
              key: group.id,
              label: group.provider.name,
              nameClass: "mp-provider-name",
              note: providerNote(t, group, memory[group.id]),
              selected: current?.provider === group.id,
              pendingHere: pending?.provider === group.id,
              child: { kind: "models", provider: group.id },
            })),
          };
        }
        if (entry.kind === "models") {
          const group = groups.find((item) => item.id === entry.provider);
          const all = group?.models ?? [];
          const searchable = all.length > SEARCH_ABOVE;
          const shown = rank(all, searchable ? queries.models.trim() : "");
          return {
            kind: "models",
            title: group?.provider.name ?? "",
            heading: group?.provider.name,
            providerHeading: Boolean(group),
            search: searchable ? { key: "models", placeholder: t("search.models") } : null,
            empty: shown.length === 0 ? t(all.length === 0 ? "empty.models" : "search.noModels") : null,
            rows: shown.map((model) => {
              const selected = isCurrent(entry.provider, model.id);
              return {
                key: model.id,
                label: modelLabel(group.provider, model, "option", selected),
                title: model.name,
                selected,
                pendingHere: pending?.provider === entry.provider && pending?.model === model.id,
                ...(hasLevels(t, model) ? { child: { kind: "efforts", provider: entry.provider, model: model.id } } : { choose: () => chooseModel(entry.provider, model) }),
              };
            }),
          };
        }
        const group = groups.find((item) => item.id === entry.provider);
        const model = group?.models?.find((item) => item.id === entry.model);
        const choices = effortChoices(t, model?.reasoning);
        const here = isCurrent(entry.provider, entry.model);
        const fallback = model?.reasoning?.defaultEffort;
        return {
          kind: "efforts",
          title: t("effort.title", { model: model?.name ?? entry.model }),
          heading: model?.name,
          empty: choices.length === 0 ? t("empty.efforts") : null,
          rows: choices.map((level) => ({
            key: level.key,
            label: level.label,
            selected: here && effective === level.effort,
            // A model not in use yet: its default level is marked as such, nothing is checked.
            tail: !here && fallback === level.effort ? t("effort.defaultNote") : null,
            pendingHere: pending !== null && pending.provider === entry.provider && pending.model === entry.model && pending.reasoningEffort === level.effort,
            choose: () => chooseEffort(entry.provider, model, level.effort),
          })),
        };
      };

      // The model's name as the label slot draws it (another plugin's contribution), else with its catalog badge.
      function modelLabel(provider, model, placement, selected) {
        const badge = model.badge ? h(P.Tag ?? "span", { className: "mp-badge", tone: model.badge.tone }, resolveText(model.badge.text)) : null;
        const fallback = badge === null ? model.name : h("span", { className: "mp-badged" },
          placement === "trigger" ? h(React.Fragment, null, badge, " ") : null,
          h("span", { className: "mp-badged-text" }, model.name),
          placement === "trigger" ? null : h(React.Fragment, null, " ", badge));
        return h("span", { "data-provider-id": provider.id, "data-model-id": model.id },
          typeof renderSlot === "function" ? renderSlot("conversation.input.model.label", { provider, model, placement, selected }, { fallback }) : fallback);
      }

      const columns = Array.from({ length: columnsCount }, (_, column) => columnOf(column));
      const deepest = columnsCount - 1;
      const searchOf = (column) => columns[column]?.search ?? null;
      const activeIndex = (column) => {
        const list = columns[column]?.rows ?? [];
        if (list.length === 0) return -1;
        const chosen = highlight[column];
        if (typeof chosen === "number") return Math.min(chosen, list.length - 1);
        const selected = list.findIndex((row) => row.selected);
        return selected >= 0 ? selected : 0;
      };
      /** The column holding the focus (a card's row or search), else the deepest. */
      const focusedColumn = () => {
        const focused = activeElement();
        if (focused) {
          for (const [key, node] of rows.current) if (node === focused) return Number(key.split(":")[0]);
          const at = searches.current.findIndex((node) => node === focused);
          if (at >= 0) return at;
          // An option's own control (a switch) inside a card.
          const inCard = cards.current.findIndex((card) => card?.contains?.(focused) === true);
          if (inCard >= 0) return inCard;
        }
        return deepest;
      };

      // ---------------------------------------------------------- pointer and keys

      const hoverRow = (column, row) => {
        clearTimeout(hoverTimer.current);
        if (!cascade || busy || row.disabled) return;
        const child = path[column];
        if (row.child) {
          if (child && child.opener === row.key) return;
          hoverTimer.current = setTimeout(() => openChild(column, row.child, row.key, "hover"), child ? HOVER_SWITCH_MS : HOVER_OPEN_MS);
        } else if (child) {
          hoverTimer.current = setTimeout(() => setPath((before) => before.slice(0, column)), HOVER_SWITCH_MS);
        }
      };
      const activate = (column, row, via = "click") => {
        if (row.disabled || busy) return;
        if (row.child) {
          const child = path[column];
          if (via === "click" && child && child.opener === row.key && cascade) {
            // A click on the row whose card is open moves into that card.
            focusIntent.current = { column: column + 1, target: "enter" };
            setFocusTick((tick) => tick + 1);
            return;
          }
          openChild(column, row.child, row.key, via);
          return;
        }
        row.choose?.();
      };

      const moveFocus = (column, offset) => {
        const card = cards.current[column];
        const list = typeof card?.querySelectorAll === "function"
          ? Array.from(card.querySelectorAll(FOCUSABLE_ROWS))
          : [...rows.current.entries()].filter(([key, node]) => key.startsWith(`${column}:`) && node && !node.disabled).map(([, node]) => node);
        if (list.length === 0) return;
        const at = list.findIndex((node) => node === activeElement());
        const next = at === -1 ? (offset > 0 ? 0 : list.length - 1) : (at + offset + list.length) % list.length;
        list[next]?.focus();
      };

      const onKeyDown = (event) => {
        if (event.nativeEvent?.isComposing) return;
        if (!open) return;
        const column = focusedColumn();
        const inSearch = isInput(event.target);
        const searching = Boolean(searchOf(column));
        if (event.key === "Escape" || (event.key === "Tab" && event.shiftKey)) {
          event.preventDefault();
          if (deepest > 0 && (currentModel || deepest > 1)) back(deepest);
          else close(true);
          return;
        }
        if (event.key === "ArrowLeft" && !inSearch) {
          event.preventDefault();
          if (column > 0 && (currentModel || column > 1)) back(column);
          return;
        }
        if (event.key === "ArrowRight" && !inSearch) {
          const row = (columns[column]?.rows ?? []).find((item) => rows.current.get(`${column}:${item.key}`) === activeElement());
          if (row?.child) {
            event.preventDefault();
            activate(column, row, "key");
          }
          return;
        }
        if ((event.key === "ArrowDown" || event.key === "ArrowUp") && searching && inSearch) {
          event.preventDefault();
          const list = columns[column].rows;
          if (!busy && list.length > 0) {
            const direction = event.key === "ArrowDown" ? 1 : -1;
            setHighlight((before) => ({ ...before, [column]: (activeIndex(column) + direction + list.length) % list.length }));
          }
          return;
        }
        if ((event.key === "Enter" || (event.key === "Tab" && !event.shiftKey)) && searching && inSearch) {
          const list = columns[column].rows;
          if (event.key === "Tab" && list.length === 0) return;
          event.preventDefault();
          const row = list[activeIndex(column)];
          if (row) activate(column, row, "key");
          return;
        }
        if (event.key === "Tab") {
          event.preventDefault();
          const focused = activeElement();
          for (const [, node] of rows.current) {
            if (node === focused) {
              node.click();
              return;
            }
          }
          focusIntent.current = { column: deepest, target: "enter" };
          setFocusTick((tick) => tick + 1);
          return;
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          moveFocus(column, event.key === "ArrowDown" ? 1 : -1);
        }
      };
      const onBlur = (event) => {
        const next = event.relatedTarget;
        if (next && (rootRef.current?.contains(next) === true || cards.current.some((card) => card?.contains(next) === true))) return;
        close();
      };

      // ---------------------------------------------------------- rendering

      const waiting = !currentModel && state.status === "loading";
      const nameText = waiting ? t("trigger.loading") : currentModel?.name ?? t("trigger.fallback");
      const providerText = currentGroup?.provider.name ?? "";
      const triggerTitle = currentModel ? [providerText, currentModel.name, effortLabel].filter(Boolean).join(" · ") : nameText;
      const triggerAria = waiting ? t("trigger.loading")
        : !currentModel ? t("trigger.selectAria")
          : effortLabel === undefined ? t("trigger.aria", { model: nameText, provider: providerText })
            : t("trigger.ariaEffort", { model: nameText, provider: providerText, effort: effortLabel });

      rows.current = new Map();
      const rowRef = (column, key) => (node) => {
        if (node) rows.current.set(`${column}:${key}`, node);
      };

      const searchRow = (column, search) => {
        const value = queries[search.key];
        const index = activeIndex(column);
        return h("div", { className: "mp-search-row" },
          h(P.Input, {
            ref: (node) => {
              searches.current[column] = node;
            },
            className: cls("mp-search", value !== "" && "mp-search-query"),
            type: "text",
            role: "searchbox",
            "aria-label": search.placeholder,
            "aria-controls": `${id}-list-${column}`,
            "aria-activedescendant": index < 0 ? undefined : `${id}-row-${column}-${index}`,
            placeholder: search.placeholder,
            value,
            readOnly: busy,
            onChange: (event) => {
              const next = event.target.value;
              setQueries((before) => ({ ...before, [search.key]: next }));
              setHighlight((before) => ({ ...before, [column]: 0 }));
              // A changed list closes the card a row of it had opened.
              setPath((before) => before.slice(0, column));
            },
          }),
          value !== "" ? h("button", { type: "button", className: "mp-search-clear", "aria-label": t("search.clear"), disabled: busy, onClick: () => {
            setQueries((before) => ({ ...before, [search.key]: "" }));
            setHighlight((before) => ({ ...before, [column]: 0 }));
            searches.current[column]?.focus();
          } }, h(IconClose)) : null);
      };

      const rowNode = (column, row, index, searching) => {
        const expanded = Boolean(row.child) && path[column]?.opener === row.key;
        if (row.cell) {
          return h("button", {
            key: row.key,
            ref: rowRef(column, row.key),
            type: "button",
            role: "menuitem",
            className: "mp-cell",
            "aria-haspopup": "menu",
            "aria-expanded": expanded,
            disabled: row.disabled || busy,
            onMouseEnter: () => hoverRow(column, row),
            onClick: () => activate(column, row),
          },
          h("span", { className: "mp-cell-label" }, row.label),
          h("span", { className: cls("mp-cell-value", row.valueClass), "data-unset": row.unset ? "" : undefined }, row.value),
          h(IconChevronRight, { className: "mp-row-chevron" }));
        }
        const active = searching && index === activeIndex(column);
        return h("button", {
          key: row.key,
          ref: rowRef(column, row.key),
          id: `${id}-row-${column}-${index}`,
          type: "button",
          role: row.child ? "menuitem" : "menuitemradio",
          "aria-haspopup": row.child ? "menu" : undefined,
          "aria-expanded": row.child ? expanded : undefined,
          "aria-checked": row.child ? undefined : row.selected,
          "data-selected": row.selected ? "" : undefined,
          tabIndex: searching ? -1 : 0,
          className: cls("mp-option", active && "mp-option-active"),
          title: row.title ?? (typeof row.label === "string" ? row.label : undefined),
          disabled: busy || row.disabled,
          onMouseEnter: () => hoverRow(column, row),
          onMouseMove: searching && !active && !busy ? () => setHighlight((before) => ({ ...before, [column]: index })) : undefined,
          onClick: () => activate(column, row),
        },
        h("span", { className: "mp-option-copy" },
          h("span", { className: cls("mp-name", row.nameClass) }, row.label),
          row.note ? h("span", { className: "mp-note" }, row.note) : null),
        row.tail ? h("span", { className: "mp-tail-note" }, row.tail) : null,
        h("span", { className: "mp-check" }, row.pendingHere ? h(Spinner) : row.selected ? h(IconCheck) : null),
        row.child ? h(IconChevronRight, { className: "mp-row-chevron" }) : null);
      };

      /** What an option under the root rows gets from the menu (DSH's `conversation.input.model.options` owner). */
      const optionsOwner = {
        locked: locked || busy,
        // Synchronous, so the option can open its own overlay with the focus back on the trigger.
        dismiss: () => {
          close();
          triggerRef.current?.focus();
        },
        reportFailure: (message) => {
          toastSeq.current += 1;
          setToast({ seq: toastSeq.current, text: String(message) });
        },
      };

      const cardBody = (column, view) => {
        const searching = Boolean(view.search);
        const list = view.rows.map((row, index) => rowNode(column, row, index, searching));
        return [
          // One card at a time: a row back to the card before, named after it (the root needs no name).
          !cascade && column > 0 ? h("button", { key: "back", type: "button", className: "mp-back", onClick: () => back(column) },
            h(IconChevronLeft, { className: "mp-row-chevron" }), h("span", null, t("menu.back")), column > 1 ? h("span", { className: "mp-back-title" }, columns[column - 1].title) : null) : null,
          view.search ? h(React.Fragment, { key: "search" }, searchRow(column, view.search)) : null,
          view.kind === "providers" && state.status === "loading" ? h("div", { key: "loading", className: "mp-status" }, t("status.loading")) : null,
          view.kind === "providers" && state.error && lastAction.current === "load"
            ? h("div", { key: "error", className: "mp-error" }, h("span", null, t("error.action", { message: state.error })), h("button", { type: "button", className: "mp-retry", onClick: reload }, t("action.reload")))
            : null,
          ...(view.failures ?? []).map((failure) => h("div", { key: `failure:${failure.id}`, className: "mp-warning" },
            h("span", null, t("warning.groupLoad", { name: failure.id === "deepseek-account" ? t("provider.account") : failure.name, message: failure.message })),
            h("button", { type: "button", className: "mp-retry", onClick: reload }, t("action.reload")))),
          view.kind === "root"
            ? h(React.Fragment, { key: "rows" }, list,
              // Pointing at an option closes a card a root row had opened, as a row without one does.
              typeof renderSlot === "function" ? h("div", { key: "options", className: "mp-options", onMouseEnter: () => hoverRow(0, { key: "options" }) },
                renderSlot("conversation.input.model.options", optionsOwner)) : null)
            : h("div", { key: "list", id: `${id}-list-${column}`, className: "mp-groups scrollable", role: "menu", "aria-label": view.title, "data-provider": view.providerHeading ? "" : undefined, hidden: view.rows.length === 0 },
              view.heading ? h(P.MenuGroup, { label: view.heading }, list) : list),
          view.empty && view.kind !== "root" && (state.status !== "loading" || view.rows.length === 0) ? h("div", { key: "empty", className: "mp-empty", role: "status" }, view.empty) : null,
        ];
      };

      const card = (column, view, style) => h(P.MenuSurface, {
        key: `card-${column}`,
        ref: (node) => {
          cards.current[column] = node;
          // The anchored card: the root one side by side, the only one when the cards show one at a time.
          if (column === 0 || !cascade) anchorCard.current = node;
        },
        id: column === 0 ? `${id}-menu` : `${id}-menu-${column}`,
        className: cls("mp-menu", column > 0 && cascade && "mp-side", (column === 0 || !cascade) && anchored && "mp-anchored"),
        style,
        role: view.kind === "root" || view.kind === "efforts" ? "menu" : "group",
        "aria-label": view.title,
        "aria-busy": state.status === "loading" || busy,
        onMouseEnter: column > 0 ? () => clearTimeout(hoverTimer.current) : undefined,
        "data-column": column,
      }, cardBody(column, view));

      cards.current = [];
      searches.current.length = columnsCount;
      const anchoredStyle = anchored ? anchorStyle : { ...anchorStyle, ...(fallbackPos ?? MEASURE_STYLE) };
      const deck = !open ? null : cascade
        ? columns.map((view, column) => card(column, view, column === 0 ? anchoredStyle : places[column] ?? MEASURE_STYLE))
        : [card(deepest, columns[deepest], anchoredStyle)];

      return h("div", {
        ref: rootRef,
        className: "mp-root",
        onKeyDown,
        onBlur,
        onMouseDown: (event) => {
          // WebKit blurs a focused row before its click unless the button's mousedown keeps focus.
          if (typeof Element !== "undefined" && event.target instanceof Element && event.target.closest("button") !== null) event.preventDefault();
        },
      },
      h("button", {
        ref: triggerRef,
        type: "button",
        className: "mp-trigger",
        style: anchorStyle,
        "aria-label": triggerAria,
        "aria-haspopup": "menu",
        "aria-expanded": open,
        "aria-controls": open ? `${id}-menu` : undefined,
        title: triggerTitle,
        "aria-busy": busy,
        "data-selection-focus": selectionFocus ? "" : undefined,
        onBlur: () => setSelectionFocus(false),
        disabled: locked,
        onClick: () => (open ? close(true) : show()),
      },
      h(IconData, { className: "mp-trigger-icon", size: 16 }),
      h("span", { className: "mp-trigger-label" }, currentModel ? modelLabel(currentGroup.provider, currentModel, "trigger", true) : nameText),
      effortLabel !== undefined ? h("span", { className: "mp-trigger-effort" }, effortLabel) : null,
      busy ? h(Spinner) : h(IconChevronDown, { className: cls("mp-chevron", open && "mp-chevron-open") })),
      deck ? ReactDOM.createPortal(h(React.Fragment, null, deck), typeof document === "undefined" ? null : document.body) : null,
      toast !== null && typeof P.Toast === "function" ? h(P.Toast, {
        key: toast.seq,
        text: toast.text,
        icon: h(IconWarning),
        anchor: rootRef.current?.closest?.("[data-composer-card]") ?? null,
        onDone: () => setToast(null),
      }) : null);
    }

    // ------------------------------------------------------------ registration

    function installLocale(ctx) {
      const locale = ctx.locale;
      if (locale === undefined || typeof locale.register !== "function") return;
      try {
        if (typeof locale.bind === "function" && locale.bind(NS)("menu.back") !== "menu.back") return;
      } catch {
        /* an unreadable locale face is not a reason to skip the registration */
      }
      try {
        ctx.effect(() => locale.register(NS, DICTS), "dsh-model-picker: locale namespace");
      } catch (error) {
        console.warn("dsh-model-picker: locale namespace already registered; reusing it", error);
      }
    }

    function apply(ctx) {
      const slots = ctx.slots;
      const directories = (typeof ctx.get === "function" ? ctx.get("modelDirectories") : undefined) ?? ctx.modelDirectories;
      // Without DSH's directory service or the primitives this seat draws with, DSH's own selector stays.
      if (slots === undefined || !directories || typeof directories.directoryFor !== "function" || !primitivesReady()) {
        console.warn("dsh-model-picker: DeepSeek Harness's model directory or UI primitives are unavailable; its own model selector stays");
        return;
      }
      installLocale(ctx);
      ctx.effect(() => installStyle(), "dsh-model-picker: stylesheet");
      const sessions = (typeof ctx.get === "function" ? ctx.get("sessions") : undefined) ?? ctx.sessions;
      const lastUsed = lastUsedStore(browserStorage());
      clearRetired(browserStorage());
      const resolveText = (text) => {
        if (typeof ctx.locale?.resolveText === "function") return ctx.locale.resolveText(text);
        return typeof text === "string" ? text : text?.en ?? Object.values(text ?? {})[0] ?? "";
      };
      ctx.effect(() => slots.inject("conversation.input.model", () => slots.register({
        name: "conversation.input.model",
        priority: SEAT_PRIORITY,
        locale: NS,
        children: {
          "conversation.input.model.label": { kind: "single", scope: "session", inline: true },
          // DSH 0.2.2-rc.2: session options under the model and reasoning rows (the Agent Teams switch).
          "conversation.input.model.options": { kind: "list", scope: "session" },
        },
        inject: (sessionId) => {
          const directory = directories.directoryFor(sessionId);
          // An addressed subagent session has no model of its own to choose.
          const available = typeof sessions?.subagentAddress === "function" ? sessions.subagentAddress(sessionId) === undefined : true;
          return {
            available,
            directory: directory.store,
            load: () => {
              if (available) Promise.resolve(directory.load()).catch(() => { /* surfaced on the store */ });
            },
            select: (selection) => (available ? directory.select(selection) : Promise.resolve(undefined)),
            resolveText,
            lastUsed,
          };
        },
      }, ProviderModelSelect)), "dsh-model-picker: composer model seat");
    }

    exports.name = "dsh-model-picker";
    exports.apply = apply;
    exports.inject = ["slots", "locale", "sessions", "modelDirectories"];
    /** Pure helpers and the seat, exposed for the self-test only. */
    exports.__internals = Object.freeze({ orderProviders, providerName, rank, effortChoices, hasLevels, effortLabelOf, providerNote, lastUsedStore, clearRetired, placeBeside, placeAbove, anchorsSupported, primitivesReady, ProviderModelSelect, DICTS, CSS, SEAT_PRIORITY, LAST_KEY, RETIRED_KEYS, CASCADE_MIN_WIDTH });
    return module.exports;
  },
});
