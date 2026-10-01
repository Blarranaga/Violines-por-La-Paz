// ChessMind - Tutor de ajedrez con evaluación invisible
// Las imágenes de piezas se cargan desde un CDN (la ruta local por defecto no existe en GitHub Pages).
const PIECE_THEME = 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png';

// Cada posición se construye jugando SAN desde el inicio (garantiza FEN válidos).
const POSITIONS = [
  { id: 1, theme: "Táctica", difficulty: 700,
    moves: ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6"],
    description: "Juegas con blancas. Las negras acaban de jugar Cf6 atacando tu dama. ¿Hay algo mejor que retirarla?",
    best: ["Qxf7"], acceptable: [],
    hint: "Mira f7: ¿cuántas piezas la atacan y cuántas la defienden?",
    why: "Dxf7# es mate: f7 está atacada por dama y alfil y defendida solo por el rey, que no puede huir. Siempre revisa f7/f2 en la apertura.",
    generic: "Esa jugada deja pasar un mate en 1. Antes de mover, revisa los jaques y capturas disponibles." },
  { id: 2, theme: "Apertura", difficulty: 800,
    moves: ["e4", "e5", "Nf3"],
    description: "Las blancas atacan tu peón de e5. ¿Cómo lo defiendes desarrollando una pieza?",
    best: ["Nc6"], acceptable: ["d6", "Nf6"],
    hint: "Busca una pieza que defienda e5 y a la vez se desarrolle hacia el centro.",
    why: "Cc6 defiende e5, desarrolla un caballo y controla el centro.",
    generic: "No defiende e5 ni desarrolla pieza. Principios: controlar el centro, desarrollar, enrocar.",
    mistakes: { f6: "f6 defiende e5, pero bloquea la casilla natural del caballo y debilita a tu rey." } },
  { id: 3, theme: "Apertura", difficulty: 900,
    moves: ["e4", "e5", "Nf3", "Nc6", "Bc4"],
    description: "Es tu turno. Elige el mejor desarrollo para tus piezas negras.",
    best: ["Nf6"], acceptable: ["Bc5"],
    hint: "Desarrolla el caballo de rey a una casilla que presione el centro.",
    why: "Cf6 desarrolla, ataca el peón e4 y prepara el enroque.",
    generic: "Esa jugada no desarrolla pieza ni controla el centro. Prioriza desarrollar antes de mover peones de nuevo." },
  { id: 4, theme: "Defensa", difficulty: 1000,
    moves: ["e4", "e5", "Bc4", "Nc6", "Qh5"],
    description: "Las blancas amenazan tu peón de f7 (¡mate pastor!). Defiéndete con las negras.",
    best: ["g6", "Qe7"], acceptable: ["Nh6"],
    hint: "Ataca a la dama con un peón o defiende f7. Ojo: atacar la dama con el caballo de g8 no sirve.",
    why: "g6 (o De7) neutraliza la amenaza en f7; con g6 la dama blanca debe retirarse, y Dxe5+ pierde a la dama por Cxe5.",
    generic: "Esa jugada no resuelve la amenaza sobre f7. Cuenta atacantes y defensores de f7.",
    mistakes: { Nf6: "¡Error clásico! Cf6 ataca la dama, pero f7 sigue indefensa: Dxf7# es mate en 1." } },
  { id: 5, theme: "Táctica", difficulty: 1100,
    moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "O-O"],
    description: "Las blancas acaban de enrocar. ¿Cómo reaccionas?",
    best: ["Nxe4"], acceptable: ["Bc5"],
    hint: "Revisa si alguna pieza blanca está sin defender.",
    why: "Cxe4 captura un peón central: e4 no está bien defendido. Si Te1, el caballo se retira con Cd6.",
    generic: "Perdiste la oportunidad de capturar material. Antes de desarrollar más, busca piezas o peones sin defensa." }
];

const K = 40;
let playerElo = 1000, game = new Chess(), board = null;
let current = null, startTime = 0, locked = false, attempts = 0, hintUsed = false, gaveFirst = false;
const played = new Set();
const $id = id => document.getElementById(id);

/* ---------- Agente de Evidencia ---------- */
const evidenceAgent = {
  log: [],
  record(pos, san, score, seconds, hint) {
    this.log.push({ id: pos.id, theme: pos.theme, san, score, seconds: +seconds.toFixed(1), hint, difficulty: pos.difficulty });
  }
};

/* ---------- Agente de Evaluación ---------- */
const assessmentAgent = {
  update(pos, score) {
    const expected = 1 / (1 + Math.pow(10, (pos.difficulty - playerElo) / 400));
    playerElo = Math.round(playerElo + K * (score - expected));
  },
  tacticalVision() {
    const l = evidenceAgent.log;
    return l.length ? Math.round(100 * l.reduce((a, e) => a + e.score, 0) / l.length) : 50;
  },
  byTheme() {
    const t = {};
    evidenceAgent.log.forEach(e => { (t[e.theme] = t[e.theme] || []).push(e.score); });
    return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round(100 * v.reduce((a, b) => a + b, 0) / v.length) + "%"]));
  }
};

