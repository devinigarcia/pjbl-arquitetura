// Mini biblioteca para desenhar os diagramas do projeto em SVG puro.
// A gente descreve caixas e setas em JavaScript (definicoes.mjs) e ela calcula
// quebra de texto, pontos de encaixe das setas e o SVG final. Sem dependências.

const FONT = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

// Paleta no estilo do C4 Model
const STYLES = {
  person: { fill: '#0b3d6e', stroke: '#072a4d', text: '#ffffff', tag: 'Pessoa' },
  system: { fill: '#1565b0', stroke: '#0e4a85', text: '#ffffff', tag: 'Sistema' },
  container: { fill: '#2f7fc8', stroke: '#1f5f9c', text: '#ffffff', tag: 'Container' },
  component: { fill: '#a9d0f5', stroke: '#5b9bd5', text: '#12263a', tag: 'Componente' },
  database: { fill: '#2f7fc8', stroke: '#1f5f9c', text: '#ffffff', tag: 'Banco de dados' },
  queue: { fill: '#2f7fc8', stroke: '#1f5f9c', text: '#ffffff', tag: 'Fila' },
  external: { fill: '#8c8c8c', stroke: '#6b6b6b', text: '#ffffff', tag: 'Sistema externo' },
  layer: { fill: '#eef4fb', stroke: '#9db7d3', text: '#1e3550', tag: '' },
  note: { fill: '#fff8dc', stroke: '#d8c56a', text: '#3d3a22', tag: '' },
};

const esc = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Quebra o texto em linhas que cabem na largura (estimativa pela largura média do caractere). */
export function wrap(text, width, fontSize) {
  const maxChars = Math.max(6, Math.floor(width / (fontSize * 0.54)));
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && (line + ' ' + word).length > maxChars) {
        lines.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    lines.push(line);
  }
  return lines;
}

function textBlock(lines, x, y, { size, weight = 400, fill, anchor = 'middle', italic = false, lineHeight = 1.25 }) {
  return lines
    .map(
      (line, index) =>
        `<text x="${x}" y="${(y + index * size * lineHeight).toFixed(1)}" font-size="${size}" font-weight="${weight}" ` +
        `fill="${fill}" text-anchor="${anchor}"${italic ? ' font-style="italic"' : ''}>${esc(line)}</text>`,
    )
    .join('');
}

function drawBox(box) {
  const style = STYLES[box.kind] ?? STYLES.container;
  const { x, y, w, h } = box;
  const cx = x + w / 2;
  const pad = 12;
  const parts = [];

  if (box.kind === 'person') {
    // cabeça + corpo, como no C4
    const headR = 15;
    parts.push(`<circle cx="${cx}" cy="${y + headR}" r="${headR}" fill="${style.fill}" stroke="${style.stroke}"/>`);
    parts.push(`<rect x="${x}" y="${y + headR * 2 - 4}" width="${w}" height="${h - headR * 2 + 4}" rx="14" fill="${style.fill}" stroke="${style.stroke}"/>`);
  } else if (box.kind === 'database') {
    const ry = 9;
    parts.push(
      `<path d="M${x},${y + ry} a${w / 2},${ry} 0 0 1 ${w},0 v${h - 2 * ry} a${w / 2},${ry} 0 0 1 ${-w},0 z" fill="${style.fill}" stroke="${style.stroke}"/>`,
      `<path d="M${x},${y + ry} a${w / 2},${ry} 0 0 0 ${w},0" fill="none" stroke="${style.stroke}"/>`,
    );
  } else if (box.kind === 'queue') {
    const rx = 10;
    parts.push(
      `<path d="M${x + rx},${y} h${w - 2 * rx} a${rx},${h / 2} 0 0 1 0,${h} h${-(w - 2 * rx)} a${rx},${h / 2} 0 0 1 0,${-h} z" fill="${style.fill}" stroke="${style.stroke}"/>`,
      `<path d="M${x + w - rx},${y} a${rx},${h / 2} 0 0 0 0,${h}" fill="none" stroke="${style.stroke}"/>`,
    );
  } else {
    const dash = box.kind === 'layer' ? ' stroke-dasharray="6 4"' : '';
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${box.kind === 'layer' ? 6 : 8}" fill="${style.fill}" stroke="${style.stroke}"${dash}/>`);
  }

  if (box.kind === 'layer') {
    parts.push(textBlock([box.title], x + 10, y + 18, { size: 12.5, weight: 700, fill: style.text, anchor: 'start' }));
    if (box.text) parts.push(textBlock([box.text], x + 10, y + 34, { size: 10.5, fill: '#4a6078', anchor: 'start', italic: true }));
    return parts.join('');
  }

  const titleSize = box.titleSize ?? 13.5;
  const bodySize = box.bodySize ?? 10.8;
  const titleLines = wrap(box.title, w - pad * 2, titleSize);
  const tag = box.tech ? `[${box.tagLabel ?? style.tag}: ${box.tech}]` : box.tagLabel === '' || !style.tag ? '' : `[${box.tagLabel ?? style.tag}]`;
  const tagLines = tag ? wrap(tag, w - pad * 2, 10) : [];
  const bodyLines = box.text ? wrap(box.text, w - pad * 2, bodySize) : [];

  const top = box.kind === 'person' ? y + 26 : box.kind === 'database' ? y + 12 : y;
  const contentHeight =
    titleLines.length * titleSize * 1.25 + tagLines.length * 10 * 1.3 + (bodyLines.length ? 6 + bodyLines.length * bodySize * 1.28 : 0);
  let cursor = top + (y + h - top - contentHeight) / 2 + titleSize;

  parts.push(textBlock(titleLines, cx, cursor, { size: titleSize, weight: 700, fill: style.text }));
  cursor += titleLines.length * titleSize * 1.25;
  if (tagLines.length) {
    parts.push(textBlock(tagLines, cx, cursor - 2, { size: 10, fill: style.text, lineHeight: 1.3 }));
    cursor += tagLines.length * 10 * 1.3;
  }
  if (bodyLines.length) {
    cursor += 6;
    parts.push(textBlock(bodyLines, cx, cursor, { size: bodySize, fill: style.text, lineHeight: 1.28 }));
  }
  return parts.join('');
}

