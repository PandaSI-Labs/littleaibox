import { Hook as dt, getId as gt, debounce as pt, addClass as mt, walkTree as R, noop as X } from "markmap-common";
import { loadCSS as de, loadJS as ge } from "markmap-common";
import { scaleOrdinal as Z, schemeCategory10 as ut, linkHorizontal as ft, zoomTransform as C, select as xt, zoom as yt, max as G, min as V, zoomIdentity as kt, minIndex as vt } from "d3";
const q = typeof navigator < "u" && navigator.userAgent.includes("Macintosh"), bt = Z(ut), J = (e = 1, t = 3, i = 2) => (n) => e + t / i ** n.state.depth, Q = {
  autoFit: !1,
  duration: 500,
  embedGlobalCSS: !0,
  fitRatio: 0.95,
  maxInitialScale: 2,
  scrollForPan: q,
  initialExpandLevel: -1,
  zoom: !0,
  pan: !0,
  toggleRecursively: !1,
  color: (e) => {
    var t;
    return bt(`${((t = e.state) == null ? void 0 : t.path) || ""}`);
  },
  lineWidth: J(),
  maxWidth: 0,
  nodeMinHeight: 16,
  paddingX: 8,
  spacingHorizontal: 80,
  spacingVertical: 5
};
function oe(e) {
  const t = {}, i = { ...e }, { color: n, colorFreezeLevel: s, lineWidth: o } = i;
  if ((n == null ? void 0 : n.length) === 1) {
    const c = n[0];
    t.color = () => c;
  } else if (n != null && n.length) {
    const c = Z(n);
    t.color = (l) => c(`${l.state.path}`);
  }
  if (s) {
    const c = t.color || Q.color;
    t.color = (l) => (l = {
      ...l,
      state: {
        ...l.state,
        path: l.state.path.split(".").slice(0, s).join(".")
      }
    }, c(l));
  }
  if (o) {
    const c = Array.isArray(o) ? o : [o, 0, 1];
    t.lineWidth = J(
      ...c
    );
  }
  return [
    "duration",
    "fitRatio",
    "initialExpandLevel",
    "maxInitialScale",
    "maxWidth",
    "nodeMinHeight",
    "paddingX",
    "spacingHorizontal",
    "spacingVertical"
  ].forEach((c) => {
    const l = i[c];
    typeof l == "number" && (t[c] = l);
  }), ["zoom", "pan"].forEach((c) => {
    const l = i[c];
    l != null && (t[c] = !!l);
  }), t;
}
function Et(e) {
  let t = 0;
  for (let i = 0; i < e.length; i++)
    t = (t << 5) - t + e.charCodeAt(i) | 0;
  return (t >>> 0).toString(36);
}
function v(e) {
  if (typeof e == "string") {
    const i = e;
    e = (n) => n.matches(i);
  }
  const t = e;
  return function() {
    let n = Array.from(this.childNodes);
    return t && (n = n.filter((s) => t(s))), n;
  };
}
function zt(e) {
  var t = 0, i = e.children, n = i && i.length;
  if (!n) t = 1;
  else for (; --n >= 0; ) t += i[n].value;
  e.value = t;
}
function Ct() {
  return this.eachAfter(zt);
}
function St(e) {
  var t = this, i, n = [t], s, o, h;
  do
    for (i = n.reverse(), n = []; t = i.pop(); )
      if (e(t), s = t.children, s) for (o = 0, h = s.length; o < h; ++o)
        n.push(s[o]);
  while (n.length);
  return this;
}
function wt(e) {
  for (var t = this, i = [t], n, s; t = i.pop(); )
    if (e(t), n = t.children, n) for (s = n.length - 1; s >= 0; --s)
      i.push(n[s]);
  return this;
}
function Rt(e) {
  for (var t = this, i = [t], n = [], s, o, h; t = i.pop(); )
    if (n.push(t), s = t.children, s) for (o = 0, h = s.length; o < h; ++o)
      i.push(s[o]);
  for (; t = n.pop(); )
    e(t);
  return this;
}
function Xt(e) {
  return this.eachAfter(function(t) {
    for (var i = +e(t.data) || 0, n = t.children, s = n && n.length; --s >= 0; ) i += n[s].value;
    t.value = i;
  });
}
function _t(e) {
  return this.eachBefore(function(t) {
    t.children && t.children.sort(e);
  });
}
function Ot(e) {
  for (var t = this, i = At(t, e), n = [t]; t !== i; )
    t = t.parent, n.push(t);
  for (var s = n.length; e !== i; )
    n.splice(s, 0, e), e = e.parent;
  return n;
}
function At(e, t) {
  if (e === t) return e;
  var i = e.ancestors(), n = t.ancestors(), s = null;
  for (e = i.pop(), t = n.pop(); e === t; )
    s = e, e = i.pop(), t = n.pop();
  return s;
}
function Mt() {
  for (var e = this, t = [e]; e = e.parent; )
    t.push(e);
  return t;
}
function Ht() {
  var e = [];
  return this.each(function(t) {
    e.push(t);
  }), e;
}
function Tt() {
  var e = [];
  return this.eachBefore(function(t) {
    t.children || e.push(t);
  }), e;
}
function jt() {
  var e = this, t = [];
  return e.each(function(i) {
    i !== e && t.push({ source: i.parent, target: i });
  }), t;
}
function j(e, t) {
  var i = new _(e), n = +e.value && (i.value = e.value), s, o = [i], h, a, c, l;
  for (t == null && (t = Ft); s = o.pop(); )
    if (n && (s.value = +s.data.value), (a = t(s.data)) && (l = a.length))
      for (s.children = new Array(l), c = l - 1; c >= 0; --c)
        o.push(h = s.children[c] = new _(a[c])), h.parent = s, h.depth = s.depth + 1;
  return i.eachBefore(Bt);
}
function $t() {
  return j(this).eachBefore(Nt);
}
function Ft(e) {
  return e.children;
}
function Nt(e) {
  e.data = e.data.data;
}
function Bt(e) {
  var t = 0;
  do
    e.height = t;
  while ((e = e.parent) && e.height < ++t);
}
function _(e) {
  this.data = e, this.depth = this.height = 0, this.parent = null;
}
_.prototype = j.prototype = {
  constructor: _,
  count: Ct,
  each: St,
  eachAfter: Rt,
  eachBefore: wt,
  sum: Xt,
  sort: _t,
  path: Ot,
  ancestors: Mt,
  descendants: Ht,
  leaves: Tt,
  links: jt,
  copy: $t
};
const Lt = "2.1.2", Dt = {
  version: Lt
}, { version: Wt } = Dt, Pt = Object.freeze({
  children: (e) => e.children,
  nodeSize: (e) => e.data.size,
  spacing: 0
});
function tt(e) {
  const t = Object.assign({}, Pt, e);
  function i(a) {
    const c = t[a];
    return typeof c == "function" ? c : () => c;
  }
  function n(a) {
    const c = h(o(), a, (l) => l.children);
    return c.update(), c.data;
  }
  function s() {
    const a = i("nodeSize"), c = i("spacing");
    return class U extends j.prototype.constructor {
      constructor(d) {
        super(d);
      }
      copy() {
        const d = h(this.constructor, this, (p) => p.children);
        return d.each((p) => p.data = p.data.data), d;
      }
      get size() {
        return a(this);
      }
      spacing(d) {
        return c(this, d);
      }
      get nodes() {
        return this.descendants();
      }
      get xSize() {
        return this.size[0];
      }
      get ySize() {
        return this.size[1];
      }
      get top() {
        return this.y;
      }
      get bottom() {
        return this.y + this.ySize;
      }
      get left() {
        return this.x - this.xSize / 2;
      }
      get right() {
        return this.x + this.xSize / 2;
      }
      get root() {
        const d = this.ancestors();
        return d[d.length - 1];
      }
      get numChildren() {
        return this.hasChildren ? this.children.length : 0;
      }
      get hasChildren() {
        return !this.noChildren;
      }
      get noChildren() {
        return this.children === null;
      }
      get firstChild() {
        return this.hasChildren ? this.children[0] : null;
      }
      get lastChild() {
        return this.hasChildren ? this.children[this.numChildren - 1] : null;
      }
      get extents() {
        return (this.children || []).reduce(
          (d, p) => U.maxExtents(d, p.extents),
          this.nodeExtents
        );
      }
      get nodeExtents() {
        return {
          top: this.top,
          bottom: this.bottom,
          left: this.left,
          right: this.right
        };
      }
      static maxExtents(d, p) {
        return {
          top: Math.min(d.top, p.top),
          bottom: Math.max(d.bottom, p.bottom),
          left: Math.min(d.left, p.left),
          right: Math.max(d.right, p.right)
        };
      }
    };
  }
  function o() {
    const a = s(), c = i("nodeSize"), l = i("spacing");
    return class extends a {
      constructor(d) {
        super(d), Object.assign(this, {
          x: 0,
          y: 0,
          relX: 0,
          prelim: 0,
          shift: 0,
          change: 0,
          lExt: this,
          lExtRelX: 0,
          lThr: null,
          rExt: this,
          rExtRelX: 0,
          rThr: null
        });
      }
      get size() {
        return c(this.data);
      }
      spacing(d) {
        return l(this.data, d.data);
      }
      get x() {
        return this.data.x;
      }
      set x(d) {
        this.data.x = d;
      }
      get y() {
        return this.data.y;
      }
      set y(d) {
        this.data.y = d;
      }
      update() {
        return et(this), rt(this), this;
      }
    };
  }
  function h(a, c, l) {
    const d = (p, m) => {
      const u = new a(p);
      Object.assign(u, {
        parent: m,
        depth: m === null ? 0 : m.depth + 1,
        height: 0,
        length: 1
      });
      const x = l(p) || [];
      return u.children = x.length === 0 ? null : x.map((y) => d(y, u)), u.children && Object.assign(u, u.children.reduce(
        (y, k) => ({
          height: Math.max(y.height, k.height + 1),
          length: y.length + k.length
        }),
        u
      )), u;
    };
    return d(c, null);
  }
  return Object.assign(n, {
    nodeSize(a) {
      return arguments.length ? (t.nodeSize = a, n) : t.nodeSize;
    },
    spacing(a) {
      return arguments.length ? (t.spacing = a, n) : t.spacing;
    },
    children(a) {
      return arguments.length ? (t.children = a, n) : t.children;
    },
    hierarchy(a, c) {
      const l = typeof c > "u" ? t.children : c;
      return h(s(), a, l);
    },
    dump(a) {
      const c = i("nodeSize"), l = (d) => (p) => {
        const m = d + "  ", u = d + "    ", { x, y } = p, k = c(p), b = p.children || [], z = b.length === 0 ? " " : `,${m}children: [${u}${b.map(l(u)).join(u)}${m}],${d}`;
        return `{ size: [${k.join(", ")}],${m}x: ${x}, y: ${y}${z}},`;
      };
      return l(`
`)(a);
    }
  }), n;
}
tt.version = Wt;
const et = (e, t = 0) => (e.y = t, (e.children || []).reduce((i, n) => {
  const [s, o] = i;
  et(n, e.y + e.ySize);
  const h = (s === 0 ? n.lExt : n.rExt).bottom;
  s !== 0 && Kt(e, s, o);
  const a = Ut(h, s, o);
  return [s + 1, a];
}, [0, null]), It(e), Qt(e), e), rt = (e, t, i) => {
  typeof t > "u" && (t = -e.relX - e.prelim, i = 0);
  const n = t + e.relX;
  return e.relX = n + e.prelim - i, e.prelim = 0, e.x = i + e.relX, (e.children || []).forEach((s) => rt(s, n, e.x)), e;
}, It = (e) => {
  (e.children || []).reduce((t, i) => {
    const [n, s] = t, o = n + i.shift, h = s + o + i.change;
    return i.relX += h, [o, h];
  }, [0, 0]);
}, Kt = (e, t, i) => {
  const n = e.children[t - 1], s = e.children[t];
  let o = n, h = n.relX, a = s, c = s.relX, l = !0;
  for (; o && a; ) {
    o.bottom > i.lowY && (i = i.next);
    const d = h + o.prelim - (c + a.prelim) + o.xSize / 2 + a.xSize / 2 + o.spacing(a);
    (d > 0 || d < 0 && l) && (c += d, Gt(s, d), Vt(e, t, i.index, d)), l = !1;
    const p = o.bottom, m = a.bottom;
    p <= m && (o = Zt(o), o && (h += o.relX)), p >= m && (a = Yt(a), a && (c += a.relX));
  }
  !o && a ? qt(e, t, a, c) : o && !a && Jt(e, t, o, h);
}, Gt = (e, t) => {
  e.relX += t, e.lExtRelX += t, e.rExtRelX += t;
}, Vt = (e, t, i, n) => {
  const s = e.children[t], o = t - i;
  if (o > 1) {
    const h = n / o;
    e.children[i + 1].shift += h, s.shift -= h, s.change -= n - h;
  }
}, Yt = (e) => e.hasChildren ? e.firstChild : e.lThr, Zt = (e) => e.hasChildren ? e.lastChild : e.rThr, qt = (e, t, i, n) => {
  const s = e.firstChild, o = s.lExt, h = e.children[t];
  o.lThr = i;
  const a = n - i.relX - s.lExtRelX;
  o.relX += a, o.prelim -= a, s.lExt = h.lExt, s.lExtRelX = h.lExtRelX;
}, Jt = (e, t, i, n) => {
  const s = e.children[t], o = s.rExt, h = e.children[t - 1];
  o.rThr = i;
  const a = n - i.relX - s.rExtRelX;
  o.relX += a, o.prelim -= a, s.rExt = h.rExt, s.rExtRelX = h.rExtRelX;
}, Qt = (e) => {
  if (e.hasChildren) {
    const t = e.firstChild, i = e.lastChild, n = (t.prelim + t.relX - t.xSize / 2 + i.relX + i.prelim + i.xSize / 2) / 2;
    Object.assign(e, {
      prelim: n,
      lExt: t.lExt,
      lExtRelX: t.lExtRelX,
      rExt: i.rExt,
      rExtRelX: i.rExtRelX
    });
  }
}, Ut = (e, t, i) => {
  for (; i !== null && e >= i.lowY; )
    i = i.next;
  return {
    lowY: e,
    index: t,
    next: i
  };
}, nt = ".markmap{--markmap-max-width: 9999px;--markmap-a-color: #0097e6;--markmap-a-hover-color: #00a8ff;--markmap-code-bg: #f0f0f0;--markmap-code-color: #555;--markmap-highlight-bg: #ffeaa7;--markmap-table-border: 1px solid currentColor;--markmap-font: 300 16px/20px sans-serif;--markmap-circle-open-bg: #fff;--markmap-text-color: #333;--markmap-highlight-node-bg: #ff02;font:var(--markmap-font);color:var(--markmap-text-color)}.markmap-link{fill:none}.markmap-node>circle{cursor:pointer}.markmap-foreign{display:inline-block}.markmap-foreign p{margin:0}.markmap-foreign a{color:var(--markmap-a-color)}.markmap-foreign a:hover{color:var(--markmap-a-hover-color)}.markmap-foreign code{padding:.25em;font-size:calc(1em - 2px);color:var(--markmap-code-color);background-color:var(--markmap-code-bg);border-radius:2px}.markmap-foreign pre{margin:0}.markmap-foreign pre>code{display:block}.markmap-foreign del{text-decoration:line-through}.markmap-foreign em{font-style:italic}.markmap-foreign strong{font-weight:700}.markmap-foreign mark{background:var(--markmap-highlight-bg)}.markmap-foreign table,.markmap-foreign th,.markmap-foreign td{border-collapse:collapse;border:var(--markmap-table-border)}.markmap-foreign img{display:inline-block}.markmap-foreign svg{fill:currentColor}.markmap-foreign>div{width:var(--markmap-max-width);text-align:left}.markmap-foreign>div>div{display:inline-block}.markmap-highlight rect{fill:var(--markmap-highlight-node-bg)}.markmap-dark .markmap{--markmap-code-bg: #1a1b26;--markmap-code-color: #ddd;--markmap-circle-open-bg: #444;--markmap-text-color: #eee}", ce = nt, M = "g.markmap-node", te = "path.markmap-link", ee = "g.markmap-highlight", H = ft();
function Y(e, t) {
  const i = vt(e, t);
  return e[i];
}
function T(e) {
  e.stopPropagation();
}
const re = new dt();
class it {
  constructor(t, i) {
    this.options = { ...Q }, this._disposeList = [], this.handleZoom = (n) => {
      const { transform: s } = n;
      this.g.attr("transform", s);
    }, this.handlePan = (n) => {
      n.preventDefault();
      const s = C(this.svg.node()), o = s.translate(
        -n.deltaX / s.k,
        -n.deltaY / s.k
      );
      this.svg.call(this.zoom.transform, o);
    }, this.handleClick = (n, s) => {
      let o = this.options.toggleRecursively;
      (q ? n.metaKey : n.ctrlKey) && (o = !o), this.toggleNode(s, o);
    }, this.ensureView = this.ensureVisible, this.svg = t.datum ? t : xt(t), this.styleNode = this.svg.append("style"), this.zoom = yt().filter((n) => this.options.scrollForPan && n.type === "wheel" ? n.ctrlKey && !n.button : (!n.ctrlKey || n.type === "wheel") && !n.button).on("zoom", this.handleZoom), this.setOptions(i), this.state = {
      id: this.options.id || this.svg.attr("id") || gt(),
      rect: { x1: 0, y1: 0, x2: 0, y2: 0 }
    }, this.g = this.svg.append("g"), this.g.append("g").attr("class", "markmap-highlight"), this._observer = new ResizeObserver(
      pt(() => {
        this.renderData();
      }, 100)
    ), this._disposeList.push(
      re.tap(() => {
        this.setData();
      }),
      () => this._observer.disconnect()
    );
  }
  getStyleContent() {
    const { style: t } = this.options, { id: i } = this.state, n = typeof t == "function" ? t(i) : "";
    return [this.options.embedGlobalCSS && nt, n].filter(Boolean).join(`
`);
  }
  updateStyle() {
    this.svg.attr(
      "class",
      mt(this.svg.attr("class"), "markmap", this.state.id)
    );
    const t = this.getStyleContent();
    this.styleNode.text(t);
  }
  async toggleNode(t, i = !1) {
    var s, o;
    const n = (s = t.payload) != null && s.fold ? 0 : 1;
    i ? R(t, (h, a) => {
      h.payload = {
        ...h.payload,
        fold: n
      }, a();
    }) : t.payload = {
      ...t.payload,
      fold: (o = t.payload) != null && o.fold ? 0 : 1
    }, await this.renderData(t);
  }
  _initializeData(t) {
    let i = 0;
    const { color: n, initialExpandLevel: s } = this.options;
    let o = 0, h = 0;
    return R(t, (a, c, l) => {
      var p, m, u, x;
      h += 1, a.children = (p = a.children) == null ? void 0 : p.map((y) => ({ ...y })), i += 1, a.state = {
        ...a.state,
        depth: h,
        id: i,
        rect: {
          x: 0,
          y: 0,
          width: 0,
          height: 0
        },
        size: [0, 0]
      }, a.state.key = [(m = l == null ? void 0 : l.state) == null ? void 0 : m.id, a.state.id].filter(Boolean).join(".") + Et(a.content), a.state.path = [(u = l == null ? void 0 : l.state) == null ? void 0 : u.path, a.state.id].filter(Boolean).join("."), n(a);
      const d = ((x = a.payload) == null ? void 0 : x.fold) === 2;
      d ? o += 1 : (o || s >= 0 && a.state.depth >= s) && (a.payload = { ...a.payload, fold: 1 }), c(), d && (o -= 1), h -= 1;
    }), t;
  }
  _relayout() {
    if (!this.state.data) return;
    this.g.selectAll(v(M)).selectAll(
      v("foreignObject")
    ).each(function(c) {
      var p;
      const l = (p = this.firstChild) == null ? void 0 : p.firstChild, d = [l.scrollWidth, l.scrollHeight];
      c.state.size = d;
    });
    const { lineWidth: t, paddingX: i, spacingHorizontal: n, spacingVertical: s } = this.options, o = tt({}).children((c) => {
      var l;
      if (!((l = c.payload) != null && l.fold)) return c.children;
    }).nodeSize((c) => {
      const [l, d] = c.data.state.size;
      return [d, l + (l ? i * 2 : 0) + n];
    }).spacing((c, l) => (c.parent === l.parent ? s : s * 2) + t(c.data)), h = o.hierarchy(this.state.data);
    o(h);
    const a = h.descendants();
    a.forEach((c) => {
      const l = c.data;
      l.state.rect = {
        x: c.y,
        y: c.x - c.xSize / 2,
        width: c.ySize - n,
        height: c.xSize
      };
    }), this.state.rect = {
      x1: V(a, (c) => c.data.state.rect.x) || 0,
      y1: V(a, (c) => c.data.state.rect.y) || 0,
      x2: G(
        a,
        (c) => c.data.state.rect.x + c.data.state.rect.width
      ) || 0,
      y2: G(
        a,
        (c) => c.data.state.rect.y + c.data.state.rect.height
      ) || 0
    };
  }
  setOptions(t) {
    this.options = {
      ...this.options,
      ...t
    }, this.options.zoom ? this.svg.call(this.zoom) : this.svg.on(".zoom", null), this.options.pan ? this.svg.on("wheel", this.handlePan) : this.svg.on("wheel", null);
  }
  async setData(t, i) {
    i && this.setOptions(i), t && (this.state.data = this._initializeData(t)), this.state.data && (this.updateStyle(), await this.renderData());
  }
  async setHighlight(t) {
    this.state.highlight = t || void 0, await this.renderData();
  }
  _getHighlightRect(t) {
    const i = this.svg.node(), s = 4 / C(i).k, o = {
      ...t.state.rect
    };
    return o.x -= s, o.y -= s, o.width += 2 * s, o.height += 2 * s, o;
  }
  async renderData(t) {
    const { paddingX: i, autoFit: n, color: s, maxWidth: o, lineWidth: h } = this.options, a = this.state.data;
    if (!a) return;
    const c = {}, l = {}, d = [];
    R(a, (r, g, f) => {
      var E;
      (E = r.payload) != null && E.fold || g(), c[r.state.id] = r, f && (l[r.state.id] = f.state.id), d.push(r);
    });
    const p = {}, m = {}, u = (r) => {
      !r || p[r.state.id] || R(r, (g, f) => {
        p[g.state.id] = r.state.id, f();
      });
    }, x = (r) => m[p[r.state.id]] || a.state.rect, y = (r) => (c[p[r.state.id]] || a).state.rect;
    m[a.state.id] = a.state.rect, t && u(t);
    let { highlight: k } = this.state;
    k && !c[k.state.id] && (k = void 0);
    let b = this.g.selectAll(v(ee)).selectAll(v("rect")).data(k ? [this._getHighlightRect(k)] : []).join("rect").attr("x", (r) => r.x).attr("y", (r) => r.y).attr("width", (r) => r.width).attr("height", (r) => r.height);
    const z = this.g.selectAll(v(M)).each((r) => {
      m[r.state.id] = r.state.rect;
    }).data(d, (r) => r.state.key), $ = z.enter().append("g").attr("data-depth", (r) => r.state.depth).attr("data-path", (r) => r.state.path).each((r) => {
      u(c[l[r.state.id]]);
    }), S = z.exit().each((r) => {
      u(c[l[r.state.id]]);
    }), w = z.merge($).attr(
      "class",
      (r) => {
        var g;
        return ["markmap-node", ((g = r.payload) == null ? void 0 : g.fold) && "markmap-fold"].filter(Boolean).join(" ");
      }
    ), F = w.selectAll(v("line")).data(
      (r) => [r],
      (r) => r.state.key
    ), N = F.enter().append("line").attr("stroke", (r) => s(r)).attr("stroke-width", 0), B = F.merge(N), L = w.selectAll(v("circle")).data(
      (r) => {
        var g;
        return (g = r.children) != null && g.length ? [r] : [];
      },
      (r) => r.state.key
    ), D = L.enter().append("circle").attr("stroke-width", 0).attr("r", 0).on("click", (r, g) => this.handleClick(r, g)).on("mousedown", T).merge(L).attr("stroke", (r) => s(r)).attr(
      "fill",
      (r) => {
        var g;
        return (g = r.payload) != null && g.fold && r.children ? s(r) : "var(--markmap-circle-open-bg)";
      }
    ), W = this._observer, P = w.selectAll(v("foreignObject")).data(
      (r) => [r],
      (r) => r.state.key
    ), O = P.enter().append("foreignObject").attr("class", "markmap-foreign").attr("x", i).attr("y", 0).style("opacity", 0).on("mousedown", T).on("dblclick", T);
    O.append("xhtml:div").append("xhtml:div").html((r) => r.content).attr("xmlns", "http://www.w3.org/1999/xhtml"), O.each(function() {
      var g;
      const r = (g = this.firstChild) == null ? void 0 : g.firstChild;
      W.observe(r);
    });
    const I = S.selectAll(
      v("foreignObject")
    );
    I.each(function() {
      var g;
      const r = (g = this.firstChild) == null ? void 0 : g.firstChild;
      W.unobserve(r);
    });
    const K = O.merge(P), st = d.flatMap(
      (r) => {
        var g;
        return (g = r.payload) != null && g.fold ? [] : r.children.map((f) => ({ source: r, target: f }));
      }
    ), A = this.g.selectAll(v(te)).data(st, (r) => r.target.state.key), at = A.exit(), ot = A.enter().insert("path", "g").attr("class", "markmap-link").attr("data-depth", (r) => r.target.state.depth).attr("data-path", (r) => r.target.state.path).attr("d", (r) => {
      const g = x(r.target), f = [
        g.x + g.width,
        g.y + g.height
      ];
      return H({ source: f, target: f });
    }).attr("stroke-width", 0).merge(A);
    this.svg.style(
      "--markmap-max-width",
      o ? `${o}px` : null
    ), await new Promise(requestAnimationFrame), this._relayout(), b = b.data(k ? [this._getHighlightRect(k)] : []).join("rect"), this.transition(b).attr("x", (r) => r.x).attr("y", (r) => r.y).attr("width", (r) => r.width).attr("height", (r) => r.height), $.attr("transform", (r) => {
      const g = x(r);
      return `translate(${g.x + g.width - r.state.rect.width},${g.y + g.height - r.state.rect.height})`;
    }), this.transition(S).attr("transform", (r) => {
      const g = y(r), f = g.x + g.width - r.state.rect.width, E = g.y + g.height - r.state.rect.height;
      return `translate(${f},${E})`;
    }).remove(), this.transition(w).attr(
      "transform",
      (r) => `translate(${r.state.rect.x},${r.state.rect.y})`
    );
    const ct = S.selectAll(
      v("line")
    );
    this.transition(ct).attr("x1", (r) => r.state.rect.width).attr("stroke-width", 0), N.attr("x1", (r) => r.state.rect.width).attr("x2", (r) => r.state.rect.width), B.attr("y1", (r) => r.state.rect.height + h(r) / 2).attr("y2", (r) => r.state.rect.height + h(r) / 2), this.transition(B).attr("x1", -1).attr("x2", (r) => r.state.rect.width + 2).attr("stroke", (r) => s(r)).attr("stroke-width", h);
    const ht = S.selectAll(
      v("circle")
    );
    this.transition(ht).attr("r", 0).attr("stroke-width", 0), D.attr("cx", (r) => r.state.rect.width).attr("cy", (r) => r.state.rect.height + h(r) / 2), this.transition(D).attr("r", 6).attr("stroke-width", "1.5"), this.transition(I).style("opacity", 0), K.attr("width", (r) => Math.max(0, r.state.rect.width - i * 2)).attr("height", (r) => r.state.rect.height), this.transition(K).style("opacity", 1), this.transition(at).attr("d", (r) => {
      const g = y(r.target), f = [
        g.x + g.width,
        g.y + g.height + h(r.target) / 2
      ];
      return H({ source: f, target: f });
    }).attr("stroke-width", 0).remove(), this.transition(ot).attr("stroke", (r) => s(r.target)).attr("stroke-width", (r) => h(r.target)).attr("d", (r) => {
      const g = r.source, f = r.target, E = [
        g.state.rect.x + g.state.rect.width,
        g.state.rect.y + g.state.rect.height + h(g) / 2
      ], lt = [
        f.state.rect.x,
        f.state.rect.y + f.state.rect.height + h(f) / 2
      ];
      return H({ source: E, target: lt });
    }), n && this.fit();
  }
  transition(t) {
    const { duration: i } = this.options;
    return t.transition().duration(i);
  }
  /**
   * Fit the content to the viewport.
   */
  async fit(t = this.options.maxInitialScale) {
    const i = this.svg.node(), { width: n, height: s } = i.getBoundingClientRect(), { fitRatio: o } = this.options, { x1: h, y1: a, x2: c, y2: l } = this.state.rect, d = c - h, p = l - a, m = Math.min(
      n / d * o,
      s / p * o,
      t
    ), u = kt.translate(
      (n - d * m) / 2 - h * m,
      (s - p * m) / 2 - a * m
    ).scale(m);
    return this.transition(this.svg).call(this.zoom.transform, u).end().catch(X);
  }
  findElement(t) {
    let i;
    return this.g.selectAll(v(M)).each(function(s) {
      s === t && (i = {
        data: s,
        g: this
      });
    }), i;
  }
  /**
   * Pan the content to make the provided node visible in the viewport.
   */
  async ensureVisible(t, i) {
    var k;
    const n = (k = this.findElement(t)) == null ? void 0 : k.data;
    if (!n) return;
    const s = this.svg.node(), o = s.getBoundingClientRect(), h = C(s), [a, c] = [
      n.state.rect.x,
      n.state.rect.x + n.state.rect.width + 2
    ].map((b) => b * h.k + h.x), [l, d] = [
      n.state.rect.y,
      n.state.rect.y + n.state.rect.height
    ].map((b) => b * h.k + h.y), p = {
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      ...i
    }, m = [p.left - a, o.width - p.right - c], u = [p.top - l, o.height - p.bottom - d], x = m[0] * m[1] > 0 ? Y(m, Math.abs) / h.k : 0, y = u[0] * u[1] > 0 ? Y(u, Math.abs) / h.k : 0;
    if (x || y) {
      const b = h.translate(x, y);
      return this.transition(this.svg).call(this.zoom.transform, b).end().catch(X);
    }
  }
  async centerNode(t, i) {
    var x;
    const n = (x = this.findElement(t)) == null ? void 0 : x.data;
    if (!n) return;
    const s = this.svg.node(), o = s.getBoundingClientRect(), h = C(s), a = (n.state.rect.x + n.state.rect.width / 2) * h.k + h.x, c = (n.state.rect.y + n.state.rect.height / 2) * h.k + h.y, l = {
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      ...i
    }, d = (l.left + o.width - l.right) / 2, p = (l.top + o.height - l.bottom) / 2, m = (d - a) / h.k, u = (p - c) / h.k;
    if (m || u) {
      const y = h.translate(m, u);
      return this.transition(this.svg).call(this.zoom.transform, y).end().catch(X);
    }
  }
  /**
   * Scale content with it pinned at the center of the viewport.
   */
  async rescale(t) {
    const i = this.svg.node(), { width: n, height: s } = i.getBoundingClientRect(), o = n / 2, h = s / 2, a = C(i), c = a.translate(
      (o - a.x) * (1 - t) / a.k,
      (h - a.y) * (1 - t) / a.k
    ).scale(t);
    return this.transition(this.svg).call(this.zoom.transform, c).end().catch(X);
  }
  destroy() {
    this.svg.on(".zoom", null), this.svg.html(null), this._disposeList.forEach((t) => {
      t();
    });
  }
  static create(t, i, n = null) {
    const s = new it(t, i);
    return n && s.setData(n).then(() => {
      s.fit();
    }), s;
  }
}
export {
  it as Markmap,
  v as childSelector,
  bt as defaultColorFn,
  Q as defaultOptions,
  oe as deriveOptions,
  ce as globalCSS,
  q as isMacintosh,
  J as lineWidthFactory,
  de as loadCSS,
  ge as loadJS,
  re as refreshHook,
  Et as simpleHash
};
