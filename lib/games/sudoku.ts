// lib/games/sudoku.ts
// A small Sudoku engine: generate puzzle, solve, validate, count solutions (for uniqueness).

export type Difficulty = "easy" | "medium" | "hard";

export type SudokuPuzzle = {
  puzzle: number[]; // 81 length, 0 = empty
  solution: number[]; // 81 length, solved
};

const SIZE = 9;
const BOX = 3;

function idx(r: number, c: number) {
  return r * SIZE + c;
}

function clone(g: number[]) {
  return g.slice();
}

function shuffle<T>(arr: T[]) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function isValidMove(grid: number[], r: number, c: number, val: number) {
  if (val < 1 || val > 9) return false;

  // row
  for (let cc = 0; cc < SIZE; cc++) {
    if (cc !== c && grid[idx(r, cc)] === val) return false;
  }
  // col
  for (let rr = 0; rr < SIZE; rr++) {
    if (rr !== r && grid[idx(rr, c)] === val) return false;
  }
  // box
  const br = Math.floor(r / BOX) * BOX;
  const bc = Math.floor(c / BOX) * BOX;
  for (let rr = br; rr < br + BOX; rr++) {
    for (let cc = bc; cc < bc + BOX; cc++) {
      if ((rr !== r || cc !== c) && grid[idx(rr, cc)] === val) return false;
    }
  }
  return true;
}

export function getCandidates(grid: number[], r: number, c: number): number[] {
  if (grid[idx(r, c)] !== 0) return [];
  const cand: number[] = [];
  for (let v = 1; v <= 9; v++) if (isValidMove(grid, r, c, v)) cand.push(v);
  return cand;
}

function findNextEmptyMRV(grid: number[]) {
  // Minimum Remaining Values heuristic: pick empty cell with fewest candidates
  let best: { r: number; c: number; cand: number[] } | null = null;

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (grid[idx(r, c)] !== 0) continue;
      const cand = getCandidates(grid, r, c);
      if (cand.length === 0) return { r, c, cand: [] }; // dead end
      if (!best || cand.length < best.cand.length) best = { r, c, cand };
      if (best && best.cand.length === 1) return best;
    }
  }
  return best; // null if no empty => solved
}

export function solveSudoku(grid: number[]): number[] | null {
  const g = clone(grid);

  function backtrack(): boolean {
    const next = findNextEmptyMRV(g);
    if (!next) return true; // solved

    const { r, c, cand } = next;
    if (cand.length === 0) return false;

    for (const v of shuffle(cand)) {
      g[idx(r, c)] = v;
      if (backtrack()) return true;
      g[idx(r, c)] = 0;
    }
    return false;
  }

  const ok = backtrack();
  return ok ? g : null;
}

export function countSolutions(grid: number[], limit = 2): number {
  // counts up to `limit` solutions; used to enforce uniqueness while generating
  const g = clone(grid);
  let count = 0;

  function backtrack(): void {
    if (count >= limit) return;
    const next = findNextEmptyMRV(g);
    if (!next) {
      count += 1;
      return;
    }
    const { r, c, cand } = next;
    if (cand.length === 0) return;

    for (const v of cand) {
      g[idx(r, c)] = v;
      backtrack();
      g[idx(r, c)] = 0;
      if (count >= limit) return;
    }
  }

  backtrack();
  return count;
}

function generateSolvedGrid(): number[] {
  // start from empty and solve with randomized candidate order
  const empty = new Array(81).fill(0);
  const solved = solveSudoku(empty);
  if (!solved) throw new Error("Could not generate solved Sudoku");
  return solved;
}

function targetClues(difficulty: Difficulty) {
  // higher clues = easier
  if (difficulty === "easy") return 40;   // ~40-45 clues
  if (difficulty === "medium") return 32; // ~32-36 clues
  return 26;                               // ~24-28 clues
}

export function generatePuzzle(difficulty: Difficulty): SudokuPuzzle {
  const solution = generateSolvedGrid();
  let puzzle = clone(solution);

  const clues = targetClues(difficulty);
  const cells = shuffle([...Array(81)].map((_, i) => i));

  for (const i of cells) {
    if (puzzle.filter((n) => n !== 0).length <= clues) break;

    const backup = puzzle[i];
    puzzle[i] = 0;

    // enforce uniqueness (fast check)
    const solCount = countSolutions(puzzle, 2);
    if (solCount !== 1) puzzle[i] = backup;
  }

  return { puzzle, solution };
}

export function isSolvedCorrectly(current: number[], solution: number[]) {
  if (current.length !== 81 || solution.length !== 81) return false;
  for (let i = 0; i < 81; i++) if (current[i] !== solution[i]) return false;
  return true;
}

export function getConflicts(current: number[]) {
  // Returns a Set of indices that violate Sudoku rules (ignores zeros)
  const bad = new Set<number>();

  // check rows
  for (let r = 0; r < 9; r++) {
    const seen = new Map<number, number[]>();
    for (let c = 0; c < 9; c++) {
      const v = current[idx(r, c)];
      if (!v) continue;
      const list = seen.get(v) ?? [];
      list.push(idx(r, c));
      seen.set(v, list);
    }
    for (const [, list] of seen) if (list.length > 1) list.forEach((p) => bad.add(p));
  }

  // check cols
  for (let c = 0; c < 9; c++) {
    const seen = new Map<number, number[]>();
    for (let r = 0; r < 9; r++) {
      const v = current[idx(r, c)];
      if (!v) continue;
      const list = seen.get(v) ?? [];
      list.push(idx(r, c));
      seen.set(v, list);
    }
    for (const [, list] of seen) if (list.length > 1) list.forEach((p) => bad.add(p));
  }

  // check boxes
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      const seen = new Map<number, number[]>();
      for (let r = br * 3; r < br * 3 + 3; r++) {
        for (let c = bc * 3; c < bc * 3 + 3; c++) {
          const v = current[idx(r, c)];
          if (!v) continue;
          const list = seen.get(v) ?? [];
          list.push(idx(r, c));
          seen.set(v, list);
        }
      }
      for (const [, list] of seen) if (list.length > 1) list.forEach((p) => bad.add(p));
    }
  }

  return bad;
}