/** Ponto onde a reta que sai do centro da caixa em direção a (tx, ty) cruza a borda dela. */
function edgePoint(box, tx, ty) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const scale = Math.min(Math.abs(dx) > 0 ? box.w / 2 / Math.abs(dx) : Infinity, Math.abs(dy) > 0 ? box.h / 2 / Math.abs(dy) : Infinity);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

function sidePoint(box, side, offset = 0) {
  switch (side) {
    case 'left':
      return { x: box.x, y: box.y + box.h / 2 + offset };
    case 'right':
      return { x: box.x + box.w, y: box.y + box.h / 2 + offset };
    case 'top':
      return { x: box.x + box.w / 2 + offset, y: box.y };
    default:
      return { x: box.x + box.w / 2 + offset, y: box.y + box.h };
  }
}

function drawArrow(arrow, boxes) {
  const from = boxes.get(arrow.from);
  const to = boxes.get(arrow.to);
  if (!from || !to) throw new Error(`Seta com caixa inexistente: ${arrow.from} -> ${arrow.to}`);

  const toCenter = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
  const fromCenter = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
  let start = arrow.fromSide ? sidePoint(from, arrow.fromSide, arrow.fromOffset) : edgePoint(from, toCenter.x, toCenter.y);
  let end = arrow.toSide ? sidePoint(to, arrow.toSide, arrow.toOffset) : edgePoint(to, fromCenter.x, fromCenter.y);
  // quando só um lado foi fixado, recalcula o outro mirando no ponto fixo
  if (arrow.fromSide && !arrow.toSide) end = edgePoint(to, start.x, start.y);
  if (arrow.toSide && !arrow.fromSide) start = edgePoint(from, end.x, end.y);

  const points = [start, ...(arrow.via ?? []), end];
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const dash = arrow.dashed ? ' stroke-dasharray="6 4"' : '';
  const color = arrow.color ?? '#4b5563';
  const parts = [`<path d="${path}" fill="none" stroke="${color}" stroke-width="1.5"${dash} marker-end="url(#seta)"/>`];

  if (arrow.label) {
    // rótulo no meio do trecho mais longo (ou onde labelAt mandar)
    let best = 0;
    let bestLength = -1;
    for (let index = 0; index < points.length - 1; index += 1) {
      const length = Math.hypot(points[index + 1].x - points[index].x, points[index + 1].y - points[index].y);
      if (length > bestLength) {
        bestLength = length;
        best = index;
      }
    }
    const t = arrow.labelAt ?? 0.5;
    const lx = points[best].x + (points[best + 1].x - points[best].x) * t + (arrow.labelDx ?? 0);
    const ly = points[best].y + (points[best + 1].y - points[best].y) * t + (arrow.labelDy ?? 0);
    const size = 10.2;
    const lines = wrap(arrow.label, arrow.labelWidth ?? 150, size);
    const width = Math.max(...lines.map((line) => line.length)) * size * 0.54 + 10;
    const height = lines.length * size * 1.25 + 6;
    parts.push(`<rect x="${(lx - width / 2).toFixed(1)}" y="${(ly - height / 2).toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" rx="3" fill="#ffffff" fill-opacity="0.93"/>`);
    parts.push(textBlock(lines, lx, ly - height / 2 + size + 2, { size, fill: '#1f2937' }));
  }
  return parts.join('');
}

