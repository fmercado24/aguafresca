// Poligonización de un dibujo de líneas: arma el grafo plano (cortando las líneas donde se cruzan),
// completa uniones que el dibujante dejó abiertas y recorre las caras cerradas. Unidades: metros.

export const distanciaASegmento = (p, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
  let t = L2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  const q = { x: a.x + t * dx, y: a.y + t * dy };
  return { d: Math.hypot(p.x - q.x, p.y - q.y), q, t };
};

/** segs: [[{x,y},{x,y}], …] → { vertices, vecinos } con los vértices fusionados a menos de `eps` metros. */
export function grafo(segs, eps = 0.05) {
  const cortes = segs.map(() => [0, 1]);
  const cajas = segs.map(([a, b]) => [Math.min(a.x, b.x) - eps, Math.min(a.y, b.y) - eps, Math.max(a.x, b.x) + eps, Math.max(a.y, b.y) + eps]);
  for (let i = 0; i < segs.length; i++) {
    const A = segs[i], ca = cajas[i];
    for (let j = i + 1; j < segs.length; j++) {
      const cb = cajas[j];
      if (cb[0] > ca[2] || cb[2] < ca[0] || cb[1] > ca[3] || cb[3] < ca[1]) continue;
      const B = segs[j];
      const r = { x: A[1].x - A[0].x, y: A[1].y - A[0].y }, s = { x: B[1].x - B[0].x, y: B[1].y - B[0].y };
      const den = r.x * s.y - r.y * s.x, q = { x: B[0].x - A[0].x, y: B[0].y - A[0].y };
      if (Math.abs(den) > 1e-12) {
        const t = (q.x * s.y - q.y * s.x) / den, u = (q.x * r.y - q.y * r.x) / den;
        if (t > 0 && t < 1 && u > 0 && u < 1) { cortes[i].push(t); cortes[j].push(u); }
      }
      // Uniones en T (un extremo que cae sobre la otra línea), también entre líneas superpuestas.
      for (const [P, S, k] of [[B[0], A, i], [B[1], A, i], [A[0], B, j], [A[1], B, j]]) {
        const pr = distanciaASegmento(P, S[0], S[1]);
        if (pr.d < eps) cortes[k].push(pr.t);
      }
    }
  }
  const vertices = [], rejilla = new Map(), celda = eps * 2;
  const idDe = (p) => {
    const cx = Math.floor(p.x / celda), cy = Math.floor(p.y / celda);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const k of rejilla.get(`${cx + dx},${cy + dy}`) ?? []) if (Math.hypot(vertices[k].x - p.x, vertices[k].y - p.y) < eps) return k;
    }
    vertices.push({ x: p.x, y: p.y });
    const c = `${cx},${cy}`;
    if (!rejilla.has(c)) rejilla.set(c, []);
    rejilla.get(c).push(vertices.length - 1);
    return vertices.length - 1;
  };
  const vecinos = [];
  const unir = (u, v) => {
    if (u === v) return;
    (vecinos[u] ||= new Set()).add(v);
    (vecinos[v] ||= new Set()).add(u);
  };
  segs.forEach((S, i) => {
    const ts = [...new Set(cortes[i].map((t) => Math.round(t * 1e9) / 1e9))].sort((a, b) => a - b);
    let previo = null;
    for (const t of ts) {
      const v = idDe({ x: S[0].x + t * (S[1].x - S[0].x), y: S[0].y + t * (S[1].y - S[0].y) });
      if (previo !== null) unir(previo, v);
      previo = v;
    }
  });
  for (let v = 0; v < vertices.length; v++) vecinos[v] ||= new Set();
  return { vertices, vecinos };
}

/**
 * Uniones que faltan en el dibujo: un extremo suelto se prolonga en su dirección hasta la línea más próxima
 * (hasta `prolongar` m), y cualquier vértice que quedó a menos de `acercar` m de otra línea se une a ella.
 * Devuelve los segmentos puente que hay que agregar.
 */
export function puentes({ vertices, vecinos }, { prolongar = 10, acercar = 3 } = {}) {
  const aristas = [];
  vecinos.forEach((n, u) => n.forEach((v) => { if (u < v) aristas.push([u, v]); }));
  const nuevos = [];
  vertices.forEach((P, v) => {
    const grado = vecinos[v].size;
    if (grado === 0) return;
    let cercano = null, rayo = null, dir = null;
    if (grado === 1) {
      const Q = vertices[[...vecinos[v]][0]];
      const L = Math.hypot(P.x - Q.x, P.y - Q.y);
      dir = { x: (P.x - Q.x) / L, y: (P.y - Q.y) / L };
    }
    for (const [a, b] of aristas) {
      if (a === v || b === v || vecinos[v].has(a) || vecinos[v].has(b)) continue;
      const A = vertices[a], B = vertices[b];
      const r = distanciaASegmento(P, A, B);
      if (r.d > 1e-3 && r.d < acercar && (!cercano || r.d < cercano.d)) cercano = r;
      if (dir) {
        const sx = B.x - A.x, sy = B.y - A.y, den = dir.x * sy - dir.y * sx;
        if (Math.abs(den) < 1e-9) continue;
        const qx = A.x - P.x, qy = A.y - P.y;
        const t = (qx * sy - qy * sx) / den, u = (qx * dir.y - qy * dir.x) / den;
        if (t > 1e-3 && t < prolongar && u >= 0 && u <= 1 && (!rayo || t < rayo.t)) rayo = { t, q: { x: P.x + t * dir.x, y: P.y + t * dir.y } };
      }
    }
    if (grado === 1 && rayo && (!cercano || rayo.t < cercano.d * 3)) nuevos.push([{ ...P }, rayo.q]);
    else if (cercano) nuevos.push([{ ...P }, cercano.q]);
  });
  return nuevos;
}

/** Caras acotadas del grafo (recorridas en sentido antihorario), con sus vértices y su área en m². */
export function caras({ vertices, vecinos }) {
  const vec = vecinos.map((n) => new Set(n));
  // Las líneas colgantes no encierran nada: se podan.
  let cambio = true;
  while (cambio) {
    cambio = false;
    vec.forEach((n, v) => {
      if (n.size === 1) { const [u] = n; n.delete(u); vec[u].delete(v); cambio = true; }
    });
  }
  const angulo = (u, v) => Math.atan2(vertices[v].y - vertices[u].y, vertices[v].x - vertices[u].x);
  const orden = vec.map((n, u) => [...n].sort((a, b) => angulo(u, a) - angulo(u, b)));
  const usado = new Set(), salida = [];
  for (let u = 0; u < vertices.length; u++) for (const v of orden[u]) {
    if (usado.has(`${u}>${v}`)) continue;
    const ids = [];
    let a = u, b = v, guardia = 0;
    while (!usado.has(`${a}>${b}`) && guardia++ < 1e6) {
      usado.add(`${a}>${b}`);
      ids.push(a);
      const lista = orden[b], i = lista.indexOf(a);
      const c = lista[(i - 1 + lista.length) % lista.length];
      a = b; b = c;
    }
    let area = 0;
    for (let k = 0; k < ids.length; k++) {
      const p = vertices[ids[k]], q = vertices[ids[(k + 1) % ids.length]];
      area += p.x * q.y - q.x * p.y;
    }
    if (area / 2 > 1) salida.push({ ids, pts: ids.map((k) => vertices[k]), area: area / 2 });
  }
  return salida;
}

export function dentro(p, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
