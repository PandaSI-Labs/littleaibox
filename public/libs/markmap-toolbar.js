(function(exports) {
  "use strict";
  /*! @gera2ld/jsx-dom v2.2.2 | ISC License */
  const VTYPE_ELEMENT = 1;
  const VTYPE_FUNCTION = 2;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const XLINK_NS = "http://www.w3.org/1999/xlink";
  const NS_ATTRS = {
    show: XLINK_NS,
    actuate: XLINK_NS,
    href: XLINK_NS
  };
  const isLeaf = (c) => typeof c === "string" || typeof c === "number";
  const isElement = (c) => (c == null ? void 0 : c.vtype) === VTYPE_ELEMENT;
  const isRenderFunction = (c) => (c == null ? void 0 : c.vtype) === VTYPE_FUNCTION;
  function jsx(type, props) {
    let vtype;
    if (typeof type === "string") vtype = VTYPE_ELEMENT;
    else if (typeof type === "function") vtype = VTYPE_FUNCTION;
    else throw new Error("Invalid VNode type");
    return {
      vtype,
      type,
      props
    };
  }
  const jsxs = jsx;
  function Fragment(props) {
    return props.children;
  }
  const DEFAULT_ENV = {
    isSvg: false
  };
  function insertDom(parent, nodes) {
    if (!Array.isArray(nodes)) nodes = [nodes];
    nodes = nodes.filter(Boolean);
    if (nodes.length) parent.append(...nodes);
  }
  function mountAttributes(domElement, props, env) {
    for (const key in props) {
      if (key === "key" || key === "children" || key === "ref") continue;
      if (key === "dangerouslySetInnerHTML") {
        domElement.innerHTML = props[key].__html;
      } else if (key === "innerHTML" || key === "textContent" || key === "innerText" || key === "value" && ["textarea", "select"].includes(domElement.tagName)) {
        const value = props[key];
        if (value != null) domElement[key] = value;
      } else if (key.startsWith("on")) {
        domElement[key.toLowerCase()] = props[key];
      } else {
        setDOMAttribute(domElement, key, props[key], env.isSvg);
      }
    }
  }
  const attrMap = {
    className: "class",
    labelFor: "for"
  };
  function setDOMAttribute(el, attr, value, isSVG) {
    attr = attrMap[attr] || attr;
    if (value === true) {
      el.setAttribute(attr, "");
    } else if (value === false) {
      el.removeAttribute(attr);
    } else {
      const namespace = isSVG ? NS_ATTRS[attr] : void 0;
      if (namespace !== void 0) {
        el.setAttributeNS(namespace, attr, value);
      } else {
        el.setAttribute(attr, value);
      }
    }
  }
  function flatten(arr) {
    return arr.reduce((prev, item) => prev.concat(item), []);
  }
  function mountChildren(children, env) {
    return Array.isArray(children) ? flatten(children.map((child) => mountChildren(child, env))) : mount(children, env);
  }
  function mount(vnode, env = DEFAULT_ENV) {
    if (vnode == null || typeof vnode === "boolean") {
      return null;
    }
    if (vnode instanceof Node) {
      return vnode;
    }
    if (isRenderFunction(vnode)) {
      const {
        type,
        props
      } = vnode;
      if (type === Fragment) {
        const node = document.createDocumentFragment();
        if (props.children) {
          const children = mountChildren(props.children, env);
          insertDom(node, children);
        }
        return node;
      }
      const childVNode = type(props);
      return mount(childVNode, env);
    }
    if (isLeaf(vnode)) {
      return document.createTextNode(`${vnode}`);
    }
    if (isElement(vnode)) {
      let node;
      const {
        type,
        props
      } = vnode;
      if (!env.isSvg && type === "svg") {
        env = Object.assign({}, env, {
          isSvg: true
        });
      }
      if (!env.isSvg) {
        node = document.createElement(type);
      } else {
        node = document.createElementNS(SVG_NS, type);
      }
      mountAttributes(node, props, env);
      if (props.children) {
        let childEnv = env;
        if (env.isSvg && type === "foreignObject") {
          childEnv = Object.assign({}, childEnv, {
            isSvg: false
          });
        }
        const children = mountChildren(props.children, childEnv);
        if (children != null) insertDom(node, children);
      }
      const {
        ref
      } = props;
      if (typeof ref === "function") ref(node);
      return node;
    }
    throw new Error("mount: Invalid Vnode!");
  }
  function mountDom(vnode) {
    return mount(vnode);
  }
  const clsToolbarItem = "mm-toolbar-item";
  const clsActive = "active";
  function renderBrand() {
    return /* @__PURE__ */ jsxs("a", { className: "mm-toolbar-brand", href: "https://markmap.js.org/", children: [
      /* @__PURE__ */ jsx(
        "img",
        {
          alt: "markmap",
          src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAACoFBMVEUAAAAAAAD//wAAAACAgAD//wAAAABVVQCqqgBAQACAQACAgABmZgBtbQAAAABgQABgYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAaFQAAAAAAAAAAAAAAAAAHAAARBQIdGAIYEwI/OgJYUQUfHQI+OgJDPgJJRARBPQRJQgRRSwRRTQRIQQRUTgRUUARZUgRSTQRPSQRjWgZORQRfWQZsZAhTTQRNRwRWUAZkXAZOSARUTgZPRwRRSQRoYwZWUQZWTgRbUwZmXQZoXghmXwdqYwdsYwdfVwVmXQdqYgdiWgVpYAl3bgl6cgl4cAqLggw8OAOWjA2Uig1OSAR2bQihlg55cAh5cAh6cQmMgwyOhAyUjA2QhQ2Uiw2Viw2soBCflA+voxGwpRGhlg+hlg+snxGroBGjmBCpnBC0pxKyphKxpRG2qhK0qBK5rBK5rBP/7h3/8B7/8R3/8h3/8R7/8h786x397B3+7R3EtxT66Rz66hz76hz86xz96xz97Bz+7Rz45xz56Bz76hz97Bz97B3MvRX15Rv25Rv45xz66Rz76hz97B3+7R3IuxX05Bv15Bv25Rz56Bz66Ry/sxPAsxPCtRTCthTNvxbZyxfczxfi0xjl1Rnn2Bnr2xrr3Brs3Rru3Rru3xrv3hrw3xrx4Bvx4Rvy4hvz4hvz4xv04xv05Bv14xv15Bv15Rv25Bv25Rv25Rz25hv35hv35xv45xv45xz55xz56Bv56Bz66Rv66Rz76Rv76Rz76hz86hv86xz+7h3/7R3/7h3/7x3/8B3/8B7/8R3/8R4Yqhj5AAAAq3RSTlMAAQECAgIDAwMEBAQFBwgICAwQERITFRYXGBkbHB0eHyQlJyguNTg8RUZISU5PV2FiY2RlZmdqa2xubnJzc3R2d3d3eXl5eXp7fH1+gIGCgoKDg4SEhIWGh4eHiYmJjIyMjZSUlJ+sra+zt7i4uru8ztHV1tbW2d7g4OHi4uPk5ufp7Ozv9fX29/f3+Pj6+vr7+/v7+/v7+/z8/Pz8/f39/f39/f3+/v7+/v7K6J1dAAACHklEQVQ4y2NgwAoYWdi5uLm5GXHIcrLCmMzYpDmAhKCKjoGtp40MFhVsDAwSxmmVEzZu2XvqSLkchjw3g0h445Ybd24vmTN1Usd5X3R5DgaNqgN35sycP2/GxMkTMRVwMOivvtO3YsWUm3duX790EcMKdgbNNXdnnJh1+9T6ipzU+FB0RzIyiFYB5WdfaElUF8TmTQ6GwH39J2bvypMHcpg4MAKKkUGo5s6KWRfyGRh4WJClGEGBCgS8DLobliy/3abMwM8NBYwQjXDgf3ryxOspyKYyg+RFTFwdnYDAzbrw+oLFm9Ot3J3AwNHFTBykQrhg++GDh48cOXzk4P6VZy8s230MyAGCwwcP7iyRBJpiur1n8hQIWHX27NkLi6bAwOSuow5ABeY7OydOhoCFIAULe6E8YFCf8QAqEC86evniZTA4tfLsuRXHr0E4ly9ePF0uC3KnpH1MZBQQxPoVgxyZ5RMdBQaRMc6yIEcihWbQGaA3k9G8CfQoN0pAtSoxCMACihk9qGtBQZ2LHtRIkRUMiqwd2TJADiswsrjQlAGju/o+MLrPNkWo8mFN1ewMWmvBCebQ0rKMJG87QzF0FRwMRuvugpLcrXu3rp7Zs61UCtMZ2nVHbk+fMX/+jMmTp3Sf9MLiULG45q237txaPG3yxPYrYQzYMo60RWbD3E27Ll68Uq+AK+uJqOlZBiSEKGLNnMA0iDfzwrI/NKgBOivk9piPdtUAAAAASUVORK5CYII="
        }
      ),
      /* @__PURE__ */ jsx("span", { children: "markmap" })
    ] });
  }
  function renderItem({ title, content, onClick }) {
    return /* @__PURE__ */ jsx("div", { className: clsToolbarItem, title, onClick, children: content });
  }
  let promise;
  function safeCaller(fn) {
    return async (...args) => {
      if (promise) return;
      promise = fn(...args);
      try {
        await promise;
      } finally {
        promise = void 0;
      }
    };
  }
  const _Toolbar = class _Toolbar {
    constructor() {
      this.showBrand = true;
      this.registry = {};
      this.el = mountDom(/* @__PURE__ */ jsx("div", { className: "mm-toolbar" }));
      this.items = [..._Toolbar.defaultItems];
      this.register({
        id: "zoomIn",
        title: "Zoom in",
        content: _Toolbar.icon("M9 5v4h-4v2h4v4h2v-4h4v-2h-4v-4z"),
        onClick: this.getHandler((mm) => mm.rescale(1.25))
      });
      this.register({
        id: "zoomOut",
        title: "Zoom out",
        content: _Toolbar.icon("M5 9h10v2h-10z"),
        onClick: this.getHandler((mm) => mm.rescale(0.8))
      });
      this.register({
        id: "fit",
        title: "Fit window size",
        content: _Toolbar.icon(
          "M4 7h2v-2h2v4h-4zM4 13h2v2h2v-4h-4zM16 7h-2v-2h-2v4h4zM16 13h-2v2h-2v-4h4z"
        ),
        onClick: this.getHandler((mm) => mm.fit())
      });
      this.register({
        id: "recurse",
        title: "Toggle recursively",
        content: _Toolbar.icon("M16 4h-12v12h12v-8h-8v4h2v-2h4v4h-8v-8h10z"),
        onClick: (e) => {
          var _a;
          const button = e.target.closest(
            `.${clsToolbarItem}`
          );
          const active = button == null ? void 0 : button.classList.toggle(clsActive);
          (_a = this.markmap) == null ? void 0 : _a.setOptions({
            toggleRecursively: active
          });
        }
      });
      this.register({
        id: "dark",
        title: "Toggle dark theme",
        content: _Toolbar.icon(
          "M10 4a6 6 0 0 0 0 12a6 6 0 0 0 0 -12v2a4 4 0 0 1 0 8z"
        ),
        onClick: () => {
          document.documentElement.classList.toggle("markmap-dark");
        }
      });
      this.render();
    }
    static create(mm) {
      const toolbar = new _Toolbar();
      toolbar.attach(mm);
      return toolbar;
    }
    static icon(path, attrs = {}) {
      attrs = {
        stroke: "none",
        fill: "currentColor",
        "fill-rule": "evenodd",
        ...attrs
      };
      return /* @__PURE__ */ jsx("svg", { width: "20", height: "20", viewBox: "0 0 20 20", children: /* @__PURE__ */ jsx("path", { ...attrs, d: path }) });
    }
    /** @deprecated Set `showBrand` instead. */
    setBrand(show) {
      this.showBrand = show;
      return this.render();
    }
    register(data) {
      this.registry[data.id] = data;
    }
    getHandler(handle) {
      handle = safeCaller(handle);
      return () => {
        if (this.markmap) handle(this.markmap);
      };
    }
    setItems(items) {
      this.items = [...items];
      return this.render();
    }
    attach(mm) {
      this.markmap = mm;
    }
    render() {
      const items = this.items.map((item) => {
        if (typeof item === "string") {
          const data = this.registry[item];
          if (!data) console.warn(`[markmap-toolbar] ${item} not found`);
          return data;
        }
        return item;
      }).filter(Boolean);
      while (this.el.firstChild) {
        this.el.firstChild.remove();
      }
      this.el.append(
        mountDom(
          /* @__PURE__ */ jsxs(Fragment, { children: [
            this.showBrand && renderBrand(),
            items.map(renderItem)
          ] })
        )
      );
      return this.el;
    }
  };
  _Toolbar.defaultItems = [
    "zoomIn",
    "zoomOut",
    "fit",
    "recurse",
    "dark"
  ];
  let Toolbar = _Toolbar;
  exports.Toolbar = Toolbar;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
})(this.markmap = this.markmap || {});
