/** Static assets served by the web mode (kept in code so the build has no extra files). */

import { HOME_CSS } from "./assets-home.js";

export const APP_CSS = `
/* Design: clean and calm (system font, light gray canvas, white rounded cards, frosted bar).
   No third-party artwork or fonts are bundled, and no PADI artwork or logos are used. */
:root {
  color-scheme: light dark;
  --canvas: #f5f5f7;
  --wash-1: rgba(0, 125, 250, .10); --wash-2: rgba(175, 82, 222, .08); --wash-3: rgba(255, 159, 10, .06);
  --card: #ffffff; --card-2: #fbfbfd; --bar: rgba(251, 251, 253, .78);
  --text: #1d1d1f; --text-2: #424245; --muted: #6e6e73; --faint: #86868b; /* --faint: decoration only, never text */
  --hairline: rgba(0, 0, 0, .08); --border: #d2d2d7; --fill: rgba(118, 118, 128, .12); --fill-2: rgba(118, 118, 128, .08);
  --accent: #0071e3; --link: #0066cc; --focus: rgba(0, 113, 227, .28); --focus-ring: #0071e3;
  /* Button fills keep white text at 4.5:1 or more in both schemes. */
  --fill-accent: #0071e3; --fill-accent-hover: #0062c4; --fill-accent-press: #0058b0;
  --ok: #1d7a35; --ok-tint: rgba(52, 199, 89, .14);
  --bad: #d70015; --bad-fill: #e30000; --bad-tint: rgba(255, 59, 48, .12);
  --warn: #b25000; --warn-tint: rgba(255, 149, 0, .16);
  --info: #0066cc; --info-tint: rgba(0, 113, 227, .10);
  --shadow: 0 1px 1px rgba(0, 0, 0, .02), 0 4px 14px rgba(0, 0, 0, .05), 0 12px 40px rgba(0, 0, 0, .04);
  --shadow-hover: 0 2px 4px rgba(0, 0, 0, .04), 0 10px 30px rgba(0, 0, 0, .08);
  --switch-off: #e9e9eb; --switch-on: #248a3d; --switch-ring: #86868b;
  --r-xl: 22px; --r-lg: 18px; --r: 12px; --r-sm: 9px;
  --font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "Segoe UI", Roboto, Helvetica, Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", sans-serif;
  --font-display: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", "Segoe UI", Roboto, Helvetica, Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", sans-serif;
  --mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --canvas: #000000;
    --wash-1: rgba(10, 132, 255, .16); --wash-2: rgba(191, 90, 242, .12); --wash-3: rgba(255, 159, 10, .06);
    --card: #1c1c1e; --card-2: #2c2c2e; --bar: rgba(22, 22, 23, .78);
    --text: #f5f5f7; --text-2: #d1d1d6; --muted: #98989d; --faint: #8e8e93;
    --hairline: rgba(255, 255, 255, .1); --border: #424245; --fill: rgba(118, 118, 128, .24); --fill-2: rgba(118, 118, 128, .16);
    --accent: #0a84ff; --link: #2997ff; --focus: rgba(10, 132, 255, .4); --focus-ring: #409cff;
    --fill-accent: #0071e3; --fill-accent-hover: #0062c4; --fill-accent-press: #0058b0;
    --ok: #30d158; --ok-tint: rgba(48, 209, 88, .16);
    --bad: #ff6961; --bad-fill: #d70015; --bad-tint: rgba(255, 69, 58, .18);
    --warn: #ffb340; --warn-tint: rgba(255, 159, 10, .18);
    --info: #64b5ff; --info-tint: rgba(10, 132, 255, .18);
    --shadow: 0 0 0 1px rgba(255, 255, 255, .06); --shadow-hover: 0 0 0 1px rgba(255, 255, 255, .12);
    --switch-off: #39393d; --switch-on: #30d158; --switch-ring: #8e8e93;
  }
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
html { -webkit-text-size-adjust: 100%; scroll-padding-top: 72px; }
@media (max-width: 760px) { html { scroll-padding-top: 108px; } }
body {
  margin: 0; min-height: 100vh; display: flex; flex-direction: column;
  color: var(--text); font: 16px/1.47 var(--font); letter-spacing: -.011em;
  -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
  background-color: var(--canvas);
  background-image: radial-gradient(1100px 520px at 0% -8%, var(--wash-1), transparent 62%),
    radial-gradient(900px 480px at 100% -4%, var(--wash-2), transparent 60%),
    radial-gradient(900px 600px at 50% 110%, var(--wash-3), transparent 60%);
  background-attachment: fixed;
}
a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; }
/* Links inside running text are underlined, so they do not rely on color alone. */
:is(p, li, .flash, .hint, .notice, label) a:not(.button) { text-decoration: underline; text-underline-offset: 2px; text-decoration-thickness: 1px; }
:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }

/* Top bar */
.topbar { position: sticky; top: 0; z-index: 10; background: var(--bar); border-bottom: 1px solid var(--hairline);
  -webkit-backdrop-filter: saturate(180%) blur(20px); backdrop-filter: saturate(180%) blur(20px); }
.topbar-inner { max-width: 1040px; margin: 0 auto; padding: 0 20px; min-height: 56px; display: flex; align-items: center; gap: 16px; }
.brand { display: flex; align-items: center; gap: 10px; color: var(--text); font: 600 18px/1 var(--font-display); letter-spacing: -.02em; }
.brand:hover { text-decoration: none; }
/* The product name "MCP for PADI": "for PADI" is lighter, so the name of PADI never stands out
   more than the name of this project. */
.brand-name { font-weight: 400; white-space: nowrap; }
.brand-name b { font-weight: 600; color: inherit; }
.tabs { display: flex; gap: 2px; margin-left: auto; overflow-x: auto; scrollbar-width: none; }
.tabs::-webkit-scrollbar { display: none; }
.tabs a { color: var(--text-2); font-size: 14px; padding: 7px 12px; border-radius: 999px; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; }
.tabs a:hover { background: var(--fill-2); text-decoration: none; }
.tabs a.active { background: var(--fill); color: var(--text); font-weight: 600; }
.tabs a:focus-visible { outline-offset: -2px; }
.me { display: flex; align-items: center; gap: 8px; }
.me form { margin: 0; }
.topbar .signin { margin-left: auto; font-size: 14px; }
@media (max-width: 760px) {
  .topbar-inner { flex-wrap: wrap; padding: 8px 14px 0; gap: 8px 12px; }
  .me { margin-left: auto; }
  .tabs { order: 3; width: 100%; margin: 0 -4px; padding-bottom: 8px; }
  .tabs a { font-size: 13px; padding: 6px 9px; }
}
.tabs .short { display: none; }
@media (max-width: 480px) { .tabs .long { display: none; } .tabs .short { display: inline; } }

/* Avatar */
.avatar { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 32px; height: 32px; border-radius: 50%;
  background: linear-gradient(160deg, #6f7682, #545a64); color: #fff; font: 600 13px/1 var(--font); letter-spacing: .02em; }
.avatar.xl { width: 64px; height: 64px; font-size: 24px; }

/* Brand mark and service icons */
.mark { display: block; flex: none; border-radius: 22%; }
.mark-sm { width: 30px; height: 30px; }
.mark-lg { width: 56px; height: 56px; }
.mark-xl { width: 84px; height: 84px; box-shadow: 0 10px 30px rgba(79, 114, 251, .3); }
.svc-icon { display: inline-flex; align-items: center; justify-content: center; flex: none; color: #fff; }
.svc-icon svg { width: 58%; height: 58%; }
.svc-sm { width: 32px; height: 32px; border-radius: 8px; }
.svc-lg { width: 48px; height: 48px; border-radius: 12px; }
.svc-logbook { background: linear-gradient(180deg, #2fb5e8, #0a6fc2); }
.svc-cards { background: linear-gradient(180deg, #2fcfa8, #0e8f7a); }

/* Page */
main { width: 100%; max-width: 760px; margin: 0 auto; padding: 32px 20px 24px; flex: 1; }
main.wide { max-width: 1040px; }
footer { text-align: center; color: var(--muted); font-size: 12px; line-height: 1.5; padding: 28px 20px 40px; }
footer p { margin: 2px 0; }
footer .langs { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 6px; margin: 0 0 16px; font-size: 13px; }
footer .langs a, footer .langs span { padding: 4px 10px; border-radius: 999px; }
footer .langs a { color: var(--link); text-decoration: none; }
footer .langs a:hover { background: var(--fill-2); }
footer .langs span[aria-current] { background: var(--fill); color: var(--text); font-weight: 500; }
footer .author { display: inline-flex; align-items: center; gap: 6px; margin: 0 0 10px; font-size: 14px; color: var(--text-2); }
footer .author svg { width: 16px; height: 16px; flex: none; color: var(--muted); }
footer .author a { font-weight: 500; }
footer .links { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 6px; margin: 14px 0 0; font-size: 13px; }
footer .links a { padding: 4px 10px; border-radius: 999px; }
footer .links a:hover { background: var(--fill-2); text-decoration: none; }
h1, h2, h3 { font-family: var(--font-display); color: var(--text); }
h1 { font-size: 34px; line-height: 1.12; font-weight: 700; letter-spacing: -.028em; margin: 4px 0 14px; }
h2 { font-size: 21px; line-height: 1.24; font-weight: 600; letter-spacing: -.02em; margin: 0 0 12px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
h3 { font-size: 14px; font-weight: 600; color: var(--muted); margin: 22px 0 8px; }
p { margin: 8px 0; }
.muted { color: var(--muted); }
.fine { color: var(--muted); font-size: 13px; }
/* Long emails, addresses and tokens wrap instead of widening the page. */
main :is(p, li, label, h1, h2, h3, dt, dd, td, .hint, .flash) { overflow-wrap: anywhere; }
h2 > *, .status-list li > * { min-width: 0; }
.date { white-space: nowrap; }
.center { text-align: center; }
.page-title { margin: 0 0 22px; }
.page-title h1 { margin-bottom: 4px; }
.page-title p { margin: 0; color: var(--muted); font-size: 17px; }

/* Privacy policy and terms of use */
.legal-toc ol { margin: 0; padding-left: 22px; columns: 2 220px; column-gap: 32px; }
.legal-toc li { margin: 0 0 6px; break-inside: avoid; }
.legal section { scroll-margin-top: 80px; }
.legal section h2 { font-size: 19px; }
.legal ul { margin: 8px 0; padding-left: 22px; }
.legal li { margin: 0 0 8px; }
.legal li::marker { color: var(--muted); }
.legal code { font-size: .92em; overflow-wrap: anywhere; }
.legal-end { text-align: center; margin: 4px 0 0; }

/* Cards */
.card { background: var(--card); border-radius: var(--r-xl); box-shadow: var(--shadow); padding: 26px 28px; margin-bottom: 20px; }
.card > :last-child { margin-bottom: 0; }
.narrow { max-width: 460px; margin-left: auto; margin-right: auto; }
@media (max-width: 560px) { .card { padding: 20px 18px; border-radius: var(--r-lg); } h1 { font-size: 28px; } }

/* Hero (welcome) */
.hero { text-align: center; padding: 28px 0 8px; }
.hero h1 { font-size: 48px; line-height: 1.06; letter-spacing: -.034em; margin: 22px auto 14px; max-width: 640px; }
.hero .lead { font-size: 21px; line-height: 1.38; color: var(--muted); max-width: 560px; margin: 0 auto; letter-spacing: -.016em; }
.hero .actions { justify-content: center; margin-top: 26px; }
@media (max-width: 560px) { .hero h1 { font-size: 36px; } .hero .lead { font-size: 18px; } }

/* Tiles (services): one equal column per tile, side by side, stacked on phones */
.tiles { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 16px; margin: 32px 0 24px; }
@media (max-width: 560px) { .tiles { grid-auto-flow: row; } }
.tile { background: var(--card); border-radius: var(--r-xl); box-shadow: var(--shadow); padding: 20px; display: flex; flex-direction: column; gap: 10px; transition: box-shadow .2s ease, transform .2s ease; }
.tile:hover { box-shadow: var(--shadow-hover); transform: translateY(-1px); }
.tile-head { display: flex; align-items: center; gap: 12px; }
.tile-head strong { font: 600 19px/1.2 var(--font-display); letter-spacing: -.02em; }
.tile p { margin: 0; color: var(--muted); font-size: 15px; }
.tile .badge { align-self: flex-start; }

/* Profile header (account) */
.profile { display: flex; align-items: center; gap: 18px; margin: 0 0 6px; }
.profile h1 { font-size: 28px; margin: 0 0 4px; overflow-wrap: anywhere; }
@media (max-width: 560px) { .profile { gap: 14px; } .profile h1 { font-size: 22px; } .avatar.xl { width: 52px; height: 52px; font-size: 20px; } }
.profile p { margin: 0; color: var(--muted); }

/* Forms */
label { display: block; font-size: 14px; font-weight: 600; color: var(--text); margin: 16px 0 6px; }
.hint { display: block; color: var(--muted); font-size: 13px; font-weight: 400; margin-top: 2px; line-height: 1.4; }
input[type=text], input[type=email], input[type=password], input[type=number], input[type=url], select, textarea {
  width: 100%; min-height: 44px; padding: 10px 14px; border: 1px solid var(--border); border-radius: var(--r); background: var(--card);
  color: var(--text); font: 16px/1.4 var(--font); letter-spacing: -.01em; transition: border-color .15s ease, box-shadow .15s ease;
  -webkit-appearance: none; appearance: none;
}
select { padding-right: 36px; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5l5 5 5-5' fill='none' stroke='%2386868b' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 14px center; }
textarea { min-height: 88px; resize: vertical; }
input::placeholder, textarea::placeholder { color: var(--muted); }
input:focus, select:focus, textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 4px var(--focus); }
input:disabled, select:disabled { opacity: .55; }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
@media (max-width: 640px) { .row { grid-template-columns: 1fr; } }
.check { display: flex; align-items: flex-start; gap: 10px; font-weight: 400; font-size: 15px; margin: 12px 0; }
.check input { margin-top: 3px; width: 18px; height: 18px; accent-color: var(--accent); flex: none; }

/* Grouped list with iOS-style switches */
.group { background: var(--card-2); border: 1px solid var(--hairline); border-radius: var(--r-lg); overflow: hidden; margin: 8px 0 4px; }
@media (prefers-color-scheme: dark) { .group { background: var(--card-2); } }
.group .check { margin: 0; padding: 13px 16px; align-items: center; justify-content: space-between; flex-direction: row-reverse; gap: 16px; border-top: 1px solid var(--hairline); }
.group .check:first-child { border-top: 0; }
.group .check > span { flex: 1; font-size: 16px; }
.group .check .hint { font-size: 13px; }
/* Transparent borders are drawn in Windows high-contrast mode, so the switch stays visible there. */
.group .check input { -webkit-appearance: none; appearance: none; margin: 0; width: 51px; height: 31px; border-radius: 31px; background: var(--switch-off);
  border: 1px solid transparent; box-shadow: inset 0 0 0 1px var(--switch-ring); position: relative; cursor: pointer; transition: background .2s ease; flex: none; }
.group .check input::after { content: ""; position: absolute; top: 1px; left: 1px; width: 27px; height: 27px; border-radius: 50%; background: #fff;
  border: 1px solid transparent; box-sizing: border-box; box-shadow: 0 3px 8px rgba(0, 0, 0, .15), 0 1px 1px rgba(0, 0, 0, .16); transition: transform .2s ease; }
.group .check input:checked { background: var(--switch-on); box-shadow: none; }
.group .check input:checked::after { transform: translateX(20px); }
.group .check input:disabled { opacity: .5; cursor: not-allowed; }
@media (forced-colors: active) {
  .group .check input { border-color: CanvasText; }
  .group .check input::after { border-color: CanvasText; }
  .group .check input:checked { background: Highlight; }
}

/* Buttons */
button, .button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 40px; padding: 8px 19px; border: 1px solid transparent; border-radius: 999px;
  background: var(--fill-accent); color: #fff; font: 500 15px/1.2 var(--font); letter-spacing: -.01em; cursor: pointer; text-decoration: none; max-width: 100%; text-align: center;
  transition: background .15s ease, transform .1s ease; }
button:hover, .button:hover { background: var(--fill-accent-hover); text-decoration: none; }
button:active, .button:active { background: var(--fill-accent-press); transform: scale(.98); }
button.secondary, .button.secondary { background: var(--fill); color: var(--text); }
button.secondary:hover, .button.secondary:hover { background: var(--fill); filter: brightness(.96); }
button.danger, .button.danger { background: var(--bad-fill); color: #fff; }
button.danger:hover { background: var(--bad-fill); filter: brightness(1.06); }
button.link { background: none; color: var(--link); min-height: 0; padding: 6px 8px; font-weight: 400; font-size: 14px; border: 0; }
button.link:hover { background: none; text-decoration: underline; }
button.small, .button.small { min-height: 30px; padding: 5px 13px; font-size: 13px; }
button.block, .button.block { display: flex; width: 100%; min-height: 48px; font-size: 17px; }
.actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 20px; }
.row-actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.row-actions form { margin: 0; }
.stack { display: flex; flex-direction: column; gap: 10px; margin-top: 22px; }
form.inline { display: inline; }

/* Messages */
.flash { position: relative; padding: 13px 16px 13px 42px; border-radius: var(--r-lg); margin-bottom: 20px; background: var(--info-tint); color: var(--text); font-size: 15px; }
.flash::before { content: "i"; content: "i" / ""; position: absolute; left: 14px; top: 13px; width: 18px; height: 18px; border-radius: 50%; background: var(--info);
  color: var(--card); font: 700 12px/18px var(--font); text-align: center; }
.flash.ok { background: var(--ok-tint); }
.flash.ok::before { content: "\\2713"; content: "\\2713" / ""; background: var(--ok); }
.flash.error { background: var(--bad-tint); }
.flash.error::before { content: "!"; content: "!" / ""; background: var(--bad); }
.flash.warn { background: var(--warn-tint); }
.flash.warn::before { content: "!"; content: "!" / ""; background: var(--warn); }
.flash p { margin: 0; }
.flash p + p { margin-top: 6px; }
.card .flash { margin: 12px 0; }

/* Code and copy field */
code, .mono { font-family: var(--mono); font-size: 13px; background: var(--fill-2); padding: 2px 6px; border-radius: 6px; overflow-wrap: anywhere; }
.copy { display: flex; gap: 8px; align-items: center; background: var(--card-2); border: 1px solid var(--hairline); border-radius: var(--r); padding: 6px 6px 6px 14px; }
.copy code { flex: 1; min-width: 0; white-space: normal; overflow-wrap: anywhere; background: none; padding: 6px 0; font-size: 14px; }

/* Tables as grouped lists */
.table-wrap { overflow-x: auto; margin: 4px -4px 0; -webkit-overflow-scrolling: touch; }
/* Admin tables have many columns: on phones they keep a readable width and scroll sideways
   instead of squeezing e-mail addresses into one letter per line. */
.table-wrap.wide table { min-width: 640px; }
/* Table cells break a word only when it cannot fit at all (the table scrolls instead). */
.table-wrap td { overflow-wrap: break-word; }
.table-wrap.wide td { overflow-wrap: normal; word-break: normal; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { text-align: left; padding: 11px 8px; border-bottom: 1px solid var(--hairline); vertical-align: middle; }
tr:last-child td { border-bottom: 0; }
th { color: var(--muted); font-weight: 600; font-size: 13px; white-space: nowrap; }


/* Badges */
.badge { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 600; line-height: 1; padding: 5px 9px; border-radius: 999px;
  background: var(--fill-2); color: var(--muted); letter-spacing: 0; vertical-align: middle; white-space: nowrap; }
.badge.ok { background: var(--ok-tint); color: var(--ok); }
.badge.bad { background: var(--bad-tint); color: var(--bad); }
.badge.warn { background: var(--warn-tint); color: var(--warn); }
.badge.info { background: var(--info-tint); color: var(--info); }
.tabs .badge { padding: 3px 7px; font-size: 11px; background: var(--bad-fill); color: #fff; }

/* Live activity */
.live { display: inline-flex; align-items: center; gap: 6px; font: 600 12px/1 var(--font); letter-spacing: 0; padding: 5px 10px 5px 8px; border-radius: 999px;
  color: var(--ok); background: var(--ok-tint); }
.live .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 0 currentColor; animation: live-pulse 2s ease-out infinite; }
.live.off { color: var(--muted); background: var(--fill-2); }
.live.off .dot { animation: none; }
@keyframes live-pulse { 0% { box-shadow: 0 0 0 0 rgba(52, 199, 89, .55); } 70% { box-shadow: 0 0 0 7px rgba(52, 199, 89, 0); } 100% { box-shadow: 0 0 0 0 rgba(52, 199, 89, 0); } }
#activity tbody tr.new { animation: row-in .9s ease-out; }
#activity tbody tr.new td { animation: row-glow 2.4s ease-out; }
@keyframes row-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
@keyframes row-glow { from { background: var(--info-tint); } to { background: transparent; } }
@media (prefers-reduced-motion: reduce) { .live .dot, #activity tbody tr.new, #activity tbody tr.new td { animation: none; } }

/* Steps */
ol.steps { list-style: none; counter-reset: step; padding: 0; margin: 16px 0; }
ol.steps li { counter-increment: step; position: relative; padding: 2px 0 12px 44px; min-height: 30px; }
ol.steps li::before { content: counter(step); position: absolute; left: 0; top: 0; width: 28px; height: 28px; border-radius: 50%;
  background: var(--fill); color: var(--text); font: 600 14px/28px var(--font); text-align: center; }

/* Key-value list (overview) */
.kv { margin: 0; }
.kv div { display: flex; justify-content: space-between; gap: 16px; padding: 11px 0; border-top: 1px solid var(--hairline); }
.kv div:first-child { border-top: 0; }
.kv dt { color: var(--muted); }
.kv dd { margin: 0; text-align: right; overflow-wrap: anywhere; }

/* Status list (connection test, self-test) */
.status-list { list-style: none; padding: 0; margin: 8px 0; }
.status-list li { padding: 9px 0; border-top: 1px solid var(--hairline); display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
.status-list li:first-child { border-top: 0; }

/* Disclosure */
details { margin: 18px 0 4px; border-top: 1px solid var(--hairline); padding-top: 12px; }
details summary { cursor: pointer; color: var(--link); font-weight: 500; list-style: none; display: inline-flex; align-items: center; gap: 6px; }
details summary::-webkit-details-marker { display: none; }
details summary::before { content: ""; width: 7px; height: 7px; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(-45deg); transition: transform .2s ease; margin-right: 2px; }
details[open] summary::before { transform: rotate(45deg); }

/* Connect your AI app: one row per app, opened for its steps */
.apps { margin-top: 8px; border: 1px solid var(--hairline); border-radius: var(--r); overflow: hidden; }
h3.apps-group { margin: 22px 0 0; }
details.app { margin: 0; padding: 0; border-top: 1px solid var(--hairline); }
details.app:first-child { border-top: 0; }
details.app summary { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; width: 100%; padding: 13px 16px; color: var(--text); }
details.app summary::before { align-self: center; color: var(--faint); }
details.app summary:hover { background: var(--fill-2); }
.app-name { font-weight: 600; }
.app-hint { color: var(--muted); font-weight: 400; font-size: 14px; }
.app-body { padding: 2px 16px 14px 36px; }
.app-body .actions { margin: 6px 0 12px; }
.app-body .copy { margin-bottom: 10px; }
.app-body ol.steps { margin: 12px 0 4px; }
.copy-label { margin: 10px 0 6px; color: var(--muted); font-size: 13px; }
.copy code.pre { white-space: pre; overflow-x: auto; overflow-wrap: normal; }
@media (max-width: 560px) { .app-body { padding-left: 16px; } }

/* Sign-in and consent sheets */
.sheet { max-width: 440px; margin: 8px auto 0; text-align: center; }
.sheet .card { text-align: left; }
.sheet-head { display: flex; flex-direction: column; align-items: center; gap: 14px; margin-bottom: 18px; }
.sheet-head h1 { margin: 6px 0 0; font-size: 30px; text-align: center; }
.sheet-head p { margin: 0; color: var(--muted); text-align: center; }
.sheet-head h1, .sheet-head p { max-width: 100%; }
main > .flash:has(+ .sheet) { max-width: 440px; margin-left: auto; margin-right: auto; }
.returns { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-radius: var(--r); background: var(--fill-2); margin: 0 0 6px; font-size: 14px; }
.returns svg { width: 18px; height: 18px; flex: none; color: var(--muted); margin-top: 2px; }
.returns span { min-width: 0; }
.returns code { background: none; padding: 0; font-size: 14px; color: var(--text); font-weight: 600; }
.returns.known { background: var(--ok-tint); }
.returns.known svg { color: var(--ok); }
.flash code { background: none; padding: 0; font-weight: 600; color: var(--text); }
.pair { display: flex; align-items: center; gap: 14px; color: var(--faint); }
.pair svg { width: 22px; height: 22px; }
.app-icon { display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 14px; background: var(--card);
  box-shadow: var(--shadow); color: var(--text); font: 700 24px/1 var(--font-display); }
.perm-list { list-style: none; padding: 0; margin: 4px 0 0; }
.perm-list li { display: flex; align-items: center; gap: 14px; padding: 12px 0; border-top: 1px solid var(--hairline); }
.perm-list li:first-child { border-top: 0; }
.perm-list strong { display: block; font-weight: 600; }
.perm-list span.what { color: var(--muted); font-size: 14px; }
.notice { display: flex; gap: 10px; align-items: flex-start; font-size: 13px; color: var(--muted); background: var(--fill-2); border-radius: var(--r); padding: 10px 12px; margin: 14px 0 0; }
.notice svg { width: 16px; height: 16px; flex: none; margin-top: 1px; }
` + HOME_CSS;

