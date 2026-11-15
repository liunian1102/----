// setup-env.js
const fs = require('fs');
const vm = require('vm');

const mockStorage = {};
global.localStorage = {
    getItem: (k) => mockStorage[k] !== undefined ? mockStorage[k] : null,
    setItem: (k, v) => { mockStorage[k] = String(v); },
    removeItem: (k) => { delete mockStorage[k]; },
    clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
};

global.CanvasRenderingContext2D = class {
    constructor() {}
    save() {}
    restore() {}
    fillRect() {}
    strokeRect() {}
    clearRect() {}
    beginPath() {}
    closePath() {}
    moveTo() {}
    lineTo() {}
    arc() {}
    arcTo() {}
    quadraticCurveTo() {}
    bezierCurveTo() {}
    ellipse() {}
    roundRect() {}
    fill() {}
    stroke() {}
    measureText() { return { width: 50 }; }
    fillText() {}
    strokeText() {}
    drawImage() {}
    createRadialGradient() { return { addColorStop: () => {} }; }
    createLinearGradient() { return { addColorStop: () => {} }; }
    getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; }
    setTransform() {}
    resetTransform() {}
    translate() {}
    scale() {}
    rotate() {}
    clip() {}
    setLineDash() {}
    getLineDash() { return []; }
};

function matchesSelector(node, sel) {
    if (!node || !sel) return false;
    const s = String(sel).trim();
    if (!s) return false;
    if (s.startsWith('.')) {
        const cls = s.slice(1);
        const nodeCls = String(node.className || (node.attributes && node.attributes.class) || '');
        return nodeCls.split(/\s+/).includes(cls);
    }
    if (s.includes('.')) {
        const [tagPart, clsPart] = s.split('.');
        const tagMatch = String(node.tagName || '').toLowerCase() === tagPart.toLowerCase();
        const nodeCls = String(node.className || (node.attributes && node.attributes.class) || '');
        return tagMatch && nodeCls.split(/\s+/).includes(clsPart);
    }
    return String(node.tagName || '').toLowerCase() === s.toLowerCase();
}

function createDummyElem(tag = 'div', ns = 'http://www.w3.org/1999/xhtml') {
    const isSvg = ns === 'http://www.w3.org/2000/svg' || ['svg', 'g', 'rect', 'text', 'line', 'path', 'title', 'defs', 'lineargradient', 'stop'].includes(String(tag).toLowerCase());
    const attrs = {};
    let _innerHTML = '';
    const el = {
        tagName: String(tag || 'div').toUpperCase(),
        nodeName: String(tag || 'div').toUpperCase(),
        nodeType: 1,
        namespaceURI: isSvg ? 'http://www.w3.org/2000/svg' : ns,
        get ownerDocument() { return global.document; },
        attributes: attrs,
        className: '',
        style: { setProperty(k, v) { this[k] = v; }, removeProperty(k) { delete this[k]; }, background: '', color: '', display: '' },
        dataset: {},
        classList: {
            add: (...cls) => {
                const cur = new Set(String(el.className || '').split(/\s+/).filter(Boolean));
                cls.forEach(c => cur.add(c));
                el.className = Array.from(cur).join(' ');
                attrs.class = el.className;
            },
            remove: (...cls) => {
                const cur = new Set(String(el.className || '').split(/\s+/).filter(Boolean));
                cls.forEach(c => cur.delete(c));
                el.className = Array.from(cur).join(' ');
                attrs.class = el.className;
            },
            toggle: () => {},
            contains: (c) => String(el.className || '').split(/\s+/).includes(c)
        },
        innerText: '',
        get innerHTML() { return _innerHTML; },
        set innerHTML(val) {
            _innerHTML = String(val || '');
            if (_innerHTML === '') {
                el.children = [];
                el.firstChild = null;
                el.lastChild = null;
            } else if (!isSvg && el.children.length === 0) {
                for (let i = 0; i < 6; i++) {
                    el.children.push({
                        style: { setProperty() {}, removeProperty() {}, background: '', color: '' },
                        textContent: '',
                        children: []
                    });
                }
                el.firstChild = el.children[0];
                el.lastChild = el.children[el.children.length - 1];
            }
        },
        addEventListener: () => {},
        appendChild: (child) => {
            if (child && !child._isSlot) {
                el.children = el.children.filter(c => !c._isSlot);
            }
            el.children.push(child);
            el.firstChild = el.children[0] || null;
            el.lastChild = el.children[el.children.length - 1] || null;
            return child;
        },
        insertBefore: (child, next) => {
            if (child && !child._isSlot) {
                el.children = el.children.filter(c => !c._isSlot);
            }
            if (!next) {
                el.children.push(child);
            } else {
                const idx = el.children.indexOf(next);
                if (idx >= 0) el.children.splice(idx, 0, child);
                else el.children.push(child);
            }
            el.firstChild = el.children[0] || null;
            el.lastChild = el.children[el.children.length - 1] || null;
            return child;
        },
        append: (...children) => {
            el.children = el.children.filter(c => !c._isSlot);
            el.children.push(...children);
            el.firstChild = el.children[0] || null;
            el.lastChild = el.children[el.children.length - 1] || null;
        },
        querySelector: (sel) => {
            const all = el.querySelectorAll(sel);
            return all.length > 0 ? all[0] : createDummyElem();
        },
        querySelectorAll: (sel) => {
            const out = [];
            const walk = (node) => {
                if (!node || !Array.isArray(node.children)) return;
                for (const ch of node.children) {
                    if (ch && !ch._isSlot) {
                        if (matchesSelector(ch, sel)) out.push(ch);
                        walk(ch);
                    }
                }
            };
            walk(el);
            return out;
        },
        setAttribute: (k, v) => {
            attrs[k] = String(v);
            if (k === 'class') el.className = String(v);
        },
        setAttributeNS: (nsUri, k, v) => {
            attrs[k] = String(v);
            if (k === 'class') el.className = String(v);
        },
        getAttribute: (k) => (attrs[k] !== undefined ? attrs[k] : null),
        removeAttribute: (k) => {
            delete attrs[k];
            if (k === 'class') el.className = '';
        },
        offsetWidth: 800,
        offsetHeight: 600,
        clientWidth: 800,
        clientHeight: 600,
        width: 800,
        height: 600,
        textContent: '',
        firstChild: null,
        lastChild: null,
        children: [],
        getContext: () => new global.CanvasRenderingContext2D(),
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 })
    };
    if (!isSvg) {
        // 预分配多层子元素插槽,支持如 row.children[0].style.background 等安全访问
        for (let i = 0; i < 6; i++) {
            el.children.push({
                _isSlot: true,
                style: { setProperty() {}, removeProperty() {}, background: '', color: '' },
                textContent: '',
                children: []
            });
        }
        el.firstChild = el.children[0];
        el.lastChild = el.children[el.children.length - 1];
    }
    return el;
}

