<!-- apps/web/app/pages/trust.vue
     "Can I trust this?" (v1.119.0) — the manager-facing brief as a real page
     of the app, wearing the site's own header nav and footer. v1.118.0 served
     it as a static /trust.html; making it a route keeps navigation, theme,
     and responsiveness consistent with everything else.

     The BODY is generated: `pnpm build-brief` fills the template in
     docs/brief/ with live numbers (production /status, git, package.json) and
     writes app/data/trustBody.ts — the same fill that produces the emailable
     standalone twins, so the page can never tell a different story than the
     document being emailed around (pinned by trustPage.test.ts).

     v-html is safe here for the same reason as Section10AuditEntry: the
     string is repo-authored template plus machine-formatted numbers — nothing
     user-supplied or request-derived ever reaches it. -->
<script setup lang="ts">
import { TRUST_BODY } from "~/data/trustBody";

const DESCRIPTION =
  "How this document accessibility checker is verified: independent validators, trap documents, public disputes, and live numbers anyone can check.";

useHead({
  title: "Can I trust this? — Accessibility Audit",
  meta: [
    { name: "description", content: DESCRIPTION },
    // Page-specific og/twitter overrides of the site-wide defaults, so a
    // shared link previews as THIS page's argument rather than the app's.
    { property: "og:title", content: "Can I trust this? — Accessibility Audit" },
    { property: "og:description", content: DESCRIPTION },
    { property: "og:url", content: "https://audit.icjia.app/trust" },
    { name: "twitter:title", content: "Can I trust this? — Accessibility Audit" },
    { name: "twitter:description", content: DESCRIPTION },
  ],
  link: [{ rel: "canonical", href: "https://audit.icjia.app/trust" }],
});
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html — repo-authored generated body, see header comment -->
  <div class="trust-page -mx-3 sm:-mx-6" v-html="TRUST_BODY"></div>
</template>

<style>
/* The brief's poster styles, adapted to live INSIDE the app layout: the page
   background and fonts come from the app (no external font loads); the
   palette below mirrors the standalone brief in docs/brief/, which is the
   other output of the same generator. Un-scoped on purpose — the body arrives
   via v-html, which scoped styles cannot reach. Everything is namespaced
   under .trust-page so nothing leaks into the rest of the app. */
