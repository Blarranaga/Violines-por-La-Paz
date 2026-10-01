// ChessMind - Tutor con Evaluación Invisible
// Corrección clave: chessboard.js busca las imágenes de piezas en "img/chesspieces/..."
// (ruta local que no existe en GitHub Pages). Se apunta a un CDN con pieceTheme.
const PIECE_THEME = 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png';

const POSITIONS = [
  {
    id: 1,
    fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
    description: "Es tu turno. Elige el mejor desarrollo para tus piezas negras.",
    difficulty: 900,
    best: ["Nf6"],        // jugada ideal (1 punto)
    acceptable: ["Bc5"]   // jugada razonable (0.5 puntos)
  },
  {
    id: 2,
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 5 4",
    description: "Las blancas acaban de enrocar. ¿Cómo reaccionas?",
    difficulty: 1100,
    best: ["Nxe4"],
    acceptable: ["Bc5", "d6"]
  }
];

const K = 40; // sensibilidad del ajuste de Elo
let playerElo = 1000;
let game = new Chess();
let board = null;
let current = null;
let startTime = 0;
let locked = false;
const played = new Set();

/* ---------- Agente de Evidencia: registra acciones observables ---------- */
const evidenceAgent = {
  log: [],
  record(pos, san, score, seconds) {
    this.log.push({ id: pos.id, san, score, seconds: +seconds.toFixed(1), difficulty: pos.difficulty });
  }
};

/* ---------- Agente de Evaluación: infiere el nivel a partir de la evidencia ---------- */
const assessmentAgent = {
  update(pos, score) {
    const expected = 1 / (1 + Math.pow(10, (pos.difficulty - playerElo) / 400));
    playerElo = Math.round(playerElo + K * (score - expected));
  },
  tacticalVision() {
    const l = evidenceAgent.log;
    if (!l.length) return 50;
    return Math.round(100 * l.reduce((a, e) => a + e.score, 0) / l.length);
  }
};

/* ---------- Agente Adaptativo: elige el siguiente ejercicio ---------- */
const adaptiveAgent = {
  next() {
    const pending = POSITIONS.filter(p => !played.has(p.id));
    if (!pending.length) return null;
    return pending.reduce((a, b) =>
      Math.abs(a.difficulty - playerElo) <= Math.abs(b.difficulty - playerElo) ? a : b);
  }
};

/* ---------- Agente de Reporte: perfil final de competencias ---------- */
const reportingAgent = {
  build() {
    const l = evidenceAgent.log;
    const avgTime = l.reduce((a, e) => a + e.seconds, 0) / (l.length || 1);
    return {
      eloFinalEstimado: playerElo,
      nivel: playerElo >= 1050 ? "Intermedio" : "Principiante",
      visionTactica: assessmentAgent.tacticalVision() + "%",
      tiempoPromedioSeg: +avgTime.toFixed(1),
      jugadas: l.map(e => ({ posicion: e.id, jugada: e.san, puntaje: e.score, seg: e.seconds })),
      recomendacion: playerElo >= 1050
        ? "Practica tácticas de captura central y seguridad del rey."
        : "Sigue practicando el desarrollo de piezas en la apertura."
    };
  }
};

/* ---------- Interfaz ---------- */
function initGame() {
  loadPosition(adaptiveAgent.next());
}

function loadPosition(pos) {
  current = pos;
  locked = false;
  game.load(pos.fen);
  const orientation = game.turn() === 'b' ? 'black' : 'white';

  if (!board) {
    board = Chessboard('board', {
      position: pos.fen,
      orientation: orientation,
      draggable: true,
      pieceTheme: PIECE_THEME,
      onDragStart: handleDragStart,
      onDrop: handleMove,
      onSnapEnd: () => board.position(game.fen())
    });
  } else {
    board.orientation(orientation);
    board.position(pos.fen, false);
  }
  document.getElementById('mission-desc').innerText = pos.description;
  startTime = performance.now();
}

function handleDragStart(source, piece) {
  if (locked || game.game_over()) return false;
  // Solo se pueden mover las piezas del bando que tiene el turno
  const side = game.turn();
  return piece.charAt(0) === side;
}

function handleMove(source, target) {
  const seconds = (performance.now() - startTime) / 1000;
  const move = game.move({ from: source, to: target, promotion: 'q' });
  if (move === null) return 'snapback';

  locked = true;
  const score = current.best.includes(move.san) ? 1
              : current.acceptable.includes(move.san) ? 0.5 : 0;

  evidenceAgent.record(current, move.san, score, seconds);
  assessmentAgent.update(current, score);
  played.add(current.id);

  document.getElementById('elo-display').innerText = playerElo;
  document.getElementById('tactics-bar').style.width = assessmentAgent.tacticalVision() + '%';

  const next = adaptiveAgent.next();
  if (next) setTimeout(() => loadPosition(next), 700);
  else showResults();
}

function showResults() {
  document.getElementById('mission-box').classList.add('hidden');
  document.getElementById('feedback-box').classList.remove('hidden');
  document.getElementById('profile-output').innerText =
    JSON.stringify(reportingAgent.build(), null, 2);
}

$(document).ready(initGame);
