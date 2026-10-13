/*
  쌓기나무 3D 뷰어 (수학 6-2 3단원 공간과 입체, 교사 시연용)
  - 단원 계획: ../수학6-2-3단원-00-단원계획-공간과-입체.md (방식 A, 교사 선택 2026-10-01)
  - 의존: 같은 폴더의 three.min.js (three.js r149, MIT). 인터넷 없이 동작한다.
  - 슬라이드에 이렇게 넣는다. 스크립트가 불러올 때 자동으로 그린다.

      <div class="blocks-viewer" style="width:1400px;height:640px"
           data-shapes='[{"label":"가","heights":[[1,2],[2,2]]}]'
           data-tools="angles,build,views,numbers,layers,ghost,count"
           data-open="views"></div>

    heights: 위에서 본 모양에 쓴 수와 같다. 첫 줄이 뒤쪽, 마지막 줄이 앞쪽이다. 0은 빈칸.
    tools  : angles(처음 각도·위·앞·옆) build(쌓기·빼기·처음 모양) views(본 모양) numbers(수 쓰기)
             layers(층 나누기) ghost(투명하게) count(개수 보기). 쓰지 않을 버튼은 빼면 된다.
    open   : 처음부터 켜 둘 기능 (views, numbers, layers, ghost, count)
    shapes에 모양을 여러 개 넣으면 나란히 놓이고 함께 돌아간다.
    marks  : 색을 칠할 쌓기나무 [[줄, 칸, 층], ...] (모두 0부터). 예: "marks":[[0,2,0]] → 첫 줄 세 번째 칸 1층.
    colors : 자리마다 다른 색 {"줄,칸": "#색"}. 예: "colors":{"0,0":"#F4B6C2"} (교과서처럼 자리별로 색을 나눌 때)
    data-start: "add"이면 처음부터 [쌓기]가 켜진 채로 시작한다 (빈 바닥에서 쌓아 갈 때).
    data-views: 본 모양 중 보여 줄 것 "위,앞,옆"에서 고른다. 예: "위" (옆 모양이 답을 알려 줄 때)
    tools 의 floors(층별 모양): 1층, 2층, …을 위에서 본 모양을 옆에 띄운다. 본 모양과 번갈아 켜진다.
    data-home : 처음 각도 "옆으로 돌린 각도,내려다보는 각도" (기본 35,28). 예: "20,25"
    data-right: "1"이면 바닥 오른쪽에 '오른쪽' 표시를 둔다 (2학년 방식으로 위치를 말할 때).

  - 조작: 모양을 끌어서 돌린다. 버튼은 아래 줄에 있다. 방향키·스페이스는 슬라이드 넘김에 그대로 쓴다.
    쌓기: 쌓기나무의 윗면·옆면이나 바닥 칸을 누르면 그 자리에 하나 놓인다 (놓일 자리가 초록으로 미리 보인다).
    빼기: 쌓기나무를 누르면 그 줄의 맨 위 하나가 빠진다. 공중에 뜨는 모양은 만들 수 없다 (초등 범위, 지도서 162쪽).
    처음 모양: 쌓고 뺀 것을 처음 모양으로 되돌린다. 슬라이드를 다시 열어도 처음 모양으로 돌아온다.
  - 실행 중에 만든 요소에는 data-runtime을 붙여 편집 모드 저장본에 남지 않게 한다.
  - 색·크기 값은 AI 임시값이다 (스타일 가이드에 쌓기나무 색 기준 없음).
*/
(function () {
  'use strict';
  const T = window.THREE;
  const DEG = Math.PI / 180;
  const C = { face: 0xF2D49B, red: 0xF0806A, edge: 0x3B2A17, number: '#FFE79B', mark: '#B7B7B7', add: 0x4CCB78, remove: 0xF2A24B, grid: 0x4A4A4A };
  const HOME = { theta: 35, phi: 28 };
  const ANGLES = { home: HOME, top: { theta: 0, phi: 90 }, front: { theta: 0, phi: 0 }, side: { theta: 90, phi: 0 } };
  const TOOL_LABELS = {
    home: '처음 각도', top: '위', front: '앞', side: '옆',
    add: '쌓기', remove: '빼기', reset: '처음 모양',
    views: '본 모양', floors: '층별 모양', numbers: '수 쓰기', layers: '층 나누기', ghost: '투명하게', count: '개수 보기'
  };
  const LAYER_GAP = 0.9;
  const MAX_SIZE = 8, MAX_HEIGHT = 8;   // 쌓기로 넓어질 수 있는 한계 (AI 임시값)

  /* ── 모양 계산 ── */
  function analyze(heights) {
    const rows = heights.length, cols = Math.max(0, ...heights.map(r => r.length));
    const h = (r, c) => (heights[r] && heights[r][c]) || 0;
    let max = 0, total = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { max = Math.max(max, h(r, c)); total += h(r, c); }
    const front = [], side = [];
    for (let c = 0; c < cols; c++) { let m = 0; for (let r = 0; r < rows; r++) m = Math.max(m, h(r, c)); front.push(m); }
    // 오른쪽 옆에서 보면 왼쪽이 앞, 오른쪽이 뒤
    for (let r = rows - 1; r >= 0; r--) { let m = 0; for (let c = 0; c < cols; c++) m = Math.max(m, h(r, c)); side.push(m); }
    return { rows, cols, max, total, h, front, side };
  }
  const key = (r, c) => r + ',' + c;
  function toCells(heights) {
    const m = new Map();
    heights.forEach((row, r) => row.forEach((n, c) => { if (n > 0) m.set(key(r, c), n); }));
    return m;
  }
  function bounds(cells) {
    let b = null;
    cells.forEach((n, k) => {
      const [r, c] = k.split(',').map(Number);
      if (!b) b = { r0: r, r1: r, c0: c, c1: c };
      else { b.r0 = Math.min(b.r0, r); b.r1 = Math.max(b.r1, r); b.c0 = Math.min(b.c0, c); b.c1 = Math.max(b.c1, c); }
    });
    return b;
  }

  /* ── 글자 스프라이트 ── */
  // size: 글자 높이(쌓기나무 한 변 기준). 글자 수에 맞춰 가로를 늘린다.
  function textSprite(text, color, size) {
    const font = '800 170px Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
    const cv = document.createElement('canvas'), g = cv.getContext('2d');
    g.font = font;
    const w = g.measureText(text).width;   // 캔버스 크기를 바꾸면 글꼴 설정이 지워지므로 먼저 잰다
    cv.height = 256; cv.width = Math.max(256, Math.ceil(w + 60));
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 22; g.strokeStyle = '#050505'; g.strokeText(text, cv.width / 2, 136);
    g.fillStyle = color; g.fillText(text, cv.width / 2, 136);
    const sp = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(cv), depthTest: false, transparent: true }));
    sp.scale.set(size * cv.width / 256, size, 1); sp.renderOrder = 10;
    return sp;
  }

  const GEO = new T.BoxGeometry(1, 1, 1), EDGES = new T.EdgesGeometry(GEO);
  const FLOOR = new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

  /* ── 한 모양을 그리는 화면 ── */
  function View(el, shape, state) {
    this.el = el; this.state = state;
    this.original = shape.heights;
    this.originalMarks = (shape.marks || []).map(m => m.join(','));
    this.cells = toCells(shape.heights);
    this.marks = new Set(this.originalMarks);   // 색칠한 쌓기나무 "줄,칸,층"
    this.colors = shape.colors || {};
    this.colorMats = {};
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    const cv = this.renderer.domElement;
    cv.setAttribute('data-runtime', ''); cv.className = 'bv-canvas';
    el.appendChild(cv);

    this.scene = new T.Scene();
    this.scene.add(new T.AmbientLight(0xffffff, 0.55));
    const keyLight = new T.DirectionalLight(0xffffff, 0.6); keyLight.position.set(0.6, 1.4, 1.0); this.scene.add(keyLight);
    const fill = new T.DirectionalLight(0xffffff, 0.25); fill.position.set(-1, 0.5, -0.8); this.scene.add(fill);

    this.mat = new T.MeshLambertMaterial({ color: C.face, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    this.redMat = new T.MeshLambertMaterial({ color: C.red, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    this.markMat = new T.MeshLambertMaterial({ color: C.remove, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    this.lineMat = new T.LineBasicMaterial({ color: C.edge, transparent: true });   // 투명한 면보다 나중에 그려 모서리가 보이게
    this.pickMat = new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

    // 쌓기 미리 보기
    this.preview = new T.Group();
    this.preview.add(
      new T.Mesh(GEO, new T.MeshBasicMaterial({ color: C.add, transparent: true, opacity: 0.35, depthWrite: false })),
      new T.LineSegments(EDGES, new T.LineBasicMaterial({ color: C.add }))
    );
    this.preview.visible = false; this.scene.add(this.preview);

    this.camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this.raycaster = new T.Raycaster();
    this.rebuild();

    // 끌면 돌리고, 제자리에서 누르면 쌓기·빼기
    let down = null;
    cv.addEventListener('pointerdown', e => {
      down = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
      cv.setPointerCapture(e.pointerId); state.stopTween();
    });
    cv.addEventListener('pointermove', e => {
      if (!down) { this.hover(e); return; }
      if (Math.hypot(e.clientX - down.sx, e.clientY - down.sy) > 6) down.moved = true;
      if (!down.moved) return;
      this.clearHover();
      const k = 0.45 * (cv.clientWidth / cv.getBoundingClientRect().width || 1);
      state.theta -= (e.clientX - down.x) * k;
      state.phi = Math.max(0, Math.min(90, state.phi + (e.clientY - down.y) * k));
      down.x = e.clientX; down.y = e.clientY; state.changed();
    });
    cv.addEventListener('pointerup', e => {
      if (down && !down.moved && state.mode) this.edit(this.pick(e));
      down = null; this.hover(e);
    });
    cv.addEventListener('pointercancel', () => { down = null; });
    cv.addEventListener('pointerleave', () => { if (!down) { this.clearHover(); this.render(); } });

    new ResizeObserver(() => this.resize()).observe(el);
  }

  View.prototype.h = function (r, c) { return this.cells.get(key(r, c)) || 0; };

  // 쌓기나무·수·앞 표시·바닥 칸을 지금 모양으로 다시 만든다
  View.prototype.rebuild = function () {
    if (this.root) {
      this.scene.remove(this.root);
      this.root.traverse(o => { if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); } if (o.userData.ownGeo) o.geometry.dispose(); });
    }
    this.root = new T.Group(); this.scene.add(this.root);
    this.hovered = null; this.preview.visible = false;

    const b = bounds(this.cells) || { r0: 0, r1: 0, c0: 0, c1: 0 };
    const heights = [];
    for (let r = b.r0; r <= b.r1; r++) { const row = []; for (let c = b.c0; c <= b.c1; c++) row.push(this.h(r, c)); heights.push(row); }
    this.a = analyze(heights);
    this.b = b;
    this.cx = (b.c0 + b.c1 + 1) / 2; this.cz = (b.r0 + b.r1 + 1) / 2;   // 모양 가운데를 원점에 둔다

    this.blocks = []; this.pickables = [];
    this.cells.forEach((n, k) => {
      const [r, c] = k.split(',').map(Number);
      for (let i = 0; i < n; i++) {
        const g = new T.Group();
        const mesh = new T.Mesh(GEO, this.marks.has(r + ',' + c + ',' + i) ? this.redMat : this.colorMat(this.colors[r + ',' + c]) || this.mat), line = new T.LineSegments(EDGES, this.lineMat);
        line.renderOrder = 1;
        mesh.userData = { r, c, k: i, block: true };
        g.add(mesh, line); g.userData = { r, c, k: i, mesh };
        this.root.add(g); this.blocks.push(g); this.pickables.push(mesh);
      }
    });
    // 수 쓰기: 기둥 꼭대기 위의 수
    this.numbers = [];
    this.cells.forEach((n, k) => {
      const [r, c] = k.split(',').map(Number);
      const s = textSprite(String(n), C.number, 0.8);
      s.userData = { r, c, top: n - 1 };
      this.root.add(s); this.numbers.push(s);
    });
    // 바닥의 '앞' 표시
    const shape = new T.Shape();
    shape.moveTo(0, 0.35); shape.lineTo(0.3, -0.15); shape.lineTo(-0.3, -0.15); shape.closePath();   // 모양 쪽을 가리킨다
    const arrow = new T.Mesh(new T.ShapeGeometry(shape), new T.MeshBasicMaterial({ color: C.mark, side: T.DoubleSide }));
    arrow.userData.ownGeo = true;
    arrow.rotation.x = -Math.PI / 2;
    const frontZ = b.r1 + 1 - this.cz + (this.state.mode ? 1 : 0);
    arrow.position.set(0, 0.01, frontZ + 0.55);
    const label = textSprite('앞', C.mark, 0.75);
    label.position.set(0, 0.35, frontZ + 1.35);
    this.root.add(arrow, label);
    this.labels = [label];
    if (this.state.right) {   // '오른쪽' 표시
      const right = textSprite('오른쪽', C.mark, 0.75);
      right.position.set(b.c1 + 1 - this.cx + (this.state.mode ? 1 : 0) + 0.4 + right.scale.x / 2, 0.35, 0);
      this.root.add(right); this.labels.push(right);
    }

    // 쌓기 중에는 둘레 한 칸까지 바닥 칸을 보여 준다
    if (this.state.mode) {
      const pts = [];
      const R0 = b.r0 - 1, R1 = b.r1 + 1, C0 = b.c0 - 1, C1 = b.c1 + 1;
      const X = c => c - this.cx, Z = r => r - this.cz;
      for (let r = R0; r <= R1 + 1; r++) pts.push(X(C0), 0, Z(r), X(C1 + 1), 0, Z(r));
      for (let c = C0; c <= C1 + 1; c++) pts.push(X(c), 0, Z(R0), X(c), 0, Z(R1 + 1));
      const gg = new T.BufferGeometry(); gg.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
      const grid = new T.LineSegments(gg, new T.LineBasicMaterial({ color: C.grid }));
      grid.userData.ownGeo = true;
      this.root.add(grid);
      for (let r = R0; r <= R1; r++) for (let c = C0; c <= C1; c++) if (!this.h(r, c)) {
        const cell = new T.Mesh(FLOOR, this.pickMat);
        cell.position.set(X(c) + 0.5, 0, Z(r) + 0.5);
        cell.userData = { r, c, floor: true };
        this.root.add(cell); this.pickables.push(cell);
      }
    }
    this.apply();
  };

  View.prototype.colorMat = function (hex) {
    if (!hex) return null;
    if (!this.colorMats[hex]) this.colorMats[hex] = new T.MeshLambertMaterial({ color: new T.Color(hex), polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    return this.colorMats[hex];
  };

  View.prototype.place = function (obj, r, c, k) {
    const lift = this.state.layers * LAYER_GAP;
    obj.position.set(c + 0.5 - this.cx, k + 0.5 + k * lift, r + 0.5 - this.cz);
  };

  View.prototype.apply = function () {
    const s = this.state, a = this.a, lift = s.layers * LAYER_GAP;
    this.blocks.forEach(g => this.place(g, g.userData.r, g.userData.c, g.userData.k));
    this.numbers.forEach(n => {
      const d = n.userData; n.visible = s.numbers > 0.01;
      n.material.opacity = s.numbers;
      n.position.set(d.c + 0.5 - this.cx, d.top + 1 + d.top * lift + 0.55, d.r + 0.5 - this.cz);
    });
    [this.mat, this.markMat, this.redMat, ...Object.values(this.colorMats)].forEach(m => {
      m.transparent = s.ghost > 0.01; m.opacity = 1 - 0.8 * s.ghost; m.depthWrite = s.ghost < 0.01;
    });
    this.lineMat.depthTest = s.ghost < 0.5;

    // 화면에 들어올 크기: 모양·앞 표시·바닥 칸의 점들을 여러 각도에서 비춰 보고 가장 큰 폭에 맞춘다.
    // 돌리는 동안 크기가 바뀌지 않도록 각도마다 다시 맞추지 않는다.
    const m = s.mode ? 1 : 0, levels = Math.max(1, a.max + m), H = levels + (levels - 1) * lift + (s.numbers > 0.01 ? 0.9 : 0);
    const W = Math.max(1, a.cols) / 2 + m, D = Math.max(1, a.rows) / 2 + m;
    const pts = [];
    [-W, W].forEach(x => [-D, D].forEach(z => [0, H].forEach(y => pts.push(new T.Vector3(x, y, z)))));
    this.labels.forEach(l => {
      const w = l.scale.x / 2, h = l.scale.y / 2, p = l.position;
      [-w, w].forEach(dx => [-h, h].forEach(dy => pts.push(new T.Vector3(p.x + dx, p.y + dy, p.z)))); 
    });
    const box = new T.Box3().setFromPoints(pts);
    this.center = box.getCenter(new T.Vector3());
    this.ext = { x: 0, y: 0 };
    const q = new T.Quaternion(), v = new T.Vector3();
    for (let th = 0; th < 360; th += 30) for (const ph of [0, 30, 60, 90]) {
      q.setFromEuler(new T.Euler(-ph * DEG, th * DEG, 0, 'YXZ')).invert();
      pts.forEach(p => { v.copy(p).sub(this.center).applyQuaternion(q); this.ext.x = Math.max(this.ext.x, Math.abs(v.x)); this.ext.y = Math.max(this.ext.y, Math.abs(v.y)); });
    }
  };

  View.prototype.resize = function () {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    const scale = this.el.getBoundingClientRect().width / w || 1;   // 슬라이드 확대·축소 비율
    this.renderer.setPixelRatio(Math.min(3, (window.devicePixelRatio || 1) * scale));
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px'; this.renderer.domElement.style.height = h + 'px';
    this.aspect = w / h; this.render();
  };

  View.prototype.render = function () {
    if (!this.aspect) return;
    const s = this.state, cam = this.camera;
    const r = Math.max(this.ext.y, this.ext.x / this.aspect) * 1.06;
    cam.left = -r * this.aspect; cam.right = r * this.aspect; cam.top = r; cam.bottom = -r; cam.updateProjectionMatrix();
    const q = new T.Quaternion().setFromEuler(new T.Euler(-s.phi * DEG, s.theta * DEG, 0, 'YXZ'));
    cam.quaternion.copy(q);
    cam.position.copy(new T.Vector3(0, 0, 50).applyQuaternion(q).add(this.center));
    cam.updateMatrixWorld();
    this.renderer.render(this.scene, cam);
  };

  /* ── 쌓기·빼기 ── */
  // 누른 곳에서 할 일을 찾는다: { add: [r, c] } 또는 { remove: [r, c] }
  View.prototype.pick = function (e) {
    const mode = this.state.mode;
    if (!mode || !this.aspect) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new T.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
    if (!hit) return null;
    const d = hit.object.userData;
    if (mode === 'remove') return d.block ? { remove: [d.r, d.c] } : null;
    if (d.floor) return this.canAdd(d.r, d.c, 0) ? { add: [d.r, d.c] } : null;
    const n = hit.face.normal;
    if (n.y > 0.5) return d.k === this.h(d.r, d.c) - 1 && this.canAdd(d.r, d.c, d.k + 1) ? { add: [d.r, d.c] } : null;
    if (n.y < -0.5) return null;
    const r = d.r + Math.round(n.z), c = d.c + Math.round(n.x);
    return this.canAdd(r, c, d.k) ? { add: [r, c] } : null;   // 옆 칸의 높이가 맞아야 뜨지 않는다
  };
  View.prototype.canAdd = function (r, c, level) {
    if (this.h(r, c) !== level || level >= MAX_HEIGHT) return false;
    const b = this.b, empty = !this.cells.size;
    const rows = empty ? 1 : Math.max(b.r1, r) - Math.min(b.r0, r) + 1, cols = empty ? 1 : Math.max(b.c1, c) - Math.min(b.c0, c) + 1;
    return rows <= MAX_SIZE && cols <= MAX_SIZE;
  };
  View.prototype.edit = function (act) {
    if (!act) return;
    if (act.add) { const [r, c] = act.add; this.cells.set(key(r, c), this.h(r, c) + 1); }
    if (act.remove) { const [r, c] = act.remove, n = this.h(r, c) - 1; this.marks.delete(r + ',' + c + ',' + n); if (n > 0) this.cells.set(key(r, c), n); else this.cells.delete(key(r, c)); }
    this.rebuild(); this.render(); this.state.shapeChanged();
  };
  View.prototype.reset = function () { this.cells = toCells(this.original); this.marks = new Set(this.originalMarks); this.rebuild(); this.render(); };
  View.prototype.clearHover = function () {
    if (this.hovered) this.hovered.mesh.material = this.hovered.was;
    this.hovered = null; this.preview.visible = false;
  };
  View.prototype.hover = function (e) {
    const before = (this.hovered ? 'm' + this.hovered.r + ',' + this.hovered.c : '') + (this.preview.visible ? 'p' + this.preview.position.toArray() : '');
    this.clearHover();
    const act = this.pick(e);
    if (act && act.add) {
      const [r, c] = act.add;
      this.place(this.preview, r, c, this.h(r, c)); this.preview.visible = true;
    } else if (act && act.remove) {
      const [r, c] = act.remove, top = this.h(r, c) - 1;
      const g = this.blocks.find(x => x.userData.r === r && x.userData.c === c && x.userData.k === top);
      if (g) { this.hovered = { mesh: g.userData.mesh, was: g.userData.mesh.material, r, c }; g.userData.mesh.material = this.markMat; }
    }
    const after = (this.hovered ? 'm' + this.hovered.r + ',' + this.hovered.c : '') + (this.preview.visible ? 'p' + this.preview.position.toArray() : '');
    if (before !== after) this.render();
  };

  /* ── 위·앞·옆에서 본 모양 (평면 그림) ── */
  function svgGrid(cells, w, h, unit, numbers) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', w * unit + 4); svg.setAttribute('height', h * unit + 4);
    cells.forEach(([x, y, n]) => {
      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('x', x * unit + 2); rect.setAttribute('y', y * unit + 2);
      rect.setAttribute('width', unit); rect.setAttribute('height', unit);
      rect.setAttribute('fill', '#F2D49B'); rect.setAttribute('stroke', '#3B2A17'); rect.setAttribute('stroke-width', 2);
      svg.appendChild(rect);
      if (numbers && n) {
        const t = document.createElementNS(ns, 'text');
        t.setAttribute('x', x * unit + 2 + unit / 2); t.setAttribute('y', y * unit + 2 + unit / 2);
        t.setAttribute('text-anchor', 'middle'); t.setAttribute('dominant-baseline', 'central');
        t.setAttribute('font-size', unit * 0.62); t.setAttribute('font-weight', 800); t.setAttribute('fill', '#050505');
        t.textContent = n; svg.appendChild(t);
      }
    });
    return svg;
  }
  function drawViews(box, a, unit, numbers, only) {
    box.innerHTML = '';
    const top = [], front = [], side = [];
    for (let r = 0; r < a.rows; r++) for (let c = 0; c < a.cols; c++) if (a.h(r, c)) top.push([c, r, a.h(r, c)]);
    a.front.forEach((m, c) => { for (let k = 0; k < m; k++) front.push([c, a.max - 1 - k]); });
    a.side.forEach((m, i) => { for (let k = 0; k < m; k++) side.push([i, a.max - 1 - k]); });
    [['위', svgGrid(top, a.cols, a.rows, unit, numbers)],
     ['앞', svgGrid(front, a.cols, a.max, unit)],
     ['옆', svgGrid(side, a.rows, a.max, unit)]].filter(([name]) => !only || only.includes(name)).forEach(([name, svg]) => {
      const fig = document.createElement('figure'); fig.className = 'bv-view';
      fig.appendChild(svg);
      const cap = document.createElement('figcaption'); cap.textContent = name; fig.appendChild(cap);
      box.appendChild(fig);
    });
  }

  function drawFloors(box, a, unit) {
    box.innerHTML = '';
    for (let k = 1; k <= a.max; k++) {
      const cells = [];
      for (let r = 0; r < a.rows; r++) for (let c = 0; c < a.cols; c++) if (a.h(r, c) >= k) cells.push([c, r]);
      const fig = document.createElement('figure'); fig.className = 'bv-view';
      fig.appendChild(svgGrid(cells, a.cols, a.rows, unit));
      const cap = document.createElement('figcaption'); cap.textContent = k + '층'; fig.appendChild(cap);
      box.appendChild(fig);
    }
  }

  /* ── 여러 모양을 함께 움직이는 묶음 ── */
  const mounted = new WeakSet();
  function mount(host) {
    if (mounted.has(host)) return;   // 저장본에 흔적을 남기지 않도록 속성 대신 WeakSet
    mounted.add(host);
    const shapes = JSON.parse(host.dataset.shapes || '[]');
    if (!shapes.length && host.dataset.heights) shapes.push({ heights: JSON.parse(host.dataset.heights) });
    const tools = (host.dataset.tools || 'angles,build,views,numbers,layers,ghost,count').split(',').map(s => s.trim());
    const open = (host.dataset.open || '').split(',').map(s => s.trim());
    const flag = k => (open.includes(k) ? 1 : 0);
    const onlyViews = host.dataset.views ? host.dataset.views.split(',').map(s => s.trim()) : null;
    const home = host.dataset.home ? (([t, f]) => ({ theta: +t, phi: +f }))(host.dataset.home.split(',')) : HOME;

    const ui = document.createElement('div'); ui.className = 'bv-ui'; ui.setAttribute('data-runtime', '');
    host.appendChild(ui);
    const row = document.createElement('div'); row.className = 'bv-row'; ui.appendChild(row);

    const views = [];
    const state = {
      theta: home.theta, phi: home.phi, mode: null, home, right: host.dataset.right === '1',
      views: flag('views'), numbers: flag('numbers'), layers: flag('layers'), ghost: flag('ghost'), count: flag('count'),
      tween: null,
      changed() { views.forEach(v => v.render()); },
      shapeChanged() { sync(); },
      stopTween() { if (this.tween) cancelAnimationFrame(this.tween); this.tween = null; },
      animate(target, ms) {
        this.stopTween();
        const from = {}; Object.keys(target).forEach(k => { from[k] = this[k]; });
        if ('theta' in target) {   // 가까운 쪽으로 돌기
          const d = ((target.theta - from.theta) % 360 + 540) % 360 - 180;
          target = Object.assign({}, target, { theta: from.theta + d });
        }
        const t0 = performance.now();
        const step = now => {
          const p = Math.min(1, (now - t0) / ms), e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          Object.keys(target).forEach(k => { this[k] = from[k] + (target[k] - from[k]) * e; });
          views.forEach(v => { v.apply(); v.render(); });
          this.tween = p < 1 ? requestAnimationFrame(step) : null;
        };
        this.tween = requestAnimationFrame(step);
      }
    };

    const multi = shapes.length > 1;
    const BASE = multi ? 30 : 44;   // 평면 그림 한 칸 크기 (AI 임시값). 모양이 커지면 자리에 맞게 줄인다.
    function fitUnit() {
      let u = BASE;
      views.forEach(v => {
        const a = v.a;
        if (multi) {
          const w = v.el.parentNode.clientWidth;
          if (w) u = Math.min(u, Math.floor((w - 60) / Math.max(1, state.floorsOn ? a.cols * a.max : 2 * a.cols + a.rows)));
        } else {
          const h = row.clientHeight;
          const figRows = a.max >= 3 ? Math.ceil(a.max / 2) : a.max;   // 층이 3개 이상이면 두 줄로 놓는다
          if (h) u = Math.min(u, state.floorsOn
            ? Math.floor((h - 70 * figRows - 80) / Math.max(1, a.rows * figRows))
            : Math.floor((h - 300) / Math.max(1, a.rows + 2 * a.max)));
        }
      });
      return Math.max(14, u);
    }
    shapes.forEach(sh => {
      const col = document.createElement('div'); col.className = 'bv-col'; row.appendChild(col);
      const vp = document.createElement('div'); vp.className = 'bv-viewport'; col.appendChild(vp);
      const v = new View(vp, sh, state); views.push(v);
      const side = document.createElement('div'); side.className = 'bv-side'; col.appendChild(side);
      if (!sh.label && !tools.includes('views') && !tools.includes('floors') && !tools.includes('count')) side.style.display = 'none';   // 빈 자리를 남기지 않는다
      if (sh.label) { const l = document.createElement('div'); l.className = 'bv-label'; l.textContent = sh.label; side.appendChild(l); }
      const cnt = document.createElement('div'); cnt.className = 'bv-count'; side.appendChild(cnt);
      const box = document.createElement('div'); box.className = 'bv-views'; side.appendChild(box);
      v.extra = { cnt, box };
    });
    ui.classList.toggle('bv-multi', multi);

    const bar = document.createElement('div'); bar.className = 'bv-bar'; ui.appendChild(bar);
    const buttons = {};
    const addBtn = (k, onClick) => {
      const b = document.createElement('button'); b.type = 'button'; b.tabIndex = -1;
      b.textContent = TOOL_LABELS[k]; b.dataset.key = k;
      b.addEventListener('click', e => { e.stopPropagation(); b.blur(); onClick(); });
      bar.appendChild(b); buttons[k] = b;
    };
    const gap = () => { if (bar.lastChild) bar.lastChild.classList.add('bv-end'); };
    if (tools.includes('angles')) { ['home', 'top', 'front', 'side'].forEach(k => addBtn(k, () => state.animate(Object.assign({}, k === 'home' ? home : ANGLES[k]), 650))); gap(); }
    if (tools.includes('build')) {
      ['add', 'remove'].forEach(k => addBtn(k, () => {
        const wasOn = !!state.mode;
        state.mode = state.mode === k ? null : k;
        if (wasOn !== !!state.mode) views.forEach(v => { v.rebuild(); v.render(); });   // 바닥 칸을 보이거나 숨긴다
        views.forEach(v => { v.clearHover(); v.render(); });
        views.forEach(v => v.el.classList.toggle('bv-editing', !!state.mode));
        sync();
      }));
      addBtn('reset', () => { views.forEach(v => v.reset()); sync(); });
      gap();
      if (host.dataset.start === 'add') buttons.add.click();
    }
    const TOGGLES = ['views', 'floors', 'numbers', 'layers', 'ghost', 'count'];
    TOGGLES.forEach(k => {
      if (!tools.includes(k)) return;
      addBtn(k, () => {
        const on = state[k] < 0.5 ? 1 : 0;
        if (k === 'layers' || k === 'ghost' || k === 'numbers') state.animate({ [k]: on }, 450);
        else state[k] = on;
        state[k + 'On'] = on;
        if (on && k === 'views') state.floors = state.floorsOn = 0;   // 옆 자리를 함께 쓰므로 하나만 켠다
        if (on && k === 'floors') state.views = state.viewsOn = 0;
        sync();
      });
    });
    state.floors = flag('floors');
    TOGGLES.forEach(k => { state[k + 'On'] = state[k]; });

    function sync() {
      state.addOn = state.mode === 'add'; state.removeOn = state.mode === 'remove';
      Object.entries(buttons).forEach(([k, b]) => b.classList.toggle('on', !!state[k + 'On']));
      const unit = fitUnit();
      views.forEach(v => {
        v.extra.cnt.textContent = v.a.total + '개';
        v.extra.cnt.style.visibility = state.countOn ? 'visible' : 'hidden';
        v.extra.box.style.display = state.viewsOn || state.floorsOn ? '' : 'none';
        if (state.viewsOn) drawViews(v.extra.box, v.a, unit, !!state.numbersOn, onlyViews);
        else if (state.floorsOn) drawFloors(v.extra.box, v.a, unit);
        v.extra.box.classList.toggle('bv-two', !multi && !!state.floorsOn && v.a.max >= 3);
      });
    }
    sync();
  }

  /* ── 기본 모양 (같은 스타일을 슬라이드마다 다시 쓰지 않게 여기서 넣는다) ── */
  const css = `
  .blocks-viewer { position: relative; }
  .bv-ui { position: absolute; inset: 0; display: flex; flex-direction: column; gap: 24px; }
  .bv-row { flex: 1; min-height: 0; display: flex; gap: 32px; }
  .bv-col { flex: 1; min-width: 0; display: flex; gap: 24px; }
  .bv-multi .bv-col { flex-direction: column; }
  .bv-viewport { flex: 1; min-width: 0; min-height: 0; position: relative; cursor: grab; touch-action: none; }
  .bv-viewport:active { cursor: grabbing; }
  .bv-viewport.bv-editing { cursor: pointer; }
  .bv-canvas { position: absolute; left: 0; top: 0; display: block; }
  .bv-side { display: flex; flex-direction: column; align-items: center; gap: 12px; }
  .bv-ui:not(.bv-multi) .bv-side { justify-content: center; min-width: 260px; }
  .bv-label { font-size: 64px; font-weight: 800; color: #FFFFFF; line-height: 1; }
  .bv-count { font-size: 44px; font-weight: 800; color: #4CCB78; }
  .bv-views { display: flex; gap: 24px; align-items: flex-end; flex-wrap: wrap; justify-content: center; }
  .bv-ui:not(.bv-multi) .bv-views { flex-direction: column; align-items: center; gap: 28px; }
  .bv-ui:not(.bv-multi) .bv-views.bv-two { display: grid; grid-template-columns: repeat(2, auto); gap: 20px 28px; align-items: end; }
  .bv-view { display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .bv-view figcaption { font-size: 32px; font-weight: 700; color: #B7B7B7; }
  .bv-bar { display: flex; gap: 36px; justify-content: center; white-space: nowrap; }
  .bv-bar button { font: inherit; font-size: 30px; font-weight: 700; color: #B7B7B7; background: none; border: 0; padding: 4px 0; cursor: pointer; opacity: .75; }
  .bv-bar button:hover { opacity: 1; color: #FFFFFF; }
  .bv-bar button.on { color: #4CCB78; opacity: 1; }
  .bv-bar button.bv-end { margin-right: 32px; }
  `;
  const style = document.createElement('style'); style.setAttribute('data-runtime', ''); style.textContent = css;
  document.head.appendChild(style);

  function mountAll() { document.querySelectorAll('.blocks-viewer').forEach(mount); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountAll); else mountAll();
  window.BlocksViewer = { mount, mountAll, analyze };
})();