.trust-page {
  --tp-panel: var(--surface-card);
  --tp-line: var(--border);
  --tp-text: var(--text-heading);
  --tp-muted: var(--text-muted);
  --tp-good: #34d399;
  --tp-bad: #f87171;
  --tp-ext: #fbbf24;
  --tp-act: #67e8f9;
  --tp-good-dim: rgba(52, 211, 153, 0.12);
  --tp-bad-dim: rgba(248, 113, 113, 0.12);
  --tp-ext-dim: rgba(251, 191, 36, 0.12);
  --tp-act-dim: rgba(103, 232, 249, 0.1);
  line-height: 1.5;
}
.trust-page .wrap {
  max-width: 100%;
  margin: 0 auto;
  padding: 0 12px;
}
.trust-page .display {
  font-weight: 900;
  line-height: 1.05;
  text-wrap: balance;
  color: var(--tp-text);
}
.trust-page .mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-variant-numeric: tabular-nums;
}
.trust-page section {
  padding: 44px 0;
  border-top: 1px solid var(--tp-line);
}
.trust-page section:first-of-type {
  border-top: none;
}
.trust-page .kicker {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--tp-muted);
  margin-bottom: 14px;
}
.trust-page .kicker b {
  color: var(--tp-act);
}
.trust-page h2.display {
  font-size: clamp(26px, 4.2vw, 40px);
  margin-bottom: 14px;
}
.trust-page .lede {
  font-size: clamp(16px, 2vw, 19px);
  color: var(--tp-muted);
  max-width: 64ch;
}
.trust-page .lede strong {
  color: var(--tp-text);
}
.trust-page .hero {
  padding: 40px 0 44px;
}
.trust-page .hero h1 {
  font-size: clamp(34px, 6vw, 62px);
  margin: 10px 0 18px;
  font-weight: 900;
  line-height: 1.05;
  text-wrap: balance;
}
.trust-page .hero h1 .good {
  color: var(--tp-good);
}
.trust-page .hero .sub {
  font-size: clamp(17px, 2.2vw, 21px);
  color: var(--tp-muted);
  max-width: 56ch;
}
.trust-page .stamp {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
  margin-top: 30px;
  border: 2px solid var(--tp-ext);
  background: var(--tp-ext-dim);
  border-radius: 14px;
  padding: 14px 20px;
}
.trust-page .stamp .lbl {
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--tp-ext);
  max-width: 30ch;
  line-height: 1.4;
}
.trust-page .stamp .date {
  font-weight: 900;
  font-size: clamp(24px, 3.8vw, 36px);
  color: var(--tp-ext);
  white-space: nowrap;
  margin-left: auto;
}
.trust-page .statrow {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(215px, 1fr));
  gap: 12px;
  margin-top: 34px;
}
.trust-page .stat {
  background: var(--tp-panel);
  border: 1px solid var(--tp-line);
  border-radius: 14px;
  padding: 22px 20px;
}
.trust-page .stat .n {
  font-weight: 900;
  /* Sized so the widest figure ("39 / 39" in tabular mono) fits the in-app
     card, which is narrower than the standalone brief's. */
  font-size: clamp(28px, 3.6vw, 38px);
  line-height: 1;
  white-space: nowrap;
  letter-spacing: -0.01em;
}
.trust-page .stat .n.good {
  color: var(--tp-good);
}
.trust-page .stat .n.ext {
  color: var(--tp-ext);
}
.trust-page .stat .n.act {
  color: var(--tp-act);
}
.trust-page .stat .l {
  margin-top: 10px;
  font-size: 14px;
  color: var(--tp-muted);
  font-weight: 600;
}
.trust-page .pipe {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 12px;
  margin-top: 30px;
}
.trust-page .pipe .node {
  flex: 1 1 200px;
  background: var(--tp-panel);
  border: 1px solid var(--tp-line);
  border-radius: 14px;
  padding: 18px;
}
.trust-page .pipe .arrow {
  align-self: center;
  color: var(--tp-muted);
  font-size: 24px;
}
.trust-page .node .tag {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 4px 10px;
  border-radius: 999px;
  margin-bottom: 12px;
}
.trust-page .tag.ours {
  background: var(--tp-act-dim);
  color: var(--tp-act);
  border: 1px solid var(--tp-act);
}
.trust-page .tag.theirs {
  background: var(--tp-ext-dim);
  color: var(--tp-ext);
  border: 1px solid var(--tp-ext);
}
.trust-page .tag.rule {
  background: var(--tp-good-dim);
  color: var(--tp-good);
  border: 1px solid var(--tp-good);
}
.trust-page .node h3 {
  font-size: 18px;
  margin-bottom: 6px;
  color: var(--tp-text);
  font-weight: 700;
}
.trust-page .node h3 a {
  color: inherit;
}
.trust-page .node p {
  font-size: 14px;
  color: var(--tp-muted);
}
.trust-page .verdicts {
  display: flex;
  flex-direction: column;
  gap: 10px;
  justify-content: center;
}
.trust-page .verdicts .v {
  border-radius: 10px;
  padding: 10px 14px;
  font-weight: 700;
  font-size: 14px;
}
.trust-page .verdicts .v small {
  display: block;
  font-weight: 400;
  font-size: 12px;
  margin-top: 3px;
  opacity: 0.85;
  line-height: 1.35;
}
.trust-page .v.a {
  background: var(--tp-act-dim);
  border: 1px solid var(--tp-act);
  color: var(--tp-act);
}
.trust-page .v.b {
  background: var(--tp-ext-dim);
  border: 1px solid var(--tp-ext);
  color: var(--tp-ext);
}
.trust-page .agree {
  margin-top: 20px;
  font-size: 15.5px;
  color: var(--tp-muted);
}
.trust-page .agree strong {
  color: var(--tp-text);
}
.trust-page .traps {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
  margin-top: 28px;
}
.trust-page .trap {
  background: var(--tp-panel);
  border: 1px solid var(--tp-line);
  border-radius: 14px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.trust-page .trap .name {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: var(--tp-muted);
}
.trust-page .trap .what {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--tp-text);
}
.trust-page .chip {
  align-self: flex-start;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 4px 11px;
  border-radius: 999px;
}
.trust-page .chip.held {
  background: var(--tp-good-dim);
  color: var(--tp-good);
  border: 1px solid var(--tp-good);
}
.trust-page .chip.caught {
  background: var(--tp-bad-dim);
  color: var(--tp-bad);
  border: 1px solid var(--tp-bad);
}
.trust-page .trap.more {
  justify-content: center;
  align-items: center;
  border-style: dashed;
}
.trust-page .trap.more .what {
  color: var(--tp-muted);
  text-align: center;
  font-weight: 600;
}
.trust-page .bugcard {
  margin-top: 24px;
  background: linear-gradient(90deg, var(--tp-bad-dim), var(--tp-good-dim));
  border: 1px solid var(--tp-line);
  border-radius: 14px;
  padding: 20px 22px;
}
.trust-page .bugcard h3 {
  font-size: clamp(18px, 2.2vw, 22px);
  margin-bottom: 8px;
  color: var(--tp-text);
  font-weight: 800;
}
.trust-page .bugcard h3 .bad {
  color: var(--tp-bad);
}
.trust-page .bugcard h3 .good {
  color: var(--tp-good);
}
.trust-page .bugcard p {
  color: var(--tp-muted);
  max-width: 70ch;
  font-size: 14.5px;
}
.trust-page .disputes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
  margin-top: 28px;
}
.trust-page .dis {
  background: var(--tp-panel);
  border: 1px solid var(--tp-line);
  border-radius: 14px;
  padding: 20px;
}
.trust-page .dis .who {
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--tp-muted);
  margin-bottom: 10px;
}
.trust-page .dis .grade {
  font-weight: 900;
  font-size: 30px;
  margin: 6px 0 10px;
}
.trust-page .grade .from {
  color: var(--tp-bad);
}
.trust-page .grade .to {
  color: var(--tp-good);
}
.trust-page .grade .arrow {
  color: var(--tp-muted);
  font-size: 22px;
  font-weight: 400;
}
.trust-page .grade .right {
  color: var(--tp-good);
  font-size: 24px;
}
.trust-page .dis p {
  font-size: 14px;
  color: var(--tp-muted);
}
.trust-page .timeline {
  margin-top: 30px;
  display: flex;
  flex-direction: column;
}
.trust-page .tl {
  display: grid;
  grid-template-columns: 100px 16px 1fr;
  gap: 0 16px;
  align-items: start;
}
.trust-page .tl .ver {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  color: var(--tp-act);
  font-weight: 600;
  padding-top: 2px;
  text-align: right;
}
.trust-page .tl .rail {
  position: relative;
  display: flex;
  justify-content: center;
}
.trust-page .tl .rail::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--tp-line);
}
.trust-page .tl .dot {
  position: relative;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--tp-good);
  margin-top: 5px;
  border: 2px solid var(--surface-card);
}
.trust-page .tl:nth-child(odd) .dot {
  background: var(--tp-act);
}
.trust-page .tl .body {
  padding: 0 0 24px;
}
.trust-page .tl .body b {
  font-size: 16px;
  color: var(--tp-text);
}
.trust-page .tl .body span {
  display: block;
  color: var(--tp-muted);
  font-size: 14px;
  margin-top: 2px;
  max-width: 66ch;
}
.trust-page .checks {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 12px;
  margin-top: 28px;
}
.trust-page .check {
  background: var(--tp-panel);
  border: 1px solid var(--tp-line);
  border-radius: 14px;
  padding: 20px;
}
.trust-page .check .big {
  font-weight: 900;
  font-size: 19px;
  color: var(--tp-good);
  margin-bottom: 8px;
}
.trust-page .check p {
  font-size: 14px;
  color: var(--tp-muted);
}
.trust-page .finalline {
  margin-top: 34px;
  font-size: clamp(19px, 2.8vw, 26px);
}
.trust-page .finalline .good {
  color: var(--tp-good);
}
.trust-page a {
  color: var(--tp-act);
}
@media (max-width: 560px) {
  .trust-page .tl {
    grid-template-columns: 64px 14px 1fr;
  }
  .trust-page .tl .ver {
    font-size: 11px;
  }
}
</style>