const dummyElem = createDummyElem();

global.window = global;
global.window.addEventListener = () => {};
global.window.innerWidth = 1024;
global.window.innerHeight = 768;
global.window.devicePixelRatio = 1;
global.window.location = { hash: '', hostname: 'localhost' };
global.window.requestAnimationFrame = (fn) => 1;
global.window.cancelAnimationFrame = (id) => {};
global.setInterval = () => 1;
global.clearInterval = () => {};

global.document = {
    documentElement: dummyElem,
    getElementById: (id) => dummyElem,
    querySelectorAll: () => [],
    createElement: (tag) => createDummyElem(tag, 'http://www.w3.org/1999/xhtml'),
    createElementNS: (ns, tag) => createDummyElem(tag, ns),
    body: dummyElem,
    hidden: false,
    addEventListener: () => {}
};

global.navigator = {
    maxTouchPoints: 0,
    vibrate: () => {}
};

global.AudioContext = class {
    constructor() { this.destination = {}; this.currentTime = 0; this.state = 'running'; }
    createGain() { return { gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {}, linearRampToValueAtTime: () => {}, cancelScheduledValues: () => {} }, connect: () => {} }; }
    createOscillator() { return { type: '', frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }, start: () => {}, stop: () => {}, connect: () => {} }; }
    createBiquadFilter() {
        const filter = {
            type: 'lowpass',
            frequency: {
                value: 20000,
                setValueAtTime(v) { this.value = v; },
                exponentialRampToValueAtTime(v) { this.value = v; },
                cancelScheduledValues() {}
            },
            Q: { setValueAtTime() {} },
            connect: () => {}
        };
        return filter;
    }
    createBufferSource() { return { buffer: null, connect: () => {}, start: () => {}, stop: () => {} }; }
    createBuffer() { return { getChannelData: () => new Float32Array(1000) }; }
};
global.webkitAudioContext = global.AudioContext;
global.WebSocket = class {
    constructor() {}
    send() {}
    close() {}
};

const path = require('path');
const d3MinPath = path.resolve(__dirname, '../node_modules/d3/dist/d3.min.js');
if (fs.existsSync(d3MinPath)) {
    vm.runInThisContext(fs.readFileSync(d3MinPath, 'utf8'));
}
// 角色立绘表(node 里没有 Image,Art 自动禁用,渲染走原来的矢量方块画法)
vm.runInThisContext(fs.readFileSync(path.resolve(__dirname, '../art.js'), 'utf8'));
const gamePath = path.resolve(__dirname, '../game.js');
const code = fs.readFileSync(gamePath, 'utf8');
vm.runInThisContext(code);

if (typeof Sound !== 'undefined' && Sound.init) {
    Sound.init();
}

module.exports = { mockStorage };
