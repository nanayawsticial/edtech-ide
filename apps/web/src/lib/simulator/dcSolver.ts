/**
 * A small DC circuit solver (nodal analysis) for Circuit Lab.
 *
 * Node 0 is ground. Every source is a voltage behind a series resistance (a board pin, a 5V rail),
 * stamped as its Norton equivalent, so the matrix only holds node voltages. LEDs and other diodes
 * are piecewise linear: off they barely conduct; on they are a forward voltage behind a small
 * resistance. The solver guesses which diodes conduct, solves, fixes any wrong guesses and solves
 * again until the guesses hold.
 */

export type DcElement =
  | { kind: 'resistor'; id: string; a: number; b: number; ohms: number }
  /** A voltage source from ground to `node`, behind `ohms`. */
  | { kind: 'source'; id: string; node: number; volts: number; ohms: number }
  | { kind: 'diode'; id: string; anode: number; cathode: number; forwardVolts: number; ohms: number };

export interface DcSolution {
  /** Voltage of each node (node 0 is 0 V). */
  voltages: number[];
  /** Current through each element, by id: resistor a->b, source out of the source into its node, diode anode->cathode. */
  currents: Record<string, number>;
  /** False for nodes no part ties to a source or ground (their voltage means nothing). */
  driven: boolean[];
  /** Diode ids that conduct. */
  conducting: Set<string>;
}

const OFF_CONDUCTANCE = 1e-9;
const GMIN = 1e-12;
const MAX_DIODE_PASSES = 30;

function solveLinear(matrix: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  const a = matrix.map((row, index) => [...row, rhs[index]]);
  for (let column = 0; column < n; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < n; row += 1) {
      if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) pivot = row;
    }
    if (Math.abs(a[pivot][column]) < 1e-18) continue;
    [a[column], a[pivot]] = [a[pivot], a[column]];
    for (let row = 0; row < n; row += 1) {
      if (row === column) continue;
      const factor = a[row][column] / a[column][column];
      if (factor === 0) continue;
      for (let k = column; k <= n; k += 1) a[row][k] -= factor * a[column][k];
    }
  }
  return a.map((row, index) => (Math.abs(row[index]) < 1e-18 ? 0 : row[n] / row[index]));
}

export function solveDc(nodeCount: number, elements: DcElement[]): DcSolution {
  const unknowns = Math.max(0, nodeCount - 1);
  const conducting = new Set<string>();
  let voltages = new Array(nodeCount).fill(0);

  const stamp = (matrix: number[][], a: number, b: number, conductance: number) => {
    if (a > 0) matrix[a - 1][a - 1] += conductance;
    if (b > 0) matrix[b - 1][b - 1] += conductance;
    if (a > 0 && b > 0) {
      matrix[a - 1][b - 1] -= conductance;
      matrix[b - 1][a - 1] -= conductance;
    }
  };
  const inject = (rhs: number[], node: number, current: number) => {
    if (node > 0) rhs[node - 1] += current;
  };

  for (let pass = 0; pass < MAX_DIODE_PASSES; pass += 1) {
    const matrix = Array.from({ length: unknowns }, () => new Array(unknowns).fill(0));
    const rhs = new Array(unknowns).fill(0);
    for (let index = 0; index < unknowns; index += 1) matrix[index][index] += GMIN;

    for (const element of elements) {
      if (element.kind === 'resistor') {
        stamp(matrix, element.a, element.b, 1 / Math.max(element.ohms, 1e-3));
      } else if (element.kind === 'source') {
        const conductance = 1 / Math.max(element.ohms, 1e-3);
        stamp(matrix, element.node, 0, conductance);
        inject(rhs, element.node, element.volts * conductance);
      } else if (conducting.has(element.id)) {
        const conductance = 1 / Math.max(element.ohms, 1e-3);
        stamp(matrix, element.anode, element.cathode, conductance);
        inject(rhs, element.anode, element.forwardVolts * conductance);
        inject(rhs, element.cathode, -element.forwardVolts * conductance);
      } else {
        stamp(matrix, element.anode, element.cathode, OFF_CONDUCTANCE);
      }
    }

    voltages = [0, ...solveLinear(matrix, rhs)];

    let changed = false;
    for (const element of elements) {
      if (element.kind !== 'diode') continue;
      const across = voltages[element.anode] - voltages[element.cathode];
      const on = conducting.has(element.id);
      if (!on && across > element.forwardVolts + 1e-6) {
        conducting.add(element.id);
        changed = true;
      } else if (on && (across - element.forwardVolts) / element.ohms < -1e-9) {
        conducting.delete(element.id);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const currents: Record<string, number> = {};
  for (const element of elements) {
    if (element.kind === 'resistor') {
      currents[element.id] = (voltages[element.a] - voltages[element.b]) / Math.max(element.ohms, 1e-3);
    } else if (element.kind === 'source') {
      currents[element.id] = (element.volts - voltages[element.node]) / Math.max(element.ohms, 1e-3);
    } else {
      const across = voltages[element.anode] - voltages[element.cathode];
      currents[element.id] = conducting.has(element.id) ? (across - element.forwardVolts) / element.ohms : across * OFF_CONDUCTANCE;
    }
  }

  // A node is driven when some path of real (not "off") elements reaches a source or ground.
  const neighbours: number[][] = Array.from({ length: nodeCount }, () => []);
  const link = (a: number, b: number) => {
    neighbours[a].push(b);
    neighbours[b].push(a);
  };
  const driven = new Array(nodeCount).fill(false);
  const queue: number[] = [0];
  driven[0] = true;
  for (const element of elements) {
    if (element.kind === 'resistor') link(element.a, element.b);
    else if (element.kind === 'diode' && conducting.has(element.id)) link(element.anode, element.cathode);
    else if (element.kind === 'source' && !driven[element.node]) {
      driven[element.node] = true;
      queue.push(element.node);
    }
  }
  while (queue.length > 0) {
    const node = queue.shift()!;
    for (const next of neighbours[node]) {
      if (!driven[next]) {
        driven[next] = true;
        queue.push(next);
      }
    }
  }

  return { voltages, currents, driven, conducting };
}
