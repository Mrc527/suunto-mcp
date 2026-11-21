/** Small DOM helpers. Text always goes in as text: workout names and notes are user data. */

type Attrs = Record<string, string | number | undefined>;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Array<Node | string | undefined>): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) node.setAttribute(k, String(v));
  for (const c of children) if (c !== undefined) node.append(typeof c === "string" ? document.createTextNode(c) : c);
  return node;
}

const SVG = "http://www.w3.org/2000/svg";

export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Array<Node | undefined>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) node.setAttribute(k, String(v));
  for (const c of children) if (c !== undefined) node.append(c);
  return node;
}

/** A row of figures: label above, value below. */
export function tiles(items: Array<[label: string, value: string]>): HTMLElement {
  return el("dl", { class: "tiles" }, ...items.map(([label, value]) => el("div", { class: "tile" }, el("dt", {}, label), el("dd", {}, value))));
}

/** A row of toggle buttons; calls onChange with the chosen key. */
export function toggles<T extends string>(options: Array<[key: T, label: string]>, selected: T, onChange: (key: T) => void): HTMLElement {
  const group = el("div", { class: "toggles", role: "group" });
  for (const [key, label] of options) {
    const b = el("button", { type: "button", "aria-pressed": key === selected ? "true" : "false" }, label);
    b.addEventListener("click", () => {
      for (const other of group.querySelectorAll("button")) other.setAttribute("aria-pressed", other === b ? "true" : "false");
      onChange(key);
    });
    group.append(b);
  }
  return group;
}

export function message(text: string, kind: "info" | "error" = "info"): HTMLElement {
  return el("p", { class: `message ${kind}`, role: kind === "error" ? "alert" : "status" }, text);
}