export const APP_JS = `
// Texts in the page's language (rendered by the server into <body data-i18n>).
var I18N = {};
try { I18N = JSON.parse(document.body.getAttribute("data-i18n") || "{}"); } catch (err) { /* keep English */ }
function T(key, fallback) { return I18N[key] || fallback; }

document.addEventListener("click", function (e) {
  var btn = e.target.closest && e.target.closest("[data-copy]");
  if (btn) {
    var target = document.getElementById(btn.getAttribute("data-copy"));
    if (target && navigator.clipboard) {
      navigator.clipboard.writeText(target.textContent.trim()).then(function () {
        var old = btn.textContent; btn.textContent = T("copied", "Copied"); setTimeout(function () { btn.textContent = old; }, 1500);
      });
    }
  }
  var confirmEl = e.target.closest && e.target.closest("[data-confirm]");
  if (confirmEl && !window.confirm(confirmEl.getAttribute("data-confirm"))) e.preventDefault();
});

// A new PADI connection: select the browser's own time zone (the server's default otherwise).
(function () {
  var select = document.querySelector("select[data-browser-tz]");
  if (!select || !window.Intl) return;
  var zone = "";
  try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (err) { return; }
  for (var i = 0; i < select.options.length; i++) {
    if (select.options[i].value === zone) { select.selectedIndex = i; return; }
  }
})();

// Live activity: new tool calls slide in at the top while the page is visible.
(function () {
  var box = document.querySelector("[data-live]");
  if (!box || !window.EventSource) return;
  var body = box.querySelector("tbody");
  var wrap = box.querySelector(".table-wrap");
  var empty = box.querySelector("[data-empty]");
  var badge = box.querySelector(".live");
  var label = box.querySelector(".live-text");
  var lastId = Number(box.getAttribute("data-last-id")) || 0;
  var source = null;
  var retry = null;
  var wait = 30000;
  var signedOut = false;
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function when(ms) {
    var d = new Date(ms);
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()) + " " + pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + " UTC";
  }
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function add(ev) {
    if (!ev || typeof ev.id !== "number" || ev.id <= lastId) return;
    lastId = ev.id;
    var tr = el("tr", "new");
    tr.setAttribute("data-id", String(ev.id));
    var t1 = el("td"); t1.appendChild(el("span", "date", when(ev.at)));
    var t2 = el("td"); t2.appendChild(el("code", "", String(ev.tool)));
    var t3 = el("td");
    t3.appendChild(el("span", "badge " + (ev.ok ? "ok" : "bad"), ev.ok ? T("ok", "ok") : T("error", "error")));
    t3.appendChild(document.createTextNode(" "));
    t3.appendChild(el("span", "muted", Math.round(Number(ev.durationMs) || 0) + " ms"));
    tr.appendChild(t1); tr.appendChild(t2); tr.appendChild(t3);
    body.insertBefore(tr, body.firstChild);
    while (body.rows.length > 50) body.deleteRow(body.rows.length - 1);
    wrap.hidden = false;
    if (empty) empty.hidden = true;
  }
  function show(on, text) {
    badge.hidden = false;
    badge.className = on ? "live" : "live off";
    label.textContent = text;
  }
  function stop() {
    if (source) { source.close(); source = null; }
    clearTimeout(retry);
  }
  function start() {
    if (source || document.hidden || signedOut) return;
    clearTimeout(retry);
    source = new EventSource(box.getAttribute("data-live") + "?after=" + lastId);
    source.onopen = function () { wait = 30000; show(true, T("live", "Live")); };
    source.addEventListener("activity", function (e) {
      try { add(JSON.parse(e.data)); } catch (err) { /* ignore a broken event */ }
    });
    // The session ended (signed out, expired or disabled): stop for good.
    source.addEventListener("end", function () {
      signedOut = true;
      stop();
      show(false, T("signedOut", "Signed out, reload the page"));
    });
    source.onerror = function () {
      if (signedOut) return;
      if (source && source.readyState === 2) {
        // The server refused or ended the stream: try again later, waiting longer each time.
        stop();
        show(false, T("paused", "Paused"));
        retry = setTimeout(start, wait);
        wait = Math.min(wait * 2, 600000);
      } else {
        show(false, T("reconnecting", "Reconnecting"));
      }
    };
  }
  // Only stay connected while someone looks at the page.
  document.addEventListener("visibilitychange", function () {
    if (signedOut) return;
    if (document.hidden) { stop(); show(false, T("paused", "Paused")); } else { start(); }
  });
  window.addEventListener("pagehide", stop);
  start();
})();

// Start page video: plays muted while it is on screen, unless the visitor prefers reduced motion.
// Once the visitor pauses or plays it themselves, the page leaves it alone.
(function () {
  var video = document.querySelector("video[data-autoplay]");
  if (!video || !("IntersectionObserver" in window)) return;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var saveData = navigator.connection && navigator.connection.saveData;
  if (reduce || saveData) return;
  var byUser = false;
  var ours = false;
  video.muted = true;
  video.addEventListener("play", function () { if (!ours) byUser = true; ours = false; });
  video.addEventListener("pause", function () { if (!ours) byUser = true; ours = false; });
  new IntersectionObserver(function (entries) {
    if (byUser) return;
    var visible = entries[0].isIntersecting;
    if (visible && video.paused) { ours = true; video.play().catch(function () { ours = false; }); }
    else if (!visible && !video.paused) { ours = true; video.pause(); }
  }, { threshold: 0.25 }).observe(video);
})();
`;