/* ---------- Agente Adaptativo ---------- */
const adaptiveAgent = {
  next() {
    const pending = POSITIONS.filter(p => !played.has(p.id));
    if (!pending.length) return null;
    if (!played.size) return pending.reduce((a, b) => a.difficulty <= b.difficulty ? a : b); // calentamiento
    return pending.reduce((a, b) => Math.abs(a.difficulty - playerElo) <= Math.abs(b.difficulty - playerElo) ? a : b);
  }
};

/* ---------- Agente de Reporte ---------- */
const reportingAgent = {
  build() {
    const l = evidenceAgent.log, themes = assessmentAgent.byTheme();
    const weakest = Object.entries(themes).sort((a, b) => parseInt(a[1]) - parseInt(b[1]))[0];
    return {
      eloFinalEstimado: playerElo,
      nivel: playerElo >= 1150 ? "Avanzado" : playerElo >= 1000 ? "Intermedio" : "Principiante",
      visionTactica: assessmentAgent.tacticalVision() + "%",
      desempenoPorTema: themes,
      pistasUsadas: l.filter(e => e.hint).length,
      tiempoPromedioSeg: +(l.reduce((a, e) => a + e.seconds, 0) / (l.length || 1)).toFixed(1),
      recomendacion: weakest ? "Refuerza el tema: " + weakest[0] + "." : ""
    };
  }
};

/* ---------- Interfaz del tutor ---------- */
function say(html, cls) { $id('tutor-msg').innerHTML = '<span class="' + (cls || '') + '">' + html + '</span>'; }
function show(id, v) { $id(id).classList.toggle('hidden', !v); }
const norm = san => san.replace(/[+#]/g, '');
const pretty = san => san.replace(/^N/, 'C').replace(/^B/, 'A').replace(/^R/, 'T').replace(/^Q/, 'D').replace(/^K/, 'R');

function initGame() {
  $id('hint-btn').onclick = giveHint;
  $id('retry-btn').onclick = retry;
  $id('next-btn').onclick = goNext;
  loadPosition(adaptiveAgent.next());
}

function loadPosition(pos) {
  current = pos; locked = false; attempts = 0; hintUsed = false;
  game = new Chess();
  pos.moves.forEach(m => game.move(m));
  const orientation = game.turn() === 'b' ? 'black' : 'white';
  if (!board) {
    board = Chessboard('board', {
      position: game.fen(), orientation, draggable: true, pieceTheme: PIECE_THEME,
      onDragStart: (src, piece) => !locked && !game.game_over() && piece.charAt(0) === game.turn(),
      onDrop: handleMove,
      onSnapEnd: () => board.position(game.fen())
    });
  } else {
    board.orientation(orientation);
    board.position(game.fen(), false);
  }
  $id('mission-meta').innerText = "Ejercicio " + (played.size + 1) + " de " + POSITIONS.length + " · " + pos.theme;
  $id('mission-desc').innerText = pos.description;
  say("Arrastra una pieza para responder. Si te atoras, pide una pista.");
  show('hint-btn', true); show('retry-btn', false); show('next-btn', false);
  startTime = performance.now();
}

function giveHint() {
  hintUsed = true;
  say("💡 " + current.hint, "warn");
}

function handleMove(source, target) {
  const seconds = (performance.now() - startTime) / 1000;
  const move = game.move({ from: source, to: target, promotion: 'q' });
  if (move === null) return 'snapback';

  locked = true; attempts++;
  const san = norm(move.san);
  const raw = current.best.includes(san) ? 1 : current.acceptable.includes(san) ? 0.5 : 0;
  const bestTxt = current.best.map(pretty).join(" o ");

  // Solo el primer intento alimenta la evaluación (el reintento es para aprender)
  if (attempts === 1) {
    const score = Math.max(0, raw - (hintUsed && raw > 0 ? 0.25 : 0));
    evidenceAgent.record(current, move.san, score, seconds, hintUsed);
    assessmentAgent.update(current, score);
    played.add(current.id);
    $id('elo-display').innerText = playerElo;
    $id('tactics-bar').style.width = assessmentAgent.tacticalVision() + '%';
  }

  show('hint-btn', false);
  if (raw === 1) {
    say("✅ <b>¡Excelente!</b> " + current.why, "ok");
  } else if (raw === 0.5) {
    say("👍 <b>Buena jugada</b>, pero hay una mejor: <b>" + bestTxt + "</b>. " + current.why, "warn");
  } else {
    const msg = (current.mistakes && current.mistakes[san]) || current.generic;
    say("❌ " + msg + (attempts >= 2 ? " La mejor era <b>" + bestTxt + "</b>. " + current.why : " Inténtalo de nuevo."), "bad");
  }
  show('retry-btn', raw < 1 && attempts < 2);
  show('next-btn', raw >= 0.5 || attempts >= 2);
  if (raw === 0 && attempts < 2) show('next-btn', true); // permite avanzar aunque no reintente
}

function retry() {
  game.undo();
  board.position(game.fen());
  locked = false;
  show('retry-btn', false); show('next-btn', false); show('hint-btn', true);
  say("Intenta otra jugada.");
  startTime = performance.now();
}

function goNext() {
  const next = adaptiveAgent.next();
  if (next) loadPosition(next); else showResults();
}

function showResults() {
  show('mission-box', false); show('tutor-box', false); show('feedback-box', true);
  $id('profile-output').innerText = JSON.stringify(reportingAgent.build(), null, 2);
}

$(document).ready(initGame);
