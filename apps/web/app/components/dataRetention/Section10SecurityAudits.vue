<template>
    <!-- 10. Security audits -->
    <section id="security-audits" class="scroll-mt-8">
      <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
        10. Security audit history (red/blue team reviews)
      </h2>

      <!-- Plain-language explainer for non-technical readers -->
      <div
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6 mb-5"
      >
        <h3 class="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
          What is a red/blue team audit, in plain language?
        </h3>
        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">
          Imagine the tool is a bank vault. <strong>The red team</strong> plays the role of someone
          trying to break in — looking for unlocked doors, weak walls, or ways to trick the guards.
          They aren't actually attackers; they're security-minded reviewers who deliberately think
          like attackers. <strong>The blue team</strong> plays the defenders — documenting every
          lock, alarm, and procedure that's supposed to keep the vault safe.
        </p>
        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">
          A red/blue team audit is when both teams sit down together — often the same person playing
          both roles — and systematically work through everything that could go wrong:
          <em
            >"What if someone uploads a poisoned file?" "What if two people try to download the same
            thing at once?" "What if the server runs out of memory mid-job?"</em
          >
          For each scenario, they identify whether existing protections are adequate, what could
          fail, and how to fix it.
        </p>
        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">
          The output is a list of <strong>findings</strong>, each rated by severity:
        </p>
        <ul
          class="space-y-1.5 text-sm text-[var(--text-secondary)] list-disc list-inside ml-2 mb-3"
        >
          <li>
            <strong>P0 — critical:</strong> the system is broken right now and users are exposed.
            Must be fixed immediately, before any release.
          </li>
          <li>
            <strong>P1 — serious:</strong> a real vulnerability that could be exploited. Must be
            fixed before the upcoming release.
          </li>
          <li>
            <strong>P2 — moderate:</strong> a real concern, but its impact is bounded by other
            protections. Documented; sometimes accepted as a known limitation if mitigation is in
            place.
          </li>
          <li>
            <strong>P3 — minor:</strong> a small concern or theoretical risk. Tracked; addressed
            when convenient.
          </li>
        </ul>
        <p class="text-sm text-[var(--text-secondary)] leading-relaxed">
          <strong>Why this matters for compliance:</strong> ADA Title II, Illinois IITAA 2.1, and
          most state-agency procurement standards require a "reasonable" level of security. A
          documented red/blue team audit before each release is concrete evidence of due diligence —
          it demonstrates that the development team didn't just hope nothing would go wrong, they
          systematically checked. For an external auditor, this section IS the documentation of that
          diligence.
        </p>
      </div>

      <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
        Audit entries below are in reverse-chronological order (most recent first). Each entry lists
        the findings discovered during that release's review and what was done about them.
      </p>

      <!-- v1.34.0 audit entry -->
      <article
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6 mb-4"
      >
        <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
          <h3 class="text-lg font-bold text-[var(--text-heading)]">v1.34.0</h3>
          <span class="text-xs text-[var(--text-muted)]">
            Audited <strong>2026-07-12</strong> · scope: five preventive hardening measures
            covering file uploads, sign-out, and auto-remediation status pages, alongside an
            internal code reorganization and a new automated test/quality pipeline.
          </span>
        </header>
        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          This release adds five defensive improvements identified during a routine internal
          review of the whole application.
          <strong
            >None of them close a hole that was ever actually used against the tool — think of it
            as adding a second lock to a door that already had one, not replacing a broken
            lock.</strong
          >
          The same review also reorganized how the audit engine's code is packaged internally (no
          change to what it checks, how it scores, or what data it collects) and added an
          automated pipeline that runs the full test suite, a code-style check, and a
          type-correctness check on every change pushed to the repository — so future
          changes are checked automatically going forward, not only when someone remembers to run
          the tests by hand.
        </p>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
          What changed for an auditor reading this page
        </h4>
        <ul class="space-y-3 text-sm text-[var(--text-secondary)] mb-4">
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-sky-700/30 text-sky-200 mr-2"
                >Hardened</span
              >
              Stricter limits on compressed Word, PowerPoint, and Excel files</strong
            >
            — These files are compressed bundles of smaller pieces. The tool now checks, before it
            opens any of those pieces, how many there are and how large they would add up to be
            once uncompressed, and refuses a bundle that crosses a safe ceiling. This closes a gap
            the per-piece checks already in place (added when Word, PowerPoint, and Excel auditing
            first shipped) didn't cover on their own: a bundle made of an extreme number of small
            pieces, or one whose pieces add up to an extreme total.
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-sky-700/30 text-sky-200 mr-2"
                >Hardened</span
              >
              Refusal of a risky, never-legitimately-used document feature</strong
            >
            — Word, PowerPoint, and Excel files are built internally from a markup language that
            has a handful of advanced features no ordinary document ever needs, but that a
            booby-trapped file could misuse to make the reading process balloon in memory or reach
            outside the file. The tool now recognizes this specific feature on sight and treats
            that piece of the file as empty rather than processing it. Genuine Word, PowerPoint,
            and Excel exports never use it, so no ordinary file is affected.
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-sky-700/30 text-sky-200 mr-2"
                >Hardened</span
              >
              Signing out now fully ends your session on the server, not just in your browser</strong
            >
            — Previously, clicking sign-out cleared your browser's copy of your sign-in
            credential, but if a copy of that credential had ever been captured some other way, it
            would technically have remained usable until it expired on its own. The server now
            keeps a short record of every sign-out and immediately rejects that exact credential if
            it is ever presented again, so sign-out is final the moment you click it. (Sessions
            that began before this change shipped aren't covered by this new check, but they still
            expire on their own normal schedule, same as always.)
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-sky-700/30 text-sky-200 mr-2"
                >Hardened</span
              >
              Auto-remediation status pages now require your job's private link</strong
            >
            — When you start an auto-remediation job without signing in, checking that job's
            progress or its completion receipt now requires the same private, single-use address
            you were given when the job started. Anyone without it is told the job doesn't exist,
            rather than being able to check on it by guessing or reusing an identifier.
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-sky-700/30 text-sky-200 mr-2"
                >Hardened</span
              >
              Safer, more reliable database upgrades</strong
            >
            — Every update to the tool that changes the internal database's structure is now
            numbered and recorded, so the server always knows exactly which structural updates a
            given installation has already received and applies only the ones it's missing, in
            order, automatically — including on the existing production database. This replaces a
            less formal check-before-change approach and removes a way a future update could have
            been skipped or mistakenly reapplied.
          </li>
        </ul>
        <p class="text-sm text-[var(--text-secondary)] leading-relaxed">
          <strong>No change to what data is collected or how long it is kept.</strong>
          Files are still processed in memory and discarded in seconds, exactly as before. The full
          technical write-up is in the project's README security section.
        </p>
      </article>

      <!-- v1.33.0 audit entry -->
      <article
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6 mb-4"
      >
        <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
          <h3 class="text-lg font-bold text-[var(--text-heading)]">v1.33.0</h3>
          <span class="text-xs text-[var(--text-muted)]">
            Audited <strong>2026-07-03</strong> · scope: the new PowerPoint (.pptx) and Excel
            (.xlsx) audit features — a fresh, independent three-team red/blue review of everything a
            malicious Office file could try to do to the server.
          </span>
        </header>
        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          v1.33.0 extends the tool to audit PowerPoint and Excel files, not just PDF and Word.
          Because these are also user-supplied files the server has to open and parse, this release
          got the same treatment as the earlier Word rollout: three independent reviews — covering
          server overload, hidden malicious content, and ways the scoring or access rules could be
          tricked — deliberately tried to break it with poisoned, oversized, and malformed files.
          <strong
            >Everything the reviews found was fixed and covered by a new automated test before this
            release shipped.</strong
          >
        </p>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
          What changed for an auditor reading this page
        </h4>
        <ul class="space-y-3 text-sm text-[var(--text-secondary)] mb-4">
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-emerald-700/30 text-emerald-200 mr-2"
                >Fixed</span
              >
              Tighter limits on how much work a booby-trapped slide deck or spreadsheet can
              force</strong
            >
            — A PowerPoint or Excel file can bury thousands of objects several layers deep, or pair
            a small file with a few oversized embedded pictures, to make the server do far more work
            than the file's size suggests. The tool now counts that work — shapes, text, and cells
            at every nesting depth, and the running byte size of embedded pictures — and stops as
            soon as a safe limit is crossed, instead of after the damage is already done.
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-sky-700/30 text-sky-200 mr-2"
                >Hardened</span
              >
              PowerPoint and Excel files are now analyzed in a separate, cancellable process</strong
            >
            — Previously, a pathological file could tie up the same in-process worker used for
            everything else; if analysis ran past its time limit, the work kept running in the
            background instead of truly stopping. Word, PowerPoint, and Excel files are now analyzed
            in their own short-lived process that the server can immediately and completely cancel
            the moment the time limit is reached.
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-emerald-700/30 text-emerald-200 mr-2"
                >Fixed</span
              >
              Uploaded-file processing can no longer see the server's own passwords and keys</strong
            >
            — Every helper program the server hands an uploaded file to (for PowerPoint/Excel/Word
            analysis, for PDF repair, and for auto-remediation) now runs with the server's login
            secrets, API keys, and mail credentials stripped from its environment — so even a fully
            compromised helper process has nothing worth stealing.
          </li>
        </ul>
        <p class="text-sm text-[var(--text-secondary)] leading-relaxed">
          <strong>No change to what data is collected or how long it is kept.</strong>
          PowerPoint and Excel files are processed in memory and discarded in seconds, exactly like
          PDF and Word; nothing new is stored or transmitted. The full technical write-up is in the
          project's README security section.
        </p>
      </article>

      <!-- v1.32.0 audit entry -->
      <article
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6 mb-4"
      >
        <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
          <h3 class="text-lg font-bold text-[var(--text-heading)]">v1.32.0</h3>
          <span class="text-xs text-[var(--text-muted)]">
            Audited <strong>2026-07-02</strong> · scope: a follow-up red/blue team review of a round
            of internal code-quality changes, plus a hardening of the website's defenses against
            malicious scripts.
          </span>
        </header>
        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          This release reorganized how the tool is built internally (no change to what it checks or
          how it scores). Because that touched the pages that display a saved, shareable report, an
          independent review went back over them. It found — and this release
          <strong>fixes</strong> — a way that someone could craft a booby-trapped shareable report
          link so that a "helpful link" on it ran a hidden script in the viewer's browser. That has
          been closed at three levels: the link address is now checked when the report is saved and
          again when it is shown, and — the bigger, permanent safety net — the website now tells the
          browser to <strong>refuse any script that wasn't part of the original page</strong>, so
          this whole category of attack is blocked even if a new bug were introduced later.
        </p>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
          What changed for an auditor reading this page
        </h4>
        <ul class="space-y-3 text-sm text-[var(--text-secondary)] mb-4">
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-emerald-700/30 text-emerald-200 mr-2"
                >Fixed</span
              >
              Malicious "helpful links" on shared reports</strong
            >
            — A shareable report link could be hand-crafted so that a link on it, once clicked, ran
            a hidden script instead of opening a web page. Link addresses on saved reports are now
            verified to be ordinary web (http/https) addresses both when the report is saved and
            when it is displayed, so a disguised script address is dropped.
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-emerald-700/30 text-emerald-200 mr-2"
                >Fixed</span
              >
              Deliberately broken report links no longer knock out the page</strong
            >
            — A hand-crafted, malformed report link could make the shared-report page fail to load.
            The page now handles missing or malformed pieces gracefully instead of erroring.
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-sky-700/30 text-sky-200 mr-2"
                >Hardened</span
              >
              The browser now blocks any un-approved script</strong
            >
            — The website's Content-Security-Policy was tightened so the browser will only run the
            scripts that are genuinely part of each page (each one carries a fresh, one-time stamp).
            Any injected or inline script — the main tool of this kind of attack — is refused
            outright, regardless of any future bug.
          </li>
        </ul>
        <p class="text-sm text-[var(--text-secondary)] leading-relaxed">
          <strong>No change to what data is collected or how long it is kept.</strong>
          These are display-and-safety changes only; uploaded files are still processed in memory
          and discarded in seconds. The full technical write-up is in the project's README security
          section.
        </p>
      </article>

      <!-- v1.30.0 audit entry -->
      <article
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6 mb-4"
      >
        <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
          <h3 class="text-lg font-bold text-[var(--text-heading)]">v1.30.0</h3>
          <span class="text-xs text-[var(--text-muted)]">
            Audited <strong>2026-07-01</strong> · scope: the new Microsoft Word (.docx) audit
            feature — a fresh, independent red/blue team review of everything a malicious Word file
            could try to do to the server.
          </span>
        </header>
        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          This release adds the ability to audit Word (.docx) files, not just PDFs. Because a Word
          file is really a compressed bundle the server has to open and read, three independent
          reviews deliberately tried to break it — by feeding it poisoned, oversized, or malformed
          files. The good news up front:
          <strong
            >the most serious risk (tricking the tool into showing malicious content to another
            person) was already fully blocked</strong
          >, because the tool escapes every piece of text taken from an uploaded document before it
          is ever displayed. Everything the review found was a way to overload the server, and
          <strong>all of it was fixed before this release</strong>.
        </p>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
          What changed for an auditor reading this page
        </h4>
        <ul class="space-y-3 text-sm text-[var(--text-secondary)] mb-4">
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-emerald-700/30 text-emerald-200 mr-2"
                >Fixed</span
              >
              Protection against "zip-bomb" Word files</strong
            >
            — A tiny Word file can be crafted to expand into gigabytes when opened, to exhaust the
            server's memory. The tool now measures each part as it opens it and stops immediately if
            it grows past a safe limit, so a booby-trapped file is rejected instead of crashing the
            service.
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-emerald-700/30 text-emerald-200 mr-2"
                >Fixed</span
              >
              Word files now share the same workload limits as PDFs</strong
            >
            — Word audits run through the same "two at a time" queue and the same hard time limit
            that PDF audits already used, so no single upload (or flood of uploads) can starve the
            server of resources.
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-emerald-700/30 text-emerald-200 mr-2"
                >Fixed</span
              >
              Stricter handling of downloaded reports and error messages</strong
            >
            — The downloadable HTML report now escapes every value it shows (including scores and
            grades), and the audit-by-web-address feature no longer includes raw internal error text
            in its response.
          </li>
        </ul>
        <p class="text-sm text-[var(--text-secondary)] leading-relaxed">
          <strong>No change to what data is collected or how long it is kept.</strong>
          Word files are processed in memory and discarded in seconds, exactly like PDFs; nothing
          new is stored or transmitted. The full technical write-up is in the project's README
          security section.
        </p>
      </article>

      <!-- v1.29.0 audit entry -->
      <article
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6 mb-4"
      >
        <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
          <h3 class="text-lg font-bold text-[var(--text-heading)]">v1.29.0</h3>
          <span class="text-xs text-[var(--text-muted)]">
            <strong>2026-06-27</strong> · scope: how often the tool will accept automated audit
            requests, and an optional access key for a trusted partner system. Reviewed for
            security; no change to what data is collected or how long it is kept.
          </span>
        </header>
        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">
          v1.29.0 tightens the limit on how many audits an anonymous visitor can request per hour —
          back down from a temporary increase used during a large internal audit campaign — so the
          public tool can't be hammered with thousands of automated requests an hour. A trusted
          ICJIA system can present a secret access key to get a higher limit and to check ICJIA
          pages that live on non-Illinois web addresses.
        </p>
        <p class="text-sm text-[var(--text-secondary)] leading-relaxed">
          <strong>No data is collected, stored, transmitted, or retained any differently</strong>;
          no retention window changed. The access key only raises rate limits and widens which web
          addresses can be checked — it never lets anyone reach internal or private systems (those
          stay blocked for everyone), and it is held only as a server environment secret, never in
          the database or in any report.
        </p>
      </article>

      <!-- v1.28.1 audit entry -->
      <article
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6 mb-4"
      >
        <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
          <h3 class="text-lg font-bold text-[var(--text-heading)]">v1.28.1</h3>
          <span class="text-xs text-[var(--text-muted)]">
            <strong>2026-06-10</strong> · scope: a small fix to make a loading spinner icon appear.
            No security review was required — nothing about data handling changed.
          </span>
        </header>
        <p class="text-sm text-[var(--text-secondary)] leading-relaxed">
          v1.28.1 restores a loading-spinner icon that was failing to load on the auto-remediation
          screen.
          <strong>No data is collected, stored, transmitted, or retained any differently</strong>;
          no retention window, endpoint, or permission changed.
        </p>
      </article>

      <!-- v1.28.0 audit entry -->
      <article
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6 mb-4"
      >
        <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
          <h3 class="text-lg font-bold text-[var(--text-heading)]">v1.28.0</h3>
          <span class="text-xs text-[var(--text-muted)]">
            <strong>2026-06-10</strong> · scope: front-end performance and a change to one export
            format. No security review was required — nothing about data handling changed.
          </span>
        </header>
        <p class="text-sm text-[var(--text-secondary)] leading-relaxed">
          v1.28.0 replaces the Microsoft Word download with a plain-text download and makes the
          explanatory diagrams load faster, by removing two large code libraries from the website.
          <strong>No data is collected, stored, transmitted, or retained any differently</strong>;
          no retention window, endpoint, or permission changed. Your audited files are still held in
          memory only and discarded in seconds.
        </p>
      </article>

      <!-- v1.27.0 audit entry -->
      <article
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6 mb-4"
      >
        <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
          <h3 class="text-lg font-bold text-[var(--text-heading)]">v1.27.0</h3>
          <span class="text-xs text-[var(--text-muted)]">
            Audited <strong>2026-06-10</strong> · scope: a full, independent red-team security
            review of the entire application — the website, the server, the audit pipeline, and the
            optional auto-remediation pipeline.
          </span>
        </header>

        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          A comprehensive adversarial security audit was performed across the whole application. It
          found
          <strong>no critical issue and no way for one user to reach another user's data</strong>:
          the high-impact vulnerability classes (database injection, command injection, file-path
          escape, cross-site scripting, and login bypass) were each tested and verified clean. The
          items found were hardening against denial-of-service and against future misconfiguration,
          and <strong>all of them were fixed in this release</strong>.
        </p>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
          What changed for an auditor reading this page
        </h4>
        <ul class="space-y-3 text-sm text-[var(--text-secondary)] mb-4">
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-emerald-700/30 text-emerald-200 mr-2"
                >Fixed</span
              >
              Stronger protection against server-side request abuse</strong
            >
            — The feature that checks a web page's accessibility now strictly confirms, on every
            request the page makes, that it is only reaching approved public addresses — never an
            internal or cloud-metadata address. Verified to still load legitimate state-government
            pages normally.
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-emerald-700/30 text-emerald-200 mr-2"
                >Fixed</span
              >
              Hard time limits on document processing</strong
            >
            — The audit and remediation steps now have enforced time limits and will cleanly stop a
            document that is deliberately crafted to run forever, so one upload can't degrade the
            service for everyone.
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2"
                >API</span
              >
              Additional safe-by-default protections</strong
            >
            — Stricter browser security headers on the website, a fail-safe refusal to start if the
            login secret is ever misconfigured, removal of the sharer's email from public share
            links, and several smaller defensive fixes. No code path that stores, transmits, or
            retains your data changed; no retention window, endpoint, or permission changed.
          </li>
        </ul>
      </article>

      <!-- v1.26.1 audit entry -->
      <article
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6 mb-4"
      >
        <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
          <h3 class="text-lg font-bold text-[var(--text-heading)]">v1.26.1</h3>
          <span class="text-xs text-[var(--text-muted)]">
            Audited <strong>2026-06-10</strong> · scope: follow-up fixes to v1.26.0 — the
            auto-remediation intake, one title-quality check, and a missing interface icon. No
            security review was required — nothing about data handling changed.
          </span>
        </header>

        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          v1.26.1 lets auto-remediation accept documents with minor, repairable file defects
          (previously these failed immediately, even though they are exactly the files remediation
          is for), flags machine-generated download filenames used as document titles so they are
          not mistaken for real titles, and restores the loading spinner icon. No security-relevant
          behavior changed.
        </p>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
          What changed for an auditor reading this page
        </h4>
        <ul class="space-y-3 text-sm text-[var(--text-secondary)] mb-4">
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-700/30 text-amber-200 mr-2"
                >Note</span
              >
              Remediation accepts repairable files</strong
            >
            — A document with a small file defect is repaired during intake instead of being
            rejected, matching how the audit itself reads such files since v1.26.0.
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-700/30 text-amber-200 mr-2"
                >Note</span
              >
              Filename titles are called out</strong
            >
            — A title like "Report-210525T15080148" (a download filename) now earns partial credit
            with a note to write a real title; short legitimate titles like "COVID-19" are
            unaffected. Some documents' Title &amp; Language score may move slightly.
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2"
                >API</span
              >
              No new data and no new attack surface</strong
            >
            — The remediation change reads a status code and a file the tool already wrote inside
            the job's own working folder; the icon fix bundles an image set at build time. No
            endpoint, retention window, or permission changed.
          </li>
        </ul>
      </article>

      <!-- v1.26.0 audit entry -->
      <article
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6 mb-4"
      >
        <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
          <h3 class="text-lg font-bold text-[var(--text-heading)]">v1.26.0</h3>
          <span class="text-xs text-[var(--text-muted)]">
            Audited <strong>2026-06-10</strong> · scope: accuracy fixes across the PDF analysis
            engine — how the document file is read, how tables, forms, lists, and titles are judged,
            and when the report may claim a confirmed WCAG failure. No security review was required
            — nothing about data handling changed.
          </span>
        </header>

        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          v1.26.0 corrects cases where the audit reported things that were not true about a
          document. The most important: a PDF with a minor, repairable file defect (common in older
          or re-saved documents) was scored as if it had no accessibility tagging at all — the
          identical document could score 100 or 42 depending on that one defect. The release also
          stops several false alarms, closes a detection gap, and re-verifies every "How to fix"
          instruction against Adobe's current documentation. An independent code review was
          completed before release.
        </p>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
          What changed for an auditor reading this page
        </h4>
        <ul class="space-y-3 text-sm text-[var(--text-secondary)] mb-4">
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-700/30 text-amber-200 mr-2"
                >Note</span
              >
              Slightly damaged files are now read correctly</strong
            >
            — A document with a small, automatically repairable file defect is no longer falsely
            reported as untagged. Some previously low scores on tagged documents will rise to
            reflect their real structure.
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-700/30 text-amber-200 mr-2"
                >Note</span
              >
              False alarms removed</strong
            >
            — A multiple-choice (radio button) question no longer counts as several unlabeled form
            fields; tables with merged cells are no longer flagged as irregular; one-word document
            titles ("Budget2024") are no longer treated as missing; lists without a separate bullet
            label are no longer failed; and a table nested inside another is no longer counted
            twice.
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-700/30 text-amber-200 mr-2"
                >Note</span
              >
              "Confirmed failure" now means measured, not guessed</strong
            >
            — The conformance verdict only claims a reading-order failure when the tool actually
            measured the tag order against the visual order, and only claims a missing title when
            the document truly has none.
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2"
                >API</span
              >
              No new data and no new attack surface</strong
            >
            — Every fix reads output the analysis tools already produced for the same document. No
            code path that stores, transmits, or retains data changed; no endpoint, retention
            window, or permission changed.
          </li>
        </ul>
      </article>

      <!-- v1.25.0 audit entry -->
      <article
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6 mb-4"
      >
        <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
          <h3 class="text-lg font-bold text-[var(--text-heading)]">v1.25.0</h3>
          <span class="text-xs text-[var(--text-muted)]">
            Audited <strong>2026-06-05</strong> · scope: PDF/UA + artifact + font detection fixes,
            link and reading-order scoring calibration, and a new PDF/UA-1 conformance-signals
            panel. No security review was required — nothing about data handling changed.
          </span>
        </header>

        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          v1.25.0 corrects how the audit reads three signals it had been reporting incorrectly (the
          PDF/UA identifier, artifact tagging, and embedded Type3 fonts), softens two score rules to
          match WCAG and PAC (a visible web address used as link text is no longer treated as a
          failure; an essentially-correct reading order is no longer docked for a tiny measurement
          difference), and adds a panel summarizing the document's PDF/UA-1 signals. No
          security-relevant behavior changed.
        </p>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
          What changed for an auditor reading this page
        </h4>
        <ul class="space-y-3 text-sm text-[var(--text-secondary)] mb-4">
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-700/30 text-amber-200 mr-2"
                >Note</span
              >
              More accurate findings</strong
            >
            — The report no longer claims a PDF/UA-tagged file "has no PDF/UA identifier" or "no
            artifact tags," and it no longer flags embedded Type3 fonts as missing. These were
            wording/display errors; document scores were not affected by them.
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-700/30 text-amber-200 mr-2"
                >Note</span
              >
              Two score rules relaxed</strong
            >
            — A link whose visible text is a full web address now counts as acceptable (it tells the
            reader where it goes), and a document whose reading order is essentially correct is no
            longer docked for a 1–2% measurement difference. Some documents score slightly higher.
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2"
                >API</span
              >
              No new data and no new attack surface</strong
            >
            — The fixes read data the analyzers already produced; the new PDF/UA-1 panel displays
            values already computed during the audit. No code path, endpoint, retention window, or
            data-handling behavior changed.
          </li>
        </ul>
      </article>

      <!-- v1.24.0 audit entry -->
      <article
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6 mb-4"
      >
        <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
          <h3 class="text-lg font-bold text-[var(--text-heading)]">v1.24.0</h3>
          <span class="text-xs text-[var(--text-muted)]">
            Audited <strong>2026-06-03</strong> · scope: WCAG 2.2 re-anchor, IITAA 2.1 citations,
            announcement banner, and a new /wcag-2-2 page. No security review was required — nothing
            about data handling changed.
          </span>
        </header>

        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          v1.24.0 re-anchors the displayed standard to WCAG 2.2 Level AA, a superset of the WCAG 2.1
          AA that IITAA 2.1 (§E205.4) and ADA Title II require. No automated check changed and no
          score weight changed; the new 2.2 criteria are interactive/manual and are shown as "not
          assessed — manual review" (only for documents with interactive form fields). The audit can
          be reverted to WCAG 2.1 by an administrator via the WCAG_VERSION environment setting. No
          security-relevant behavior changed.
        </p>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
          What changed for an auditor reading this page
        </h4>
        <ul class="space-y-3 text-sm text-[var(--text-secondary)] mb-4">
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-700/30 text-amber-200 mr-2"
                >Note</span
              >
              WCAG 2.2 Level AA is now the displayed standard</strong
            >
            — The audit labels, conformance verdict, exports, and UI copy all reference WCAG 2.2 AA
            (a strict superset of WCAG 2.1 AA). New 2.2 criteria are shown as "not assessed — manual
            review" rather than pass or fail. WCAG 2.1 AA remains the legal minimum under IITAA 2.1
            §E205.4 and ADA Title II; WCAG 2.2 is the newer, stricter version.
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-700/30 text-amber-200 mr-2"
                >Note</span
              >
              IITAA 2.1 cited throughout</strong
            >
            — Illinois IITAA 2.1 is now cited alongside WCAG and ADA Title II across the homepage,
            footer, conformance box, exports, and meta. This page's §1 description and the
            compliance-explainer in §10 have been updated to include "IITAA 2.1".
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2"
                >API</span
              >
              No new data and no new attack surface</strong
            >
            — All changes are presentational. No code path, endpoint, or data-handling behavior
            changed; every defensive control from prior releases remains in force. The WCAG_VERSION
            env flag controls text and criteria display only.
          </li>
        </ul>
      </article>

      <!-- v1.22.3 audit entry -->
      <article
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6 mb-4"
      >
        <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
          <h3 class="text-lg font-bold text-[var(--text-heading)]">v1.22.3</h3>
          <span class="text-xs text-[var(--text-muted)]">
            Audited <strong>2026-05-22</strong> · scope: a scoring-engine cleanup — a more honest
            summary, a rounding fix, and removal of dead code. No security review was required;
            nothing about data handling changed.
          </span>
        </header>

        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          v1.22.3 refines how the audit is scored and explained. It does not change what the audit
          collects, where it is stored, or how long it is kept. No new endpoints, no authentication
          change, no retention change, no new attack surface.
        </p>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
          What changed for an auditor reading this page
        </h4>
        <ul class="space-y-3 text-sm text-[var(--text-secondary)] mb-4">
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-700/30 text-amber-200 mr-2"
                >Note</span
              >
              A more honest plain-language summary</strong
            >
            — The summary shown with the score now takes the WCAG conformance verdict into account.
            Previously a document could be summarised as "strong" while the verdict box separately
            reported a failure; a confirmed failure is now reflected in the summary as well.
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-700/30 text-amber-200 mr-2"
                >Note</span
              >
              A category one item short can no longer look perfect</strong
            >
            — Category scores for alt text, links, and form fields are now rounded down. A document
            missing one item out of many — for example one image without alternative text — can no
            longer round up to a flawless score; it now scores just below 100, so the report never
            implies a category is issue-free when it is not.
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2"
                >API</span
              >
              Dead code removed; no new attack surface</strong
            >
            — About 170 lines of unreachable scoring code were deleted. This release is internal
            computation only — no code path, endpoint, or data-handling behaviour changed, and every
            defensive control from prior releases remains in force.
          </li>
        </ul>
      </article>

      <!-- v1.22.2 audit entry -->
      <article
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6 mb-4"
      >
        <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
          <h3 class="text-lg font-bold text-[var(--text-heading)]">v1.22.2</h3>
          <span class="text-xs text-[var(--text-muted)]">
            Audited <strong>2026-05-22</strong> · scope: one verdict-box heading string and a
            documentation correction. No security review was required — nothing about data handling
            changed.
          </span>
        </header>

        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          v1.22.2 reworks the wording shown in the conformance verdict box when a document does not
          pass, and corrects stale test counts in the project README. It does not change what the
          audit checks, what data is collected, where it is stored, or how long it is kept. No new
          endpoints, no authentication change, no retention change, no new attack surface.
        </p>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
          What changed for an auditor reading this page
        </h4>
        <ul class="space-y-3 text-sm text-[var(--text-secondary)] mb-4">
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-700/30 text-amber-200 mr-2"
                >Note</span
              >
              Clearer next-step wording on a failing document</strong
            >
            — When a document does not pass, the verdict box heading now says it needs "additional
            manual remediation" — a plain signal that automated tooling has done what it can and the
            remaining fixes are hands-on (Adobe Acrobat's Accessibility Checker, or correcting the
            source document and re-exporting).
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2"
                >API</span
              >
              No new data and no new attack surface</strong
            >
            — This release is a copy and documentation change only. No code path, endpoint, or
            data-handling behavior changed; every defensive control from prior releases remains in
            force.
          </li>
        </ul>
      </article>

      <!-- v1.22.1 audit entry -->
      <article
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6 mb-4"
      >
        <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
          <h3 class="text-lg font-bold text-[var(--text-heading)]">v1.22.1</h3>
          <span class="text-xs text-[var(--text-muted)]">
            Audited <strong>2026-05-22</strong> · scope: a wording and presentation change to the
            conformance verdict box. No security review was required — nothing about data handling
            changed.
          </span>
        </header>

        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          v1.22.1 changes how the v1.22.0
          <strong>WCAG conformance verdict</strong> is <em>displayed</em>. It does not change what
          the audit checks, what data is collected, where it is stored, or how long it is kept. No
          new endpoints, no authentication change, no retention change.
        </p>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
          What changed for an auditor reading this page
        </h4>
        <ul class="space-y-3 text-sm text-[var(--text-secondary)] mb-4">
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-700/30 text-amber-200 mr-2"
                >Note</span
              >
              Clearer, less alarming verdict wording</strong
            >
            — When a document scores well (an A or B grade) but still has a flagged accessibility
            issue, the verdict box now explains plainly that WCAG is judged one criterion at a time
            — a single gap is still worth fixing, but a strong grade still means the document is in
            good shape. The box is shown in green for strong documents and red for weak ones; every
            flagged issue is still listed in full, whatever the color.
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-emerald-700/30 text-emerald-200 mr-2"
                >New</span
              >
              Links to the official standards</strong
            >
            — The verdict box now links directly to the published WCAG 2.1, Illinois IITAA, and ADA
            Title II standards, so a reader can check the rules the audit measures against at their
            source.
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2"
                >API</span
              >
              No new data and no new attack surface</strong
            >
            — This release is presentation only. The verdict is still computed from information the
            audit already produced, the downloadable reports are unchanged, and no new information
            is sent or stored anywhere. Every defensive control from prior releases remains in
            force.
          </li>
        </ul>
      </article>

      <!-- v1.22.0 audit entry -->
      <article
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6 mb-4"
      >
        <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
          <h3 class="text-lg font-bold text-[var(--text-heading)]">v1.22.0</h3>
          <span class="text-xs text-[var(--text-muted)]">
            Audited <strong>2026-05-21</strong> · scope: a scoring-methodology release — a new WCAG
            conformance verdict, recalibrated category weights, and clearer labels. Reviewed with an
            adversarial scoring audit, not a red/blue-team security review.
          </span>
        </header>

        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          v1.22.0 changes how the audit is <em>scored and explained</em> — it does not change what
          data is collected, where it is stored, or how long it is kept. No new endpoints, no
          authentication change, no retention change. The headline addition is a plain pass/fail
          <strong>WCAG 2.1 conformance verdict</strong> shown alongside the 0–100 score, because a
          high score is not the same thing as passing WCAG. One correctness bug found during the
          review was fixed before this release was tagged.
        </p>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
          What changed for an auditor reading this page
        </h4>
        <ul class="space-y-3 text-sm text-[var(--text-secondary)] mb-4">
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-emerald-700/30 text-emerald-200 mr-2"
                >New</span
              >
              WCAG conformance verdict</strong
            >
            — Every audit now states plainly whether the document has confirmed failures against
            <strong>WCAG 2.1 Level AA</strong> — the standard the Illinois IITAA and the federal ADA
            Title II rule require. The verdict is separate from the 0–100 score and never claims a
            document is "conformant"; when the automated checks find nothing it says so, and still
            asks for manual review. Each cited rule links to the official W3C explanation.
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2"
                >Fix</span
              >
              No false verdicts on unreadable files</strong
            >
            — The review found that a damaged or password-protected PDF could be handed a fabricated
            "fails WCAG" verdict because the analyzer had not actually been able to read it. That is
            now fixed: an unreadable file honestly reports that no verdict could be determined.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              This was a correctness defect in brand-new code, caught and fixed before tagging — no
              released version ever shipped it.
            </p>
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-700/30 text-amber-200 mr-2"
                >Note</span
              >
              Scores shifted — by design</strong
            >
            — Category weights and some labels were recalibrated to match WCAG conformance levels
            more honestly. As a result, a score produced by v1.22.0 is not directly comparable to a
            score from an earlier version. An audit campaign that spans this upgrade will see
            numbers move; that movement reflects the improved methodology, not a change in the
            documents.
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2"
                >API</span
              >
              No security regressions</strong
            >
            — Every defensive control from prior releases remains in force. No schema migration. The
            conformance verdict is computed from data the audit already produced; the report exports
            gained a verdict section but send no new data anywhere.
          </li>
        </ul>
      </article>

      <!-- v1.21.1 audit entry -->
      <article
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6 mb-4"
      >
        <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
          <h3 class="text-lg font-bold text-[var(--text-heading)]">v1.21.1</h3>
          <span class="text-xs text-[var(--text-muted)]">
            Audited <strong>2026-05-19</strong> · scope: shared-report UI parity with the real-time
            audit page, plus an elevated analyze rate limit for the duration of the in-flight ICJIA
            fleet audit campaign.
          </span>
        </header>

        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          This is a small <strong>follow-up release</strong> to v1.21.0, not a security change.
          v1.21.0 simplified the live audit page by removing the Adobe Acrobat parity panel, but the
          same panel was left in place on the shared-report page (<code class="text-xs font-mono"
            >/report/:id</code
          >) — so two auditors looking at the same content via different URLs ended up seeing two
          different summaries. This release fixes that inconsistency. It also bumps the per-caller
          hourly analyze rate limit to support an in-flight fleet audit pass.
        </p>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
          What changed for an auditor reading this page
        </h4>
        <ul class="space-y-3 text-sm text-[var(--text-secondary)] mb-4">
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-emerald-700/30 text-emerald-200 mr-2"
                >UX</span
              >
              Consistency</strong
            >
            — Shared and saved report pages now show exactly what the live audit page shows. No more
            Acrobat parity panel on
            <code class="text-xs font-mono">/report/:id</code>.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was wrong:</strong> v1.21.0 removed the 32-rule Adobe Acrobat parity card
              from the live audit page in favor of a single WCAG-anchored Strict score, but the same
              card kept rendering on the shared-report page. Auditors comparing notes off a shared
              link saw a presentation that didn't match the live audit, which could read as a
              deliberate difference in scoring.
              <br />
              <strong>What this release does:</strong> the parity-card block was removed from the
              shared-report template. The underlying <em>data</em> is still saved in the database
              (so historic API consumers that already parse it keep working), but it's no longer
              rendered on the page. No schema change. The per-finding "How to Fix in Adobe Acrobat"
              remediation guidance inside each category card is kept — that's per-finding
              remediation advice, not a separate scoring profile, and it appears on the live audit
              page too.
            </p>
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-700/30 text-amber-200 mr-2"
                >OPS</span
              >
              Elevated analyze rate limit for the audit campaign</strong
            >
            — The per-caller hourly analyze rate limit was raised from
            <strong>35/hour</strong> to <strong>5000/hour</strong> for the duration of the in-flight
            ICJIA fleet audit campaign. The ~5000-PDF inventory is being re-audited across multiple
            passes over several days as content is remediated and re-checked, not a single one-shot
            pass. The elevated limit will stay in place for the duration of the campaign and revert
            to a tighter number once it concludes.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>Why this is OK:</strong> the per-caller analyze limit is a fair-use throttle.
              The actual abuse mitigations live on the remediation side — the 100/day remediation
              cap per caller, the 60-minute audit-gate
              <code class="text-xs font-mono">sha256(bytes)</code>
              hash check, the SSRF allowlist, the upload size cap, and the auth gate are all
              unchanged. The audit pipeline does not write user-supplied content to durable storage
              beyond the lightweight <code class="text-xs font-mono">audit_log</code>
              row (no PDF bytes; just metadata).
            </p>
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2"
                >API</span
              >
              No security regressions</strong
            >
            — Every other defensive control from v1.20.1 and v1.21.0 remains in force. No schema
            migration. No change to the authentication layer, the SSRF allowlist, the audit-gate
            hash check, the daily remediation cap, the retention windows, or the URL-fetch posture.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              The two changes in this release are a 5-line UI deletion on the shared-report template
              and a single numeric raise on one rate-limit constant. No other code paths were
              touched.
            </p>
          </li>
        </ul>
      </article>

      <!-- v1.21.0 audit entry -->
      <article
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6 mb-4"
      >
        <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
          <h3 class="text-lg font-bold text-[var(--text-heading)]">v1.21.0</h3>
          <span class="text-xs text-[var(--text-muted)]">
            Audited <strong>2026-05-19</strong> · scope: simplification release. Retired the dual
            Strict/Practical scoring toggle in favor of a single canonical Strict score; promoted
            veraPDF PDF/UA-1 verdict on the remediation result page.
          </span>
        </header>

        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          This release is a <strong>UI simplification</strong>, not a security change. Auditors and
          agency staff consistently reported that the audit page was hard to read because it showed
          two scoring profiles at once — "Strict" and "Practical" — and asked users to choose
          between them. That cognitive load got in the way of the actual accessibility findings.
          After review, the team retired Practical and kept Strict, which is the WCAG 2.1 AA + IITAA
          §E205.4-anchored score that maps directly to Illinois accessibility law. The PDF/UA
          technical conformance signal that Practical tried to summarize is now surfaced more
          authoritatively on the remediation page via a dedicated <em>veraPDF</em> Pass/Fail check.
        </p>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
          What changed for an auditor reading this page
        </h4>
        <ul class="space-y-3 text-sm text-[var(--text-secondary)] mb-4">
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-emerald-700/30 text-emerald-200 mr-2"
                >UX</span
              >
              Simplified</strong
            >
            — The audit results page shows one score, anchored to WCAG and IITAA. No more "view by
            Strict / view by Practical" toggle. The grade you see is the legally-relevant grade.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was wrong:</strong> showing two profiles created an implicit "which one
              is correct?" question for the reader. The Strict view is what Illinois IITAA and the
              ADA point to; the Practical view layered a separate PDF/UA-flavored weighting on top,
              which was useful for tool reconciliation but not for publication decisions.
              <br />
              <strong>What this release does:</strong> the audit page now shows only the Strict /
              WCAG-anchored score. The underlying scoring engine is unchanged — same nine
              categories, same weights, same WCAG-anchored thresholds. Just less noise on the page.
            </p>
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-emerald-700/30 text-emerald-200 mr-2"
                >UX</span
              >
              Promoted</strong
            >
            — The remediation result page now surfaces a clear
            <em>PDF/UA-1: Pass / Fail / Not run</em> badge right next to the post-remediation score.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was wrong:</strong> the veraPDF conformance verdict (an open-source check
              against the published PDF/UA-1 / ISO 14289-1 standard) was already running as part of
              every remediation, but it was buried in a section labeled "Compliance disclaimer"
              further down the result page. Auditors needing the PDF/UA verdict had to scroll.
              <br />
              <strong>What this release does:</strong> a compact Pass/Fail badge appears immediately
              below the score; the detailed section below was renamed to "PDF/UA-1 conformance
              check" so its purpose is obvious; the badge jumps to that section for the full rule
              failure list when failures exist. When veraPDF isn't installed on the server, the
              badge clearly reads <em>"check not run"</em> rather than pretending the check ran
              successfully.
            </p>
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2"
                >API</span
              >
              Compatibility</strong
            >
            — Historical reports and external automation keep working without changes.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was wrong:</strong> a hard removal of the Practical profile would have
              broken the fleet-CSV integration shipped in v1.20.0, which lists both Strict and
              Practical columns per audited PDF.
              <br />
              <strong>What this release does:</strong> the
              <code class="text-xs font-mono">scoreProfiles.remediation</code>
              field and the
              <code class="text-xs font-mono">practical</code> key in the
              <code class="text-xs font-mono">/api/audit-url</code>
              response are kept as <strong>aliases of Strict</strong> — same number, same grade.
              External CSV consumers see both columns populated with the Strict score and don't need
              updates. The alias will be removed in a future release once we've confirmed no
              consumer depends on the values differing.
            </p>
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2"
                >API</span
              >
              No security regressions</strong
            >
            — All SSRF, rate-limit, audit-gate, daily-cap, and retention controls from v1.20.1
            remain in force. The cleanup pass still purges remediation files, jobs, and audit-log
            rows on schedule.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              The simplification is a UI and scoring-presentation change. It does not modify the
              upload pipeline, the authentication layer, the rate limiters, the audit-gate hash
              check, the daily cap, the SSRF protections, or the retention windows.
            </p>
          </li>
        </ul>
      </article>

      <!-- v1.20.1 audit entry -->
      <article
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6 mb-4"
      >
        <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
          <h3 class="text-lg font-bold text-[var(--text-heading)]">v1.20.1</h3>
          <span class="text-xs text-[var(--text-muted)]">
            Audited <strong>2026-05-18</strong> · scope: post-feature red/blue team review of the
            v1.20.0 fleet-integration surface
          </span>
        </header>

        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          This is a dedicated security release that follows the team's standing practice:
          <strong>every feature ships through a fresh red/blue team review before tagging</strong>.
          The v1.20.0 release introduced the fleet-audit-by-URL endpoint; this review examined that
          new surface plus the related existing endpoints, found seven issues worth flagging, and
          fixed all of them before this release was tagged. The purpose of this entry is to document
          those findings so an auditor can see (a) what was looked at, (b) what was discovered, (c)
          what was done about it, and (d) how the team's iterative-review pattern works.
        </p>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
          Findings &amp; what was done
        </h4>
        <ul class="space-y-3 text-sm text-[var(--text-secondary)] mb-4">
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-red-700/30 text-red-200 mr-2"
                >P1</span
              >
              Fixed</strong
            >
            — A DNS-based trick could have let an attacker reach the server's own internal network
            through our URL audit endpoint.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was wrong:</strong> when someone submitted a URL for audit, the tool
              checked whether the <em>hostname</em> matched the allowlist of approved ICJIA domains
              before fetching it. If an attacker could control DNS for any subdomain of an approved
              domain — for example, by compromising a partner agency that operates a subdomain —
              they could point that hostname at the server's loopback address (127.0.0.1) and trick
              us into fetching our own internal services on their behalf.<br />
              <strong>How it was fixed:</strong> the tool now resolves the hostname's IP address
              itself, before fetching, and refuses to connect to any IP in private, loopback,
              link-local, or multicast ranges. The check repeats on every redirect hop so a
              redirector planted on an approved host can't chain us into a private address either.
              The fix covers both IPv4 and IPv6.
            </p>
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-red-700/30 text-red-200 mr-2"
                >P1</span
              >
              Fixed</strong
            >
            — Redirects from approved hosts to private addresses were silently followed.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was wrong:</strong> when the URL audit endpoint encountered an HTTP
              redirect, it followed the chain up to 20 hops without re-checking each hop against the
              allowlist. An attacker who could place content on an approved host could redirect us
              through to an internal address.<br />
              <strong>How it was fixed:</strong> redirects are now handled manually with the full
              allowlist and DNS-IP check on every hop, capped at three redirects total.
            </p>
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-red-700/30 text-red-200 mr-2"
                >P1</span
              >
              Fixed</strong
            >
            — The bulk-inventory endpoint had no allowlist check at all.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was wrong:</strong> caught during the security review while migrating the
              other URL-fetch endpoints. The bulk-inventory endpoint accepts a list of PDF URLs and
              fetches each one. It had its own private fetcher with no allowlist — an authorized
              user could submit a list containing internal addresses and the tool would fetch them.
              Latent since the endpoint shipped, not previously discovered.<br />
              <strong>How it was fixed:</strong> the bulk endpoint now uses the same
              allowlist-plus-private-IP-block plumbing as the other URL endpoints.
            </p>
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-700/30 text-amber-200 mr-2"
                >P2</span
              >
              Fixed</strong
            >
            — In no-login deployments, one user could unlock remediation for content audited by a
            different user.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was wrong:</strong> when the tool is run without requiring login, every
              user is treated as the same "anonymous" identity. The new
              <em>audit-before-remediation</em> check (added in this release — see "Added" below)
              would have matched any anonymous user's audit against any other anonymous user's
              remediation attempt.<br />
              <strong>How it was fixed:</strong> in no-login mode, the identity now includes the
              user's IP address. The production deployment requires login, so this issue never
              affected real users.
            </p>
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-700/30 text-amber-200 mr-2"
                >P2</span
              >
              Fixed</strong
            >
            — The audit-history table grew without limit.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was wrong:</strong> the canonical audit-history table had no retention
              policy. An attacker repeatedly auditing unique files could slowly fill the
              database.<br />
              <strong>How it was fixed:</strong> records older than 365 days are now purged by the
              periodic cleanup sweep, matching the share-link retention window.
            </p>
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-700/30 text-amber-200 mr-2"
                >P2</span
              >
              Fixed</strong
            >
            — A narrow race window let two simultaneous remediation requests both pass the daily
            limit.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was wrong:</strong> the daily-limit check and the actual job-creation
              were two separate steps. Two perfectly-simultaneous requests at the cap boundary could
              both see "you're under the limit" and both proceed.<br />
              <strong>How it was fixed:</strong> the limit check is now repeated as part of the same
              atomic database transaction that creates the job, so the cap can no longer be exceeded
              by even one.
            </p>
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2"
                >P3</span
              >
              Verified clean</strong
            >
            — Browser cookie security flags.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was checked:</strong> the login session cookie is set with the protective
              flags (HttpOnly, Secure, SameSite-Strict) that prevent it from being read by
              client-side scripts, transmitted over plain HTTP, or sent with cross-site requests.<br />
              <strong>Result:</strong> all three flags are correctly set in production. No change
              needed; recorded in this audit trail for completeness.
            </p>
          </li>
        </ul>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
          Also added in this release — driven by the same security thinking
        </h4>
        <ul class="space-y-1 text-sm text-[var(--text-secondary)] list-disc list-inside ml-2">
          <li>
            <strong>Audit required before remediation.</strong> Every request to remediate a PDF
            must be preceded by an audit of the same content within the previous 60 minutes. Any
            audit path counts — direct upload, URL audit, or fleet bulk. This prevents automated
            abuse where someone bypasses the audit pipeline and floods the remediation worker
            directly.
          </li>
          <li>
            <strong>Daily remediation cap.</strong> Up to 100 remediations per caller per 24 hours.
            Sized so a normal agency workflow (~50 PDFs in a busy day) is unaffected, but a flood of
            thousands is blocked.
          </li>
          <li>
            <strong>Unified audit record.</strong> Every audit endpoint now writes a row to the
            canonical audit-history table with the content fingerprint (SHA-256 hash of the file's
            bytes). Required so the audit-before-remediation gate works uniformly across all audit
            paths. The hash is just a fingerprint — it doesn't expose the PDF's contents and can't
            be reversed back into the document.
          </li>
        </ul>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2 mt-4">
          Methodology — for the auditor record
        </h4>
        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-2">
          The team follows a deliberate practice:
          <strong>every feature ships through a fresh red/blue team review before tagging</strong>.
          The review examines the newly-introduced surface from a sophisticated-adversary
          perspective, looks for attack patterns like DNS rebinding, race conditions, identity
          collapse, and slow-burn denial-of-service, and either fixes findings in the same release
          window or documents them for future work. This release (v1.20.1) is the security-followup
          to v1.20.0, which added the fleet-audit-by-URL feature. The pattern repeats with every
          feature release — earlier entries in this audit history list the findings from prior
          reviews.
        </p>
        <p class="text-sm text-[var(--text-secondary)] leading-relaxed">
          For a manager reading this page: the intent here is transparency. The tool is built and
          reviewed iteratively, and this page is the auditor-readable trail of what was reviewed,
          what was found, what was fixed, and what was deliberately accepted with mitigation. The
          technical equivalent (with full code references) lives in
          <code class="font-mono text-xs">README.md § Security</code>
          for engineers and security reviewers who need that level of detail.
        </p>
      </article>

      <!-- v1.20.0 audit entry -->
      <article
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6 mb-4"
      >
        <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
          <h3 class="text-lg font-bold text-[var(--text-heading)]">v1.20.0</h3>
          <span class="text-xs text-[var(--text-muted)]">
            Audited <strong>2026-05-18</strong> · scope: download filename dialog, PDF export,
            accessibility polish
          </span>
        </header>

        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          A feature release with two material auditor-facing changes: remediated PDFs can now be
          downloaded under the
          <em>exact</em> original filename (critical for CMS file replacement, where existing links
          resolve by name), and the audit report can be saved as a PDF using the browser's own print
          dialog. No new data is collected, retained, or transmitted. The retention policy described
          elsewhere on this page is unchanged.
        </p>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
          Findings &amp; changes
        </h4>
        <ul class="space-y-3 text-sm text-[var(--text-secondary)] mb-4">
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2"
                >P3</span
              >
              Changed</strong
            >
            — Remediated PDF download now defaults to the user's exact original filename.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What changed:</strong> when a user remediates a PDF and clicks Download, the
              file is now saved under the same filename they uploaded — including any spaces,
              unicode, or punctuation. The download dialog presents three options with "Keep
              original filename" pre-selected and badged Recommended. The other two ("Add a
              _remediated suffix" or "Use a different filename") are opt-in.<br />
              <strong>Why:</strong> the most common workflow for remediating an agency PDF is to
              replace the file in the CMS in place — every existing link on the website, in old
              emails, in shared documents, keeps working as long as the filename matches. The
              previous behavior automatically appended <em>_remediated</em> to the filename, which
              broke this workflow.<br />
              <strong>Safeguards:</strong> the "use a different filename" path explicitly warns the
              user that the change will break existing links and requires a second click of the
              Download button to confirm. There is no path traversal risk — the custom filename is
              treated only as a display name for the browser's save dialog and is capped, encoded,
              and forced to <code class="text-xs font-mono">.pdf</code>
              before being sent in the response header. The actual file on disk is always located by
              job ID, never by user-supplied filename.
            </p>
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2"
                >P3</span
              >
              Added</strong
            >
            — Audit reports can now be saved as PDF via the browser's print dialog.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What changed:</strong> the audit report page and the shared-report page each
              gained a "PDF (browser print)" button. Clicking it opens the browser's own print
              dialog, where the user picks "Save as PDF" as the destination. The page applies a
              print stylesheet that hides interactive controls, switches to black-on-white text,
              expands collapsed technical sections, and arranges page breaks cleanly.<br />
              <strong>What this does <em>not</em> change:</strong> no new server-side rendering
              happens — the PDF is created entirely by the user's own browser, on the user's own
              machine. No PDF content is transmitted to or stored on our server as part of this
              feature. The chosen filename is whatever the user types in the browser's save dialog
              and is not visible to us.
            </p>
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2"
                >P3</span
              >
              Fixed</strong
            >
            — Accessibility polish on the remediation result page.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What changed:</strong> the result page was showing layout shift after content
              loaded (a known accessibility annoyance for users on slow connections or with
              reduced-motion preferences), and result sections were appearing partway through the
              progress animation rather than after it. Both fixed.<br />
              <strong>Visible improvement:</strong> Lighthouse performance score on the result page
              rose from 84 to 96 on desktop. No retention or privacy implications.
            </p>
          </li>
        </ul>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
          Operational improvements
        </h4>
        <ul class="space-y-1 text-sm text-[var(--text-secondary)] list-disc list-inside ml-2">
          <li>
            New <code class="text-xs font-mono">AGENTS.md</code> at the repository root documents
            the load-bearing conventions for AI coding agents (Claude Code, Codex, Cursor, etc.) so
            engineers using those tools to extend the code base get oriented in one read. Not
            user-facing; reduces the chance of a misconfigured agent committing the wrong thing.
          </li>
          <li>
            The "Technical Details" expandable on the main results page now includes the same four
            pipeline diagrams already on the standalone
            <a
              href="/technical-details"
              class="text-[var(--link)] hover:text-[var(--link-hover)] underline"
              >Technical Details</a
            >
            page.
          </li>
        </ul>
      </article>

      <!-- v1.19.0 audit entry -->
      <article
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6 mb-4"
      >
        <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
          <h3 class="text-lg font-bold text-[var(--text-heading)]">v1.19.0</h3>
          <span class="text-xs text-[var(--text-muted)]">
            Audited <strong>2026-05-18</strong> · scope: fleet integration + accessibility polish +
            retention-policy change
          </span>
        </header>

        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          This release adds the fleet inventory integration (one HTTP call per PDF returns strict +
          practical grades plus a year-long shareable report link), expands the URL allowlist to
          cover all
          <code class="text-xs font-mono">*.illinois.gov</code>
          state-agency subdomains, bumps the shared-report retention window from 15 days to 365
          days, and fixes seven accessibility rule violations across the public policy +
          technical-details pages. The most material policy change for an auditor reading this page
          is the retention bump — see the first finding below.
        </p>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
          Findings &amp; changes
        </h4>
        <ul class="space-y-3 text-sm text-[var(--text-secondary)] mb-4">
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-700/30 text-amber-200 mr-2"
                >P2</span
              >
              Accepted</strong
            >
            — Shared-report retention window extended from 15 days to 365 days.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What changed:</strong> when someone creates a shareable audit-report link
              (either from the web UI's "Create Shareable Link" button or via the new fleet
              audit-by-URL automation), the resulting link now stays valid for one year instead of
              15 days. This applies to the metadata record only — no PDF content is stored alongside
              it. After 365 days the row becomes eligible for the periodic cleanup sweep and the URL
              stops working.<br />
              <strong>Why:</strong> auditors and managers reviewing fleet-inventory reports (which
              list every PDF across ICJIA's sites) need report links that survive between quarterly
              review cycles. A 15-day TTL caused most links to break before the next review even
              happened.<br />
              <strong>Storage cost:</strong> the row holds scores, category findings, and timestamps
              — no PDF bytes. A 100-PDF fleet at roughly 50 KB per record grows the database by
              about 5 MB per year. The tradeoff was evaluated and accepted in favor of usability.
            </p>
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-700/30 text-amber-200 mr-2"
                >P2</span
              >
              Accepted</strong
            >
            — URL allowlist expanded so the fleet automation can audit PDFs across the full Illinois
            state-agency footprint.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What changed:</strong> the audit-by-URL endpoint previously accepted only a
              handful of explicit ICJIA subdomains. It now also accepts:
              <code class="text-xs font-mono">illinois.gov</code> (every state-agency subdomain),
              <code class="text-xs font-mono">icjia.cloud</code>,
              <code class="text-xs font-mono">icjia.app</code>, and
              <code class="text-xs font-mono">ilheals.com</code> (each including all subdomains).<br />
              <strong>Why:</strong> the ICJIA fleet audit lists PDFs across every site the agency
              operates and every partner agency. The previous narrow allowlist couldn't cover that
              fleet.<br />
              <strong>What it doesn't change:</strong> all of the existing protections still apply —
              the server still blocks private / local / loopback addresses (no SSRF into internal
              networks), still rejects oversized files (100 MB cap), still requires the fetched
              bytes to begin with the <code class="text-xs font-mono">%PDF-</code> header, and still
              rejects look-alike domains (a URL like
              <code class="text-xs font-mono">illinois.gov.evil.com</code>
              does <em>not</em> match the allowlist). The threat profile is the same as a person
              pasting any one of these URLs into the web interface.
            </p>
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2"
                >P3</span
              >
              Fixed</strong
            >
            — Seven accessibility rule violations on the public policy and technical-details pages.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was wrong:</strong> a full axe + Lighthouse audit found that the diagram
              boxes on these pages couldn't be reached via keyboard, that an inline link in this
              audit history section was distinguishable only by color (a barrier for colorblind
              readers), and that several scrollable code blocks couldn't be scrolled without a
              mouse.<br />
              <strong>How it was fixed:</strong> each scrollable region is now keyboard-focusable,
              the inline link is now underlined, and the diagram boxes' redundant ARIA labels were
              replaced with proper structural markup. Both pages now score a perfect 100 / 100 on
              both axe (no violations) and Lighthouse's accessibility audit.
            </p>
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2"
                >P3</span
              >
              Fixed</strong
            >
            — The new fleet endpoint reported the strict score in both the strict and practical
            slots of its response.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was wrong:</strong> the new
              <code class="text-xs font-mono">/api/audit-url</code>
              endpoint had a key-name mismatch with the underlying scoring engine — what the engine
              internally calls "remediation" the user interface labels "practical." The endpoint
              looked for the wrong name, found nothing, and fell back to the strict score, so the
              practical column in the fleet output would have shown the strict number instead of the
              practical one.<br />
              <strong>How it was fixed:</strong> caught in the local smoke-test step before any
              caller integrated against the endpoint, so no production fleet report ever published
              the wrong number. The name mapping is now correct (verified against three test PDFs
              whose strict and practical scores genuinely differ).
            </p>
          </li>
        </ul>
      </article>

      <!-- v1.18.1 audit entry -->
      <article
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6 mb-4"
      >
        <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
          <h3 class="text-lg font-bold text-[var(--text-heading)]">v1.18.1</h3>
          <span class="text-xs text-[var(--text-muted)]">
            Audited <strong>2026-05-18</strong> · scope: veraPDF integration correctness +
            remediation result-page UX
          </span>
        </header>

        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          A patch release with four operational fixes against the v1.18.0 remediation feature. None
          of these findings expose private data or change the file-retention guarantees described
          elsewhere on this page. One finding is security-adjacent: an auditor who consulted the
          PDF/UA-1 compliance card on the remediation result page would have seen a silently wrong
          verdict in any deployment running a recent veraPDF version. Note: at the time of the fix,
          this feature flag was still off in production, so no real audit was shown the wrong
          verdict.
        </p>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">Findings</h4>
        <ul class="space-y-3 text-sm text-[var(--text-secondary)] mb-4">
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-red-700/30 text-red-200 mr-2"
                >P1</span
              >
              Fixed</strong
            >
            — PDF/UA-1 compliance verdict was always shown as "not compliant," regardless of the
            actual PDF.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was wrong:</strong> the tool calls a third-party validator (veraPDF) to
              report whether the remediated PDF technically conforms to the PDF/UA-1 accessibility
              standard. The newest version of that validator changed the shape of its result data
              slightly (it now returns a list of profile results rather than a single one). The tool
              was reading the result in the old shape, so the verdict was always missing, and the
              missing verdict was treated as "not compliant." Any auditor looking at the compliance
              card on the result page would have been shown an incorrect technical verdict.<br />
              <strong>How it was fixed:</strong> the tool now handles both the new and old result
              shapes correctly. Verified against a live install of the latest veraPDF version. No
              production deployment had this feature enabled yet at the time of the fix, so no real
              audit was actually shown the wrong verdict.
            </p>
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-700/30 text-amber-200 mr-2"
                >P2</span
              >
              Fixed</strong
            >
            — A second veraPDF shape change could have caused a crash inside the validation routine.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was wrong:</strong> in the same shape change that broke the verdict,
              veraPDF also moved its rule-by-rule detail list. A defensive fallback in the tool
              would have tried to read the new "count of failed rules" as if it were a list, which
              would have crashed the validation routine on certain inputs.<br />
              <strong>How it was fixed:</strong> the unsafe fallback was removed and the read order
              was updated to prefer the new location first. No crashes were observed in production —
              this was caught during the same review as the P1 above.
            </p>
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2"
                >P3</span
              >
              Fixed</strong
            >
            — Failure count under-reported on heavily-non-compliant PDFs.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was wrong:</strong> the tool reported a compliance-failure total based on
              the top 20 issues it displayed, rather than veraPDF's own total. On a deeply
              non-compliant PDF the displayed total would have been lower than reality.<br />
              <strong>How it was fixed:</strong> the tool now uses veraPDF's own total when
              available. Older veraPDF versions still use the "sum the displayed list" fallback.
            </p>
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2"
                >P3</span
              >
              Fixed</strong
            >
            — The "Fix steps" links on the remediation result page were dead.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was wrong:</strong> clicking "Fix steps" next to an outstanding issue on
              the result page did nothing. The link tried to jump to a card that exists on the audit
              page but not the result page.<br />
              <strong>How it was fixed:</strong> each issue row now opens an inline accordion
              showing the detailed findings and numbered Adobe Acrobat fix steps right there on the
              result page — no navigation needed. Same content as the audit-page cards. Not a
              privacy or security issue, but a real usability problem for an auditor following up on
              outstanding items.
            </p>
          </li>
        </ul>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
          Operational improvements
        </h4>
        <ul class="space-y-1 text-sm text-[var(--text-secondary)] list-disc list-inside ml-2">
          <li>
            The Ubuntu deploy script (<code class="text-xs font-mono">rebuild.sh</code>) now
            auto-detects an installed veraPDF and, when it isn't installed, prints copy-paste
            install instructions including the persistence command so the path survives a server
            reboot. Reduces drift between development and production installs.
          </li>
        </ul>
      </article>

      <!-- v1.18.0 audit entry -->
      <article
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6 mb-4"
      >
        <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
          <h3 class="text-lg font-bold text-[var(--text-heading)]">v1.18.0</h3>
          <span class="text-xs text-[var(--text-muted)]">
            Audited <strong>2026-05-18</strong> · scope: PDF auto-remediation feature (entire new
            surface)
          </span>
        </header>

        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          The remediation pipeline was the first major surface added to this tool. The pre-release
          red/blue team review covered the public API endpoints, the worker, the frontend, the
          cleanup sweep, the database schema, and the file lifecycle. The 15-row threat-model
          checklist documented in
          <code class="text-xs font-mono">docs/archive/pdf-remediation-integration-plan.md</code>
          (§ Security) was the basis of the review.
        </p>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">Findings</h4>
        <ul class="space-y-3 text-sm text-[var(--text-secondary)] mb-4">
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-red-700/30 text-red-200 mr-2"
                >P1</span
              >
              Fixed</strong
            >
            — Memory exhaustion via large output downloads.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was wrong:</strong> the download endpoint loaded the entire remediated
              PDF (up to 50 MB) into the API process's memory before sending it to the user's
              browser. Under several simultaneous downloads, this could exceed the API process's 512
              MB memory cap and crash it. <br />
              <strong>How it was fixed:</strong> switched to streaming the file in small chunks
              (<code class="text-xs font-mono">createReadStream + stream.pipe(res)</code>). Memory
              usage is now constant regardless of output size.
            </p>
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-red-700/30 text-red-200 mr-2"
                >P1</span
              >
              Fixed</strong
            >
            — Race condition allowed concurrent double-download.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was wrong:</strong> the download token was supposed to be single-use, but
              two near-simultaneous requests with the same token could both pass the validation
              check and both retrieve the file before either completed. This violated the
              "single-use" privacy guarantee.<br />
              <strong>How it was fixed:</strong> the job is marked
              <code class="text-xs font-mono">status='expired'</code>
              <em>before</em> the file is sent, so any concurrent second request immediately sees
              the expired status and receives a "410 Gone" response.
            </p>
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-700/30 text-amber-200 mr-2"
                >P2</span
              >
              Mitigated</strong
            >
            — Auth-bypass when login is not required (dev/internal mode).
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was found:</strong> when the tool runs with the "require login" flag
              turned off (typical for internal development), the per-job email check on the status,
              download, and receipt endpoints is bypassed. Anyone who knows a job's UUID could read
              its data.<br />
              <strong>How it was handled:</strong> job UUIDs use 122 bits of cryptographic
              randomness — guessing one is computationally impractical. Production deployments run
              with login required, which closes the gap entirely. This limitation is documented in
              the integration plan as the known posture; it does not affect the production
              deployment.
            </p>
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-700/30 text-amber-200 mr-2"
                >P2</span
              >
              Accepted</strong
            >
            — Legacy scoring data computed but unused.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was found:</strong> the Adobe Acrobat parity score (a 32-rule check) is
              still calculated on the server even though the user interface no longer displays it.
              Costs about 50 milliseconds per audit.<br />
              <strong>How it was handled:</strong> intentionally kept for data-shape stability so
              existing tests and audit-log entries continue to work. May be removed in a future
              release if the cost ever matters. Not a privacy or security issue — just dead code.
            </p>
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2"
                >P3</span
              >
              Accepted</strong
            >
            — Conservative PDF validation rejects borderline files.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was found:</strong> the
              <code class="text-xs font-mono">qpdf --check</code> validator flags some
              technically-valid PDF outputs as "warnings," which the tool treats as failures.<br />
              <strong>How it was handled:</strong> accepted by design. Better to reject a borderline
              file (the user is told the remediation didn't work, can try a different path) than to
              serve a file that <em>might</em> be damaged and contaminate the user's records.
              Privacy and integrity over feature completion.
            </p>
          </li>
        </ul>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
          Pre-launch items still open
        </h4>
        <ul class="space-y-1 text-sm text-[var(--text-secondary)] list-disc list-inside ml-2">
          <li>
            External penetration test on the remediation surface (planned before public-announce;
            budget tracked in Phase 4 roadmap).
          </li>
          <li>
            Full automated test coverage for the remediation pipeline (<code
              class="text-xs font-mono"
              >remediation.test.ts</code
            >, <code class="text-xs font-mono">remediation-privacy.test.ts</code>,
            <code class="text-xs font-mono">remediation-receipt.test.ts</code>). Tracked in Phase 4.
          </li>
          <li>
            File the upstream OpenDataLoader object-streams bug with reproducer PDFs (the qpdf
            preprocessing workaround is in place in the meantime).
          </li>
        </ul>
      </article>

      <!-- Prior releases -->
      <article class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6">
        <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
          <h3 class="text-lg font-bold text-[var(--text-heading)]">v1.17.0 and earlier</h3>
          <span class="text-xs text-[var(--text-muted)]"> Pre-formatted-audit era </span>
        </header>
        <p class="text-sm text-[var(--text-secondary)] leading-relaxed">
          Security reviews for releases prior to v1.18.0 were not yet captured in this format.
          Earlier releases focused on the synchronous audit pipeline (added in v1.0) and
          authentication flow (Personal Access Tokens added in v1.16, analyze-by-URL added in
          v1.17). Review history for those releases is available via the
          <a
            href="https://github.com/ICJIA/file-accessibility-audit/commits/main"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[var(--link)] hover:text-[var(--link-hover)] underline"
            >commit history on GitHub</a
          >. Going forward — beginning with v1.18.0 — every release will have a corresponding entry
          in this section before tagging.
        </p>
      </article>
    </section>
</template>

<script setup lang="ts">
// Static content extracted verbatim from pages/data-retention.vue
// (Phase F, task F2: section split) -- 10. Security audit history. No reactive state;
// the page's own script setup (TOOL_VERSION etc.) is untouched and
// still lives in the page component per the version test's source scan.
</script>