function frame(width, height, title, subtitle, body) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="${FONT}" role="img" aria-label="${esc(title)}">` +
    '<defs><marker id="seta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#4b5563"/></marker></defs>' +
    `<rect width="${width}" height="${height}" fill="#ffffff"/>` +
    `<text x="20" y="28" font-size="17" font-weight="700" fill="#12263a">${esc(title)}</text>` +
    (subtitle ? `<text x="20" y="46" font-size="11.5" fill="#5b6b7c">${esc(subtitle)}</text>` : '') +
    body +
    '</svg>'
  );
}

/** Diagrama de caixas e setas (C4, camadas, implantação). */
export function boxDiagram({ width, height, title, subtitle, boxes, arrows = [], legend = true }) {
  const index = new Map(boxes.map((box) => [box.id, box]));
  // camadas/grupos primeiro (ficam no fundo), depois setas, depois as caixas por cima
  const layers = boxes.filter((box) => box.kind === 'layer').map(drawBox).join('');
  const lines = arrows.map((arrow) => drawArrow(arrow, index)).join('');
  const nodes = boxes.filter((box) => box.kind !== 'layer').map(drawBox).join('');

  let legendSvg = '';
  if (legend) {
    const kinds = [...new Set(boxes.map((box) => box.kind))].filter((kind) => STYLES[kind]?.tag);
    let x = 20;
    legendSvg = kinds
      .map((kind) => {
        const style = STYLES[kind];
        const item =
          `<rect x="${x}" y="${height - 24}" width="14" height="12" rx="2" fill="${style.fill}" stroke="${style.stroke}"/>` +
          `<text x="${x + 19}" y="${height - 14}" font-size="10.5" fill="#44546a">${esc(style.tag)}</text>`;
        x += 30 + style.tag.length * 6;
        return item;
      })
      .join('');
  }
  return frame(width, height, title, subtitle, layers + lines + nodes + legendSvg);
}

/** Diagrama de sequência simples: participantes em colunas, mensagens de cima para baixo. */
export function sequenceDiagram({ title, subtitle, participants, steps, width = 1000 }) {
  const top = 70;
  const headH = 44;
  const margin = 95;
  const gap = (width - margin * 2) / (participants.length - 1);
  const xOf = new Map(participants.map((participant, index) => [participant.id, margin + gap * index]));
  const headW = Math.min(150, gap - 14);

  let y = top + headH + 30;
  const body = [];

  for (const step of steps) {
    if (step.note) {
      const ids = step.over ?? participants.map((participant) => participant.id);
      const xs = ids.map((id) => xOf.get(id));
      const x1 = Math.min(...xs) - 60;
      const x2 = Math.max(...xs) + 60;
      const lines = wrap(step.note, x2 - x1 - 16, 10.5);
      const h = lines.length * 13.5 + 10;
      body.push(`<rect x="${x1}" y="${y - 12}" width="${x2 - x1}" height="${h}" rx="4" fill="${STYLES.note.fill}" stroke="${STYLES.note.stroke}"/>`);
      body.push(textBlock(lines, (x1 + x2) / 2, y + 2, { size: 10.5, fill: STYLES.note.text, lineHeight: 1.28 }));
      y += h + 14;
      continue;
    }

    const x1 = xOf.get(step.from);
    const x2 = xOf.get(step.to);
    const dash = step.kind === 'reply' ? ' stroke-dasharray="5 4"' : '';
    const color = step.kind === 'async' ? '#b45309' : '#374151';
    const text = step.num !== undefined ? `${step.num}. ${step.text}` : step.text;
    const labelLines = wrap(text, Math.max(Math.abs(x2 - x1) - 16, 190), 10.5);

    if (x1 === x2) {
      // chamada para si mesmo
      body.push(`<path d="M${x1},${y - 8} h34 v16 h-34" fill="none" stroke="${color}" stroke-width="1.4" marker-end="url(#seta)"/>`);
      body.push(textBlock(labelLines, x1 + 42, y + 4, { size: 10.5, fill: '#1f2937', anchor: 'start' }));
      y += Math.max(44, labelLines.length * 13.5 + 26);
      continue;
    }

    // rótulos com mais de uma linha empurram a seta para baixo, para não invadir a mensagem anterior
    y += (labelLines.length - 1) * 13.2;
    const textY = y - 6 - (labelLines.length - 1) * 13.2;
    body.push(textBlock(labelLines, (x1 + x2) / 2, textY, { size: 10.5, fill: '#1f2937' }));
    body.push(`<path d="M${x1},${y} L${x2},${y}" fill="none" stroke="${color}" stroke-width="1.4"${dash} marker-end="url(#seta)"/>`);
    y += 38 + (step.spaceAfter ?? 0);
  }

  const height = y + 30;
  const heads = participants
    .map((participant) => {
      const x = xOf.get(participant.id);
      const style = STYLES[participant.kind ?? 'container'];
      const lines = wrap(participant.label, headW - 10, 11.5);
      return (
        `<line x1="${x}" y1="${top + headH}" x2="${x}" y2="${height - 18}" stroke="#9aa5b1" stroke-dasharray="4 4"/>` +
        `<rect x="${x - headW / 2}" y="${top}" width="${headW}" height="${headH}" rx="6" fill="${style.fill}" stroke="${style.stroke}"/>` +
        textBlock(lines, x, top + headH / 2 + 4 - (lines.length - 1) * 7, { size: 11.5, weight: 700, fill: style.text })
      );
    })
    .join('');

  return frame(width, height, title, subtitle, heads + body.join(''));
}
