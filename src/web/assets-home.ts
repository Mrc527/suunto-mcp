/**
 * Styles of the start page (routes-home.ts), kept apart from the shared styles in assets.ts.
 * Uses the design tokens defined there (--text, --muted, --card, --r, ...). Every rule starts
 * with .home so it cannot change other pages. Mobile first: wider screens add columns.
 */
export const HOME_CSS = `
/* Start page */
.home { --home-gap: 56px; }
.home .home-section { margin: var(--home-gap) 0 0; }
.home .home-head { text-align: center; max-width: 640px; margin: 0 auto 24px; }
.home .home-head h2 { justify-content: center; font-size: 28px; line-height: 1.14; font-weight: 700; letter-spacing: -.025em; margin: 0 0 8px; }
.home .home-head p { margin: 0; color: var(--muted); font-size: 17px; line-height: 1.45; text-wrap: balance; }
.home h3 { font: 600 17px/1.3 var(--font-display); letter-spacing: -.016em; text-transform: none; color: var(--text); margin: 0 0 4px; }
.home p { overflow-wrap: break-word; }

/* Hero */
.home .home-hero { padding: 20px 0 0; }
.home .home-hero .mark-xl { margin: 0 auto; }
.home .home-hero h1 { font-size: 36px; margin: 20px auto 14px; text-wrap: balance; }
.home .home-hero .lead { font-size: 18px; text-wrap: pretty; }
.home .home-hero .actions { margin-top: 24px; }
.home .home-hero .button, .home .home-cta .button { min-height: 44px; padding: 10px 22px; font-size: 16px; }
.home .home-works { margin: 18px auto 0; max-width: 520px; color: var(--muted); font-size: 14px; text-wrap: balance; }

/* Video: 16:9 with rounded corners, also before the poster has loaded. */
.home .home-video-frame { max-width: 880px; margin: 0 auto; border-radius: var(--r-xl); overflow: hidden; background: var(--card); box-shadow: var(--shadow); }
.home .home-video video { display: block; width: 100%; height: auto; aspect-ratio: 16 / 9; background: var(--card); }
.home .home-video video p { padding: 20px; margin: 0; }
.home .home-video-note { text-align: center; color: var(--muted); font-size: 13px; margin: 10px 0 0; }

/* What you can do: the two services side by side (stacked on phones), as wide as the features below */
.home .tiles { margin: 0; }
.home .home-services { grid-template-columns: 1fr; gap: 16px; }
.home .home-services .tile { gap: 12px; }
.home .home-services .tile p { font-size: 16px; line-height: 1.5; }
.home .tile-head h3 { font-size: 19px; line-height: 1.2; letter-spacing: -.02em; margin: 0; }
.home .home-features { list-style: none; padding: 0; margin: 28px 0 0; display: grid; grid-template-columns: 1fr; gap: 16px 28px; }
.home .home-features li { display: flex; gap: 14px; align-items: flex-start; padding: 8px 4px; }
.home .home-features p { margin: 0; color: var(--muted); font-size: 15px; }
.home .home-feature-icon { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 40px; height: 40px; border-radius: 11px;
  background: var(--info-tint); color: var(--info); }
.home .home-feature-icon svg { width: 22px; height: 22px; }

/* Try asking: the requests as sent messages */
.home .home-bubbles { list-style: none; padding: 0; margin: 0 auto; max-width: 900px; display: flex; flex-direction: column; align-items: flex-start; gap: 10px; }
.home .home-bubbles li:nth-child(even) { align-self: flex-end; }
.home .home-bubbles li { max-width: 88%; }
.home .home-bubbles q { display: block; padding: 11px 17px; border-radius: 20px 20px 20px 6px; background: var(--card); box-shadow: var(--shadow);
  color: var(--text); font-size: 16px; line-height: 1.4; }
.home .home-bubbles li:nth-child(even) q { border-radius: 20px 20px 6px 20px; }

/* How it works */
.home .home-steps { list-style: none; counter-reset: home-step; padding: 0; margin: 0; display: grid; grid-template-columns: 1fr; gap: 16px; }
.home .home-steps li { counter-increment: home-step; position: relative; background: var(--card); border-radius: var(--r-xl); box-shadow: var(--shadow); padding: 20px 20px 20px 66px; }
.home .home-steps li::before { content: counter(home-step); position: absolute; left: 20px; top: 18px; width: 32px; height: 32px; border-radius: 50%;
  background: var(--fill-accent); color: #fff; font: 600 16px/32px var(--font-display); text-align: center; }
.home .home-steps p { margin: 0; color: var(--muted); font-size: 15px; }
.home .home-address { max-width: 560px; margin: 24px auto 0; text-align: center; }
.home .home-address p { margin: 0 0 8px; color: var(--muted); font-size: 14px; }
.home .home-address .copy { text-align: left; background: var(--card); }

/* Privacy and security */
.home .home-privacy { padding: 28px 20px; }
.home .home-privacy .home-head { margin-bottom: 20px; }
.home .home-privacy-icon { display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 14px; margin: 0 0 12px;
  background: linear-gradient(180deg, #5ac8fa, #0071e3); color: #fff; }
.home .home-privacy-icon svg { width: 26px; height: 26px; }
.home .home-checks { list-style: none; padding: 0; margin: 0 auto; max-width: 900px; display: flex; flex-wrap: wrap; justify-content: center; gap: 20px 32px; }
.home .home-checks li { display: flex; gap: 12px; align-items: flex-start; flex: 1 1 100%; }
.home .home-checks p { margin: 0; color: var(--muted); font-size: 15px; }
.home .home-privacy-more { margin: 24px 0 0; text-align: center; color: var(--muted); font-size: 15px; }
.home .home-check { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 24px; height: 24px; border-radius: 50%; margin-top: 1px;
  background: var(--ok-tint); color: var(--ok); }
.home .home-check svg { width: 15px; height: 15px; stroke-width: 2.6; }

/* Questions and answers */
.home .home-faq .card { max-width: 760px; margin: 0 auto; padding: 4px 20px; }
.home .home-faq details { margin: 0; padding: 0; border-top: 1px solid var(--hairline); }
.home .home-faq details:first-child { border-top: 0; }
.home .home-faq summary { display: flex; align-items: center; gap: 12px; width: 100%; padding: 16px 0; color: var(--text); font-weight: 600; font-size: 16px; line-height: 1.35; }
.home .home-faq summary::before { flex: none; color: var(--muted); }
.home .home-faq summary:hover { color: var(--link); }
.home .home-faq details p { margin: -6px 0 16px 23px; color: var(--text-2); font-size: 15px; }

/* Final call to action */
.home .home-cta { text-align: center; padding: 8px 0 12px; }
.home .home-cta .mark { margin: 0 auto 16px; }
.home .home-cta h2 { justify-content: center; font-size: 28px; line-height: 1.14; font-weight: 700; letter-spacing: -.025em; margin: 0 auto 8px; max-width: 640px; text-wrap: balance; }
.home .home-cta p { margin: 0 auto; max-width: 520px; color: var(--muted); font-size: 17px; }
.home .home-cta .actions { justify-content: center; margin-top: 22px; }

@media (min-width: 640px) {
  .home { --home-gap: 80px; }
  .home .home-head h2, .home .home-cta h2 { font-size: 34px; }
  .home .home-hero h1 { font-size: 48px; }
  .home .home-hero .lead { font-size: 21px; }
  .home .home-services { grid-template-columns: repeat(2, 1fr); gap: 20px; }
  .home .home-services .tile { padding: 24px 26px 26px; }
  .home .home-services .tile-head h3 { font-size: 21px; }
  .home .home-bubbles { flex-direction: row; flex-wrap: wrap; justify-content: center; gap: 12px; }
  .home .home-bubbles li { max-width: 100%; }
  .home .home-bubbles li:nth-child(even) { align-self: auto; }
  .home .home-bubbles q { padding: 12px 20px; font-size: 17px; }
  .home .home-privacy { padding: 40px 36px; }
  .home .home-checks li { flex-basis: calc(50% - 16px); flex-grow: 0; }
  .home .home-faq .card { padding: 6px 28px; }
}
@media (min-width: 900px) {
  .home .home-hero { padding-top: 36px; }
  .home .home-hero h1 { font-size: 56px; max-width: 760px; }
  .home .home-features, .home .home-steps { grid-template-columns: repeat(3, 1fr); }
  .home .home-steps li { padding: 64px 22px 22px; }
  .home .home-steps li::before { top: 20px; left: 22px; }
  .home .home-checks li { flex-basis: calc((100% - 64px) / 3); }
}
/* No single word alone on the last line of a heading or paragraph, in any language. */
.home h2, .home h3 { text-wrap: balance; }
.home p { text-wrap: pretty; }
/* French puts a non-breaking space inside « ». */
.home :lang(fr) q, .home q:lang(fr) { quotes: "«\\00a0" "\\00a0»" "“" "”"; }
`;
