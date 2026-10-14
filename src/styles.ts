export const styles = `
.dp-launcher,.dp-app,.dp-new { --dp-ink:var(--lumiverse-text,#edeaf4); --dp-muted:var(--lumiverse-text-muted,#a9a4b5); --dp-fill:var(--lumiverse-bg,#211d2b); --dp-surface:var(--lumiverse-fill-subtle,#2b2637); --dp-border:var(--lumiverse-border,rgba(180,170,210,.19)); --dp-accent:var(--lumiverse-primary,#a699e9); color:var(--dp-ink); font:13px/1.45 system-ui,-apple-system,BlinkMacSystemFont,sans-serif; box-sizing:border-box }
.dp-launcher *,.dp-app *,.dp-new * { box-sizing:border-box }
.dp-app [hidden],.dp-launcher [hidden],.dp-new [hidden] { display:none!important }
.dp-app :where(button[data-action],button[data-tool],button[data-color],button[data-layer],button[data-toggle-layer],button[data-color-close],button[data-color-mode],.dp-open-card,.dp-delete-card),.dp-launcher button,.dp-new button[data-new] { font:inherit; cursor:pointer; color:inherit; touch-action:manipulation; border:1px solid var(--dp-border); border-radius:9px; background:var(--dp-surface); display:inline-flex; align-items:center; justify-content:center; gap:7px; min-height:38px; padding:8px 11px; transition:background .15s,border-color .15s }
.dp-app :where(button[data-action],button[data-tool],button[data-color],button[data-layer],button[data-toggle-layer],button[data-color-close],.dp-open-card,.dp-delete-card):hover,.dp-launcher button:hover,.dp-new button[data-new]:hover { border-color:var(--dp-accent); background:color-mix(in srgb,var(--dp-accent) 12%,var(--dp-surface)) }
.dp-app button[data-action]:disabled,.dp-new button[data-new]:disabled { opacity:.4; cursor:default }
.dp-app :where(button[data-action],button[data-tool],button[data-color],button[data-layer],button[data-toggle-layer],button[data-color-close],button[data-color-mode],.dp-open-card,.dp-delete-card,[data-setting],.dp-color-picker input,.dp-color-pad,.dp-color-wheel,.dp-panel-heading):focus-visible,.dp-launcher button:focus-visible,.dp-new button[data-new]:focus-visible { outline:2px solid var(--dp-accent); outline-offset:2px }
.dp-app .dp-primary,.dp-launcher .dp-primary,.dp-new button[data-new].dp-primary { background:var(--dp-accent); color:#171221; border-color:transparent; font-weight:650 }
.dp-app .dp-icon-button { width:36px; padding:6px; min-height:34px }
.dp-launcher { padding:18px; display:flex; flex-direction:column; gap:16px }
.dp-launcher-heading h2 { font-size:19px;letter-spacing:-.4px;margin:0 0 4px;font-weight:650 }
.dp-launcher-heading p { color:var(--dp-muted);margin:0;font-size:12px }
.dp-launcher-actions,.dp-row { display:flex;align-items:center;gap:8px;flex-wrap:wrap }
.dp-launcher-actions button { flex:1 1 auto;white-space:nowrap }
.dp-recent-heading { display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:4px }
.dp-recent-heading h3 { font-size:12px;font-weight:600;color:var(--dp-muted);margin:0 }
.dp-recent-heading button { min-height:30px;width:30px;padding:6px;border-color:transparent;background:transparent }
.dp-recent-heading svg { width:16px;height:16px }
.dp-launcher-status { margin:0;color:var(--dp-muted);font-size:11px;line-height:1.6 }
.dp-gallery { display:flex;flex-direction:column;gap:8px;height:min(520px,calc(var(--app-scaled-viewport-height,100dvh) - 230px));min-height:200px }
.dp-gallery-heading { display:flex;gap:12px;align-items:center;min-height:18px;flex-shrink:0;color:var(--dp-muted);font-size:11px }
.dp-gallery-heading .dp-gallery-retry { min-height:25px;padding:3px 8px;font-size:11px }
.dp-gallery-scroll { flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;overflow-anchor:none;scrollbar-gutter:stable;position:relative;outline-offset:2px }
.dp-gallery-scroll:focus-visible { outline:2px solid var(--dp-accent) }
.dp-gallery-spacer { position:relative;min-height:100px }
.dp-gallery-window { position:absolute;left:0;right:0;top:0;display:grid;gap:12px;align-items:start }
.dp-card { min-width:0;height:172px;border:1px solid var(--dp-border);border-radius:13px;overflow:hidden;background:var(--dp-surface);position:relative }
.dp-card-placeholder { display:grid;place-items:center;color:var(--dp-muted);font-size:11px }
.dp-card .dp-open-card { border:0;background:none;border-radius:0;padding:0;width:100%;display:block;text-align:left;min-height:0 }
.dp-card-preview { position:relative;width:100%;height:115px;display:grid;place-items:center;background:var(--dp-fill) }
.dp-card img { width:100%;height:115px;object-fit:contain;display:block;background:repeating-conic-gradient(#f4f2f5 0% 25%,#e4e1e7 0% 50%) 50%/14px 14px }
.dp-preview-placeholder { color:var(--dp-muted);font-size:11px }
.dp-card .dp-retry-preview { position:absolute;left:5px;top:78px;font-size:10px;padding:3px 6px;min-height:25px }
.dp-card-title { display:block;padding:10px 10px 2px;font-weight:600;overflow:hidden;white-space:nowrap;text-overflow:ellipsis }
.dp-card-date { display:block;color:var(--dp-muted);font-size:10px;padding:0 10px 10px }
.dp-card .dp-delete-card { position:absolute;right:5px;top:5px;background:#251f32;color:#fff;min-height:28px;width:28px;padding:5px;border-radius:7px }
.dp-card .dp-delete-card svg { width:15px;height:15px }
.dp-empty { padding:24px;color:var(--dp-muted);text-align:center;border:1px dashed var(--dp-border);border-radius:12px;grid-column:1/-1 }
.dp-workspace-root { position:fixed;top:0;left:0;width:var(--app-scaled-viewport-width,calc(100vw / var(--lumiverse-ui-scale,1)));height:var(--app-scaled-viewport-height,calc(100dvh / var(--lumiverse-ui-scale,1)));padding:0;margin:0;z-index:1;container-type:inline-size;container-name:dp-workspace }
.dp-app { height:100%;min-height:0;display:flex;flex-direction:column;gap:0;padding:var(--app-interactive-safe-top,env(safe-area-inset-top,0px)) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);position:relative;overflow:hidden;background:var(--dp-fill) }
.dp-topbar { display:flex;gap:10px;align-items:center;min-height:58px;padding:10px 104px 10px 12px;border-bottom:1px solid var(--dp-border);flex-wrap:wrap;flex-shrink:0 }
.dp-app .dp-close { position:absolute;right:calc(12px + env(safe-area-inset-right,0px));top:calc(10px + var(--app-interactive-safe-top,env(safe-area-inset-top,0px)));z-index:20;min-height:38px;background:var(--dp-fill) }
.dp-close svg { width:17px;height:17px }
.dp-workspace-controls { position:absolute;right:calc(103px + env(safe-area-inset-right,0px));top:calc(10px + var(--app-interactive-safe-top,env(safe-area-inset-top,0px)));z-index:7 }
.dp-workspace-controls button { background:var(--dp-fill) }
.dp-title-slot { flex:1;min-width:130px;max-width:300px }
.dp-title-slot input { font-weight:600!important;min-height:34px!important;width:100% }
.dp-page-size { display:block;color:var(--dp-muted);font-size:9px;margin:3px 0 0 8px;font-variant-numeric:tabular-nums }
.dp-save-state { font-size:10px;color:var(--dp-muted);display:flex;align-items:center;gap:5px;margin-right:auto }
.dp-save-state::before { content:'';width:5px;height:5px;background:#6dd3ac;border-radius:50% }
.dp-save-state[data-state=error]::before { background:#ee9e83 }
.dp-save-state[data-state=pending]::before,.dp-save-state[data-state=saving]::before { background:var(--dp-accent) }
.dp-main { display:flex;flex:1;min-height:0;position:relative;overflow:hidden }
.dp-tools { display:flex;flex-direction:column;gap:7px;padding:12px 7px;background:var(--dp-fill);border-right:1px solid var(--dp-border);width:54px;flex:none;z-index:2;overflow-y:auto }
.dp-tools button { flex-shrink:0 }
.dp-tools button { min-height:38px;width:38px;padding:8px;background:transparent;border-color:transparent }
.dp-tools button[aria-pressed=true] { color:var(--dp-accent);background:color-mix(in srgb,var(--dp-accent) 15%,transparent);border-color:color-mix(in srgb,var(--dp-accent) 45%,transparent) }
.dp-tool-divider { width:24px;border-top:1px solid var(--dp-border);margin:3px auto }
.dp-viewport { flex:1;min-width:0;overflow:hidden;position:relative;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;background:#191720;background-image:radial-gradient(#34313c .8px,transparent .8px);background-size:16px 16px;cursor:crosshair;overscroll-behavior:contain;outline:none }
.dp-sheet { position:absolute;left:0;top:0;transform-origin:0 0;box-shadow:0 8px 45px #0008;background:repeating-conic-gradient(#f7f5f8 0% 25%,#e6e3ea 0% 50%) 50%/20px 20px;pointer-events:none }
.dp-sheet canvas { display:block;width:100%;height:100% }
.dp-cursor { position:absolute;left:0;top:0;pointer-events:none;border:1px solid #fff;border-radius:50%;box-shadow:0 0 0 1px #1118;z-index:3 }
.dp-zoom { position:absolute;bottom:12px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:2px;border:1px solid #514959;border-radius:10px;padding:3px;background:#28232fde;backdrop-filter:blur(10px);color:#ded8e8;z-index:4 }
.dp-zoom button { min-height:29px;width:29px;border:0;background:transparent;padding:5px }
.dp-zoom button svg { width:16px;height:16px }
.dp-zoom-value { font-variant-numeric:tabular-nums;min-width:39px;text-align:center;font-size:10px }
.dp-zoom .dp-rotation-value { width:auto;min-width:34px;padding:5px;font-size:10px;font-variant-numeric:tabular-nums }
.dp-zoom-divider { height:17px;border-left:1px solid #514959;margin:0 3px }
.dp-canvas-fullscreen > .dp-topbar,.dp-canvas-fullscreen > .dp-properties,.dp-canvas-fullscreen > .dp-preferences,.dp-canvas-fullscreen > .dp-share-row,.dp-canvas-fullscreen > .dp-notice { display:none }
.dp-canvas-fullscreen .dp-tools { position:absolute;left:12px;top:12px;bottom:auto;max-height:calc(100% - 24px);border:1px solid var(--dp-border);border-radius:12px;box-shadow:0 4px 20px #0005 }
.dp-canvas-toast { position:absolute;left:80px;right:12px;bottom:108px;z-index:8;padding:10px 14px;border:1px solid var(--dp-border);border-radius:10px;background:var(--dp-fill);color:var(--dp-muted);width:fit-content;max-width:calc(100% - 92px);box-shadow:0 4px 20px #0005;pointer-events:none }
.dp-canvas-toast[data-error=true] { color:#ffc0ae }
.dp-floating-panel { position:absolute;top:76px;max-width:calc(100% - 16px);overflow:auto;overscroll-behavior:contain;border:1px solid var(--dp-border);border-radius:16px;background:var(--dp-fill);box-shadow:0 10px 40px #0007;z-index:9;scrollbar-width:thin }
.dp-panel-heading { display:flex;align-items:center;gap:5px;position:sticky;top:0;background:var(--dp-fill);z-index:2;padding:18px 12px 10px;margin:0;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none }
.dp-panel-heading:active { cursor:grabbing }
.dp-panel-heading::before { content:'';position:absolute;top:7px;left:calc(50% - 16px);width:32px;height:3px;border-radius:3px;background:var(--dp-muted);opacity:.45 }
.dp-panel-heading strong { flex:1;font-size:14px;font-weight:650;letter-spacing:-.2px }
.dp-layers { width:244px;right:12px;padding:0 12px 12px }
.dp-layer-heading { margin:0 -12px 8px }
.dp-layer-list { display:flex;flex-direction:column;gap:6px }
.dp-layer { display:flex;gap:3px;align-items:center;border:1px solid var(--dp-border);border-radius:8px;padding:3px }
.dp-layer[data-active=true] { border-color:var(--dp-accent);background:color-mix(in srgb,var(--dp-accent) 10%,transparent) }
.dp-layer .dp-layer-select { flex:1;justify-content:flex-start;border:0;background:none;padding:5px 3px;min-height:31px;overflow:hidden;font-size:11px }
.dp-layer .dp-layer-eye { border:0;background:none;min-height:27px;width:27px;padding:5px }
.dp-layer .dp-layer-eye svg { width:16px;height:16px }
.dp-layer-options { display:grid;gap:9px;margin-top:13px;font-size:11px;color:var(--dp-muted) }
.dp-layer-actions { display:flex;gap:5px }
.dp-layer-options input { width:100% }
.dp-properties { border-top:1px solid var(--dp-border);display:flex;align-items:center;gap:15px;padding:10px 12px;flex-wrap:wrap;background:var(--dp-fill);position:relative }
.dp-slider { display:flex;align-items:center;gap:6px;min-width:130px;flex:1;max-width:180px;font-size:10px;color:var(--dp-muted) }
.dp-slider input { width:100%;min-width:55px;accent-color:var(--dp-accent) }
.dp-slider output { min-width:30px;font-variant-numeric:tabular-nums;color:var(--dp-ink) }
.dp-colors { display:flex;align-items:center;gap:5px;flex-shrink:0 }
.dp-colors .dp-swatch { width:23px;height:23px;min-height:23px;border-radius:50%;padding:0;border:2px solid transparent;background:var(--swatch) }
.dp-colors .dp-swatch[aria-pressed=true] { outline:2px solid var(--dp-accent);outline-offset:2px }
.dp-colors .dp-color-trigger { min-height:32px;padding:5px 8px;margin-right:5px;font-size:11px }
.dp-current-color,.dp-color-preview { display:block;width:18px;height:18px;border-radius:50%;border:1px solid #ffffff60;flex-shrink:0 }
.dp-color-picker { left:64px;width:300px;padding:0 14px 14px;display:grid;gap:12px }
.dp-color-picker[data-floating=true],.dp-canvas-fullscreen .dp-color-picker { width:248px;gap:10px }
.dp-color-heading { margin:0 -14px }
.dp-color-heading button { min-height:28px;width:28px;padding:5px;border:0;background:transparent }
.dp-color-heading svg { width:16px;height:16px }
.dp-color-modes { display:flex;gap:4px;background:var(--dp-surface);padding:3px;border-radius:9px }
.dp-color-modes button { flex:1;min-height:28px;font-size:11px;padding:4px 8px;border:0;background:transparent }
.dp-color-modes button[aria-pressed=true] { color:var(--dp-accent);background:var(--dp-fill);box-shadow:0 1px 4px #0003 }
.dp-disc-controls,.dp-classic-controls { display:grid;gap:12px }
.dp-color-wheel { position:relative;width:calc(100% - 18px);aspect-ratio:1;justify-self:center;border-radius:50%;touch-action:none;cursor:crosshair;background:#000 }
.dp-wheel-spectrum { position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle,#fff,transparent 70.71%),conic-gradient(from 90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00);pointer-events:none }
.dp-wheel-point { position:absolute;width:16px;height:16px;border:2px solid #fff;box-shadow:0 0 0 1px #0008;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none }
.dp-brightness { width:100%;margin:0;accent-color:var(--dp-accent) }
.dp-selection { position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none }
.dp-selection path { fill:none;vector-effect:non-scaling-stroke;stroke-width:1.5 }
.dp-selection-base { stroke:#fff }
.dp-selection-ants { stroke:#222;stroke-dasharray:5 5;animation:dp-marching 1s linear infinite }
@keyframes dp-marching { to { stroke-dashoffset:-10 } }
.dp-selection-toolbar { position:absolute;bottom:58px;left:50%;transform:translateX(-50%);z-index:4;display:flex;gap:6px;align-items:center;padding:5px 8px;border-radius:11px;border:1px solid var(--dp-border);background:var(--dp-fill);box-shadow:0 4px 20px #0005;white-space:nowrap }
.dp-selection-toolbar span { color:var(--dp-muted);font-size:10px;margin-right:4px }
.dp-selection-toolbar button { min-height:30px;padding:4px 9px;font-size:11px }
.dp-selection-toolbar [data-action=selection-done] { color:var(--dp-accent) }
.dp-color-pad { position:relative;aspect-ratio:1.5;border-radius:6px;background:linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,transparent),var(--dp-hue-color,#ff0000);touch-action:none;cursor:crosshair;flex-shrink:0 }
.dp-color-point { position:absolute;width:13px;height:13px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 1px #0008;transform:translate(-50%,-50%);pointer-events:none }
.dp-hue-label { display:grid;gap:6px;font-size:11px;color:var(--dp-muted) }
.dp-hue { appearance:none;-webkit-appearance:none;margin:0;width:100%;height:16px;border-radius:9px;border:0;background:linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00);cursor:pointer;touch-action:pan-y }
.dp-hue::-webkit-slider-thumb { appearance:none;width:18px;height:18px;border:2px solid #fff;border-radius:50%;background:transparent;box-shadow:0 0 0 1px #0008 }
.dp-hue::-moz-range-thumb { width:14px;height:14px;border:2px solid #fff;border-radius:50%;background:transparent;box-shadow:0 0 0 1px #0008 }
.dp-hex-label { display:flex;align-items:center;gap:9px;font-size:11px;color:var(--dp-muted) }
.dp-hex { width:100%;min-width:0;font:12px ui-monospace,monospace;padding:8px;color:var(--dp-ink);background:var(--dp-surface);border:1px solid var(--dp-border);border-radius:7px }
.dp-color-picker small { color:var(--dp-muted);font-size:10px;line-height:1.5 }
.dp-color-error { color:#ffc0ae;font-size:10px;margin:0 }
.dp-color-bank { display:grid;gap:8px;border-top:1px solid var(--dp-border);padding-top:10px }
.dp-palette-heading { display:flex;align-items:center;justify-content:space-between;gap:10px }
.dp-palette-heading strong { font-size:11px;font-weight:600 }
.dp-color-picker .dp-palette-heading small { font-size:9px }
.dp-color-picker button[data-action=manage-colors] { min-height:25px;padding:3px 7px;background:transparent;font-size:10px }
.dp-palette-grid { display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:7px }
.dp-palette-cell { position:relative;min-width:0 }
.dp-app button.dp-palette-swatch { width:100%;aspect-ratio:1;min-height:32px;border:1px solid transparent;background:transparent;padding:3px;border-radius:7px }
.dp-app button.dp-palette-swatch[aria-pressed=true] { border-color:var(--dp-accent) }
.dp-palette-color { display:block;width:100%;height:100%;border:1px solid #ffffff50;border-radius:50% }
.dp-app button.dp-remove-color { position:absolute;right:-4px;top:-4px;width:19px;min-height:19px;padding:3px;border-radius:50%;background:var(--dp-fill);border-color:var(--dp-border) }
.dp-remove-color svg { width:11px;height:11px }
.dp-color-picker button[data-action=save-color] { justify-self:start;min-height:30px;padding:5px 8px;font-size:11px }
.dp-color-picker .dp-palette-error { color:#ffc0ae }
.dp-preferences { display:flex;align-items:center;gap:16px;padding:8px 12px;border-top:1px solid var(--dp-border);font-size:11px;flex-wrap:wrap }
.dp-toggle { display:flex;align-items:center;gap:7px }
.dp-select { display:flex;align-items:center;gap:7px;color:var(--dp-muted) }
.dp-app select { font:inherit;color:var(--dp-ink);background:var(--dp-surface);border:1px solid var(--dp-border);padding:6px;border-radius:7px;max-width:125px }
.dp-pencil-details { margin-left:auto;position:relative }
.dp-pencil-details summary { color:var(--dp-muted);cursor:pointer;font-size:10px }
.dp-pencil-details p { position:absolute;bottom:22px;right:0;background:var(--dp-fill);border:1px solid var(--dp-border);padding:12px;border-radius:9px;min-width:230px;z-index:8;color:var(--dp-muted);line-height:1.7;white-space:pre-line;box-shadow:0 8px 20px #0005 }
.dp-share-row { border-top:1px solid var(--dp-border);display:flex;align-items:center;gap:10px;padding:10px 12px }
.dp-caption-slot { flex:1;min-width:0 }
.dp-caption-slot input { width:100%;min-height:36px!important }
.dp-notice { color:var(--dp-muted);font-size:11px;padding:7px 12px;background:color-mix(in srgb,var(--dp-accent) 8%,var(--dp-fill));border-top:1px solid var(--dp-border);line-height:1.5 }
.dp-notice[data-error=true] { color:#ffc0ae }
.dp-library { position:absolute;inset:0;z-index:10;background:var(--dp-fill);display:flex;flex-direction:column;overflow:hidden;padding:18px;gap:16px }
.dp-library > :not(.dp-gallery) { flex-shrink:0 }
.dp-library .dp-gallery { flex:1;min-height:0;height:auto }
.dp-library-heading { display:flex;align-items:center;gap:10px;padding-right:92px }
.dp-library-heading h2 { margin:0;font-size:20px;flex:1 }
.dp-library small { color:var(--dp-muted) }
.dp-new { padding:8px;display:grid;gap:18px;container-type:inline-size;container-name:dp-new }
.dp-new p { color:var(--dp-muted);margin:0 }
.dp-new small { color:var(--dp-muted);font-size:11px }
.dp-presets { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px }
.dp-new button[data-new=preset] { display:flex;flex-direction:column;gap:4px;padding:14px 10px 12px;min-width:0;border-radius:13px }
.dp-new button[data-new=preset][aria-pressed=true] { border-color:var(--dp-accent);background:color-mix(in srgb,var(--dp-accent) 14%,var(--dp-surface));box-shadow:inset 0 0 0 1px var(--dp-accent) }
.dp-paper-preview { position:relative;display:flex;align-items:center;justify-content:center;width:76px;height:76px;margin:3px 0 12px }
.dp-paper-shape { display:block;background:linear-gradient(145deg,#fff,#eae8ee);border-radius:1px;box-shadow:0 5px 12px #0004,0 1px 2px #0003 }
.dp-preset-check { display:none;position:absolute;right:-5px;bottom:-5px;background:var(--dp-accent);color:#171221;border:3px solid var(--dp-surface);border-radius:50%;width:23px;height:23px;align-items:center;justify-content:center;font-size:11px;font-weight:750 }
.dp-new button[data-new=preset][aria-pressed=true] .dp-preset-check { display:flex }
.dp-new button[data-new=preset] strong { font-size:13px;font-weight:600 }
.dp-new button[data-new=preset] small { font-size:10px;white-space:nowrap;font-variant-numeric:tabular-nums }
.dp-custom-heading { display:flex;align-items:center;justify-content:space-between;gap:12px }
.dp-custom-heading span { font-size:11px;color:var(--dp-muted) }
.dp-new button[data-new=custom] { background:transparent;min-height:30px;padding:5px 9px;font-size:12px }
.dp-new button[data-new=custom][aria-pressed=true] { color:var(--dp-accent);border-color:var(--dp-accent) }
.dp-dimensions { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px }
.dp-number-slot { display:block;min-width:0 }
.dp-size-details { display:grid;gap:4px;min-height:40px }
.dp-size-summary { font-variant-numeric:tabular-nums }
.dp-size-summary[data-error=true] { color:#ffc0ae }
.dp-new-actions { display:flex;justify-content:flex-end;gap:8px;position:sticky;bottom:-16px;background:var(--dp-fill);padding:12px 0 8px;margin-top:-8px;border-top:1px solid var(--dp-border);z-index:1 }
.dp-new label { display:grid;gap:8px }
@container dp-new (max-width:440px) { .dp-presets { grid-template-columns:repeat(2,minmax(0,1fr)) }.dp-paper-preview { width:58px;height:58px;margin:0 0 9px }.dp-new button[data-new=preset] { padding:10px 7px } }
@container dp-workspace (max-width:900px) { .dp-topbar { gap:7px } .dp-preferences { gap:12px } }
@container dp-workspace (max-width:560px) { .dp-topbar { padding:8px 86px 8px 8px;gap:6px } .dp-topbar button { padding:6px 8px;font-size:11px;min-height:33px } .dp-app .dp-close { right:calc(8px + env(safe-area-inset-right,0px));top:calc(8px + var(--app-interactive-safe-top,env(safe-area-inset-top,0px)));padding:6px 8px;min-height:34px;font-size:11px } .dp-workspace-controls { right:calc(84px + env(safe-area-inset-right,0px));top:calc(8px + var(--app-interactive-safe-top,env(safe-area-inset-top,0px))) } .dp-workspace-controls button { min-height:34px;font-size:11px } .dp-save-state { margin-right:0;flex:1 } .dp-tools { width:45px;padding:9px 4px;gap:5px } .dp-tools button { width:35px;min-height:35px } .dp-properties { padding:8px;gap:8px } .dp-colors { width:100%;justify-content:center;gap:8px } .dp-slider { min-width:95px;max-width:none;gap:5px } .dp-preferences { padding:7px 8px;gap:8px;font-size:10px } .dp-pencil-details { margin-left:0 } .dp-share-row { padding:8px;gap:6px } .dp-share-row button { font-size:11px;padding:7px 8px;white-space:nowrap } .dp-notice { padding:6px 8px;font-size:10px } .dp-library { padding:12px } .dp-library-heading { padding-right:72px;gap:8px } .dp-library-heading h2 { font-size:16px } }
@media(prefers-reduced-motion:reduce) { .dp-app button,.dp-launcher button { transition:none }.dp-selection-ants { animation:none } }
@container dp-workspace (max-width:560px) {
  .dp-topbar .dp-title-slot { flex:1 1 calc(100% - 85px); max-width:none; min-width:0 }
  .dp-topbar .dp-save-state { flex:0 0 72px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:9px }
  .dp-topbar .dp-book-label { display:inline-flex }
  .dp-topbar .dp-book-label span { display:none }
  .dp-properties { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px 12px }
  .dp-colors { grid-column:1/-1 }
  .dp-slider { min-width:0; max-width:none; width:100%; font-size:10px }
  .dp-slider input { flex:1; min-width:24px; width:0 }
  .dp-slider:last-child { grid-column:1/-1 }
}
`
