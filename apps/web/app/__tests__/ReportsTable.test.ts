import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ReportsTable from "../components/ReportsTable.vue";

// ---------------------------------------------------------------------------
// ReportsTable — the shared table shell behind history.vue + my-history.vue
// (Task F3). Deliberately dumb: it owns structure (table/thead/tbody, column
// loop, row loop) and a11y semantics (scope="col", visually-hidden caption —
// Task F6's table requirements folded in from the start); every cell's
// presentation is owned by the caller via a `cell-<key>` scoped slot, so the
// two very different-looking pages (admin log vs personal history) can each
// keep their own badges/colors/date formats without this component knowing
// about either.
// ---------------------------------------------------------------------------

const columns = [
  { key: "filename", label: "Filename" },
  { key: "score", label: "Score", align: "center" as const },
  { key: "created_at", label: "Date", align: "right" as const },
];

const rows = [
  { id: 1, filename: "report-a.pdf", score: 92, created_at: "2026-01-01T10:00:00.000Z" },
  { id: 2, filename: "report-b.docx", score: null, created_at: "2026-02-02T11:30:00.000Z" },
];

describe("ReportsTable — structure", () => {
  it("renders one row per item in `rows`", () => {
    const wrapper = mount(ReportsTable, { props: { rows, columns, caption: "Test reports" } });
    expect(wrapper.findAll("tbody tr")).toHaveLength(2);
  });

  it("renders a <th> per column with the given label", () => {
    const wrapper = mount(ReportsTable, { props: { rows, columns, caption: "Test reports" } });
    const headers = wrapper.findAll("thead th");
    expect(headers).toHaveLength(3);
    expect(headers[0]!.text()).toBe("Filename");
    expect(headers[1]!.text()).toBe("Score");
    expect(headers[2]!.text()).toBe("Date");
  });

  it("renders raw cell values by default (no slot provided)", () => {
    const wrapper = mount(ReportsTable, { props: { rows, columns, caption: "Test reports" } });
    expect(wrapper.text()).toContain("report-a.pdf");
    expect(wrapper.text()).toContain("92");
  });
});

describe("ReportsTable — a11y (Task F6 folded in)", () => {
  it('every header <th> has scope="col"', () => {
    const wrapper = mount(ReportsTable, { props: { rows, columns, caption: "Test reports" } });
    const headers = wrapper.findAll("thead th");
    expect(headers.length).toBeGreaterThan(0);
    for (const th of headers) {
      expect(th.attributes("scope")).toBe("col");
    }
  });

  it("renders a visually-hidden <caption> with the given text", () => {
    const wrapper = mount(ReportsTable, {
      props: { rows, columns, caption: "Admin audit log of analyze and login events" },
    });
    const caption = wrapper.find("caption");
    expect(caption.exists()).toBe(true);
    expect(caption.text()).toBe("Admin audit log of analyze and login events");
    expect(caption.classes()).toContain("sr-only");
  });
});

describe("ReportsTable — custom cell rendering via scoped slots", () => {
  it("uses a `cell-<key>` slot to format a date column instead of the raw ISO string", () => {
    const wrapper = mount(ReportsTable, {
      props: { rows, columns, caption: "Test reports" },
      slots: {
        "cell-created_at": `<template #cell-created_at="{ value }">{{ new Date(value).getUTCFullYear() }}-formatted</template>`,
      },
    });
    expect(wrapper.text()).toContain("2026-formatted");
    // the raw ISO timestamp should not leak through once a slot owns the cell
    expect(wrapper.text()).not.toContain("2026-01-01T10:00:00.000Z");
  });

  it("passes both `row` and `value` to the scoped slot", () => {
    const wrapper = mount(ReportsTable, {
      props: { rows, columns, caption: "Test reports" },
      slots: {
        "cell-score": `<template #cell-score="{ row, value }">{{ row.filename }}:{{ value ?? 'N/A' }}</template>`,
      },
    });
    expect(wrapper.text()).toContain("report-a.pdf:92");
    // null score renders through the slot's own fallback, not the table's
    expect(wrapper.text()).toContain("report-b.docx:N/A");
  });
});

describe("ReportsTable — empty state", () => {
  it("renders a table with no rows when `rows` is empty (page decides the empty-state message)", () => {
    const wrapper = mount(ReportsTable, { props: { rows: [], columns, caption: "Test reports" } });
    expect(wrapper.findAll("tbody tr")).toHaveLength(0);
    expect(wrapper.find("table").exists()).toBe(true);
  });
});
